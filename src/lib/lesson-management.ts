import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminIdentity } from "./admin-auth";
import { readAdminTestEnvironment } from "./admin-test-mode";
import { LESSON_AUDIO_BUCKET, getLessonAudioFolder } from "./lesson-audio";
import type { Language } from "./lessons";
import { createServerSupabaseClient } from "./supabase/server";
import { createSecretSupabaseClient } from "./supabase/secret";

export type ManagedLesson = {
  id: string;
  draftId: string;
  title: string;
  language: Language;
  status: "draft" | "published" | "unpublished" | "deleting";
  versionCount: number;
  cleanupError: string | null;
};
type VersionRow = {
  id: string; lesson_id: string; title: string; language: Language;
  publication_status: "draft" | "published" | "unpublished" | "archived";
  published_at: string | null; deletion_started_at: string | null; cleanup_error: string | null;
};
export class LessonManagementError extends Error {
  constructor(readonly status: number, message: string, readonly retryable = false) { super(message); }
}
const CLEANUP_MESSAGE = "삭제가 완료되지 않았습니다. 일부 음성은 이미 삭제되었을 수 있습니다. 레슨은 숨김 상태로 유지됩니다. 삭제 정리를 다시 시도해 주세요.";

function secretClient() {
  const client = createSecretSupabaseClient();
  if (!client) throw new LessonManagementError(503, "서버 관리 키가 설정되지 않았습니다.");
  return client;
}

async function readVersions(client: SupabaseClient, admin: AdminIdentity, lessonId?: string) {
  const versions: VersionRow[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = client.from("lesson_drafts")
      .select("id, lesson_id, title, language, publication_status, published_at, deletion_started_at, cleanup_error")
      .eq("created_by", admin.id).order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(offset, offset + 499);
    if (lessonId) query = query.eq("lesson_id", lessonId);
    const { data, error } = await query;
    if (error) throw new LessonManagementError(503, "레슨 목록을 불러오지 못했습니다. 다시 시도해 주세요.");
    versions.push(...data as VersionRow[]);
    if (data.length < 500) return versions;
  }
}

export async function listManagedLessons(admin: AdminIdentity, lessonId?: string): Promise<ManagedLesson[]> {
  if (readAdminTestEnvironment()) return [];
  const client = await createServerSupabaseClient();
  if (!client) throw new LessonManagementError(503, "Supabase가 설정되지 않았습니다.");
  const groups = new Map<string, VersionRow[]>();
  for (const row of await readVersions(client, admin, lessonId)) {
    const group = groups.get(row.lesson_id) ?? [];
    group.push(row);
    groups.set(row.lesson_id, group);
  }
  return Array.from(groups, ([id, versions]) => {
    const root = versions.find(row => row.id === id)!;
    const current = versions.find(row => row.publication_status === "published")
      ?? versions.find(row => row.publication_status === "unpublished") ?? versions[0];
    return { id, draftId: current.id, title: current.title, language: current.language,
      status: root.deletion_started_at ? "deleting" : current.publication_status === "archived" ? "unpublished" : current.publication_status,
      versionCount: versions.filter(row => row.published_at).length, cleanupError: root.cleanup_error };
  });
}

function mutationError(code: string) {
  return new LessonManagementError(code === "P0002" ? 404 : 409,
    code === "P0002" ? "레슨을 찾을 수 없습니다." : "레슨이 변경되었습니다. 목록을 새로고침하고 다시 확인해 주세요.");
}

export async function unpublishLesson(admin: AdminIdentity, lessonId: string) {
  const { error } = await secretClient().rpc("unpublish_lesson", { p_lesson_id: lessonId, p_admin_id: admin.id });
  if (error) throw mutationError(error.code);
}

async function emptyVersionFolder(client: SupabaseClient, folder: string): Promise<void> {
  const bucket = client.storage.from(LESSON_AUDIO_BUCKET);
  // Delete a page, then read the first page again so deletion cannot skip objects.
  // Folder walking also covers legacy uploads made before flat-path enforcement.
  while (true) {
    const { data, error } = await bucket.list(folder, { limit: 1000, sortBy: { column: "name", order: "asc" } });
    if (error) throw error;
    if (!data.length) return;
    const paths: string[] = [];
    for (const item of data) {
      const path = `${folder}/${item.name}`;
      if (item.id) paths.push(path);
      else await emptyVersionFolder(client, path);
    }
    if (paths.length) {
      const { error } = await bucket.remove(paths);
      if (error) throw error;
    }
  }
}

export async function deleteLesson(admin: AdminIdentity, lessonId: string, confirmation: { title: string; draftId: string }) {
  const client = secretClient();
  const { error } = await client.rpc("begin_lesson_deletion", {
    p_lesson_id: lessonId, p_admin_id: admin.id,
    p_expected_draft_id: confirmation.draftId, p_confirm_title: confirmation.title
  });
  if (error) throw mutationError(error.code);
  try {
    const versions = await readVersions(client, admin, lessonId);
    // Oldest version first; every folder is derived from owned DB IDs, never a manifest path.
    for (const version of versions.toReversed()) {
      await emptyVersionFolder(client, getLessonAudioFolder(admin.id, version.id));
    }
    const { error } = await client.from("lesson_drafts").delete().eq("id", lessonId).eq("created_by", admin.id);
    if (error) throw error;
  } catch {
    // The durable deletion marker survives even if this error update also fails.
    await client.from("lesson_drafts").update({ cleanup_error: CLEANUP_MESSAGE }).eq("id", lessonId).eq("created_by", admin.id);
    throw new LessonManagementError(503, CLEANUP_MESSAGE, true);
  }
}
