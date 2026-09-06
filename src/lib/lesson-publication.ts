import "server-only";

import type { AdminIdentity } from "./admin-auth";
import { AudioContentValidationError, validateAudioContent } from "./audio-content-validation";
import {
  mapAudioPackage,
  type AudioPackageResult,
  type AudioPackageItem
} from "./audio-package";
import { decodeLessonDraftEntries } from "./lesson-entry-decoder";
import type { LessonDraftEntry } from "./lesson-draft-parser";
import { LESSON_AUDIO_BUCKET, getLessonAudioFolder, getLessonAudioPath } from "./lesson-audio";
import { createSecretSupabaseClient } from "./supabase/secret";
import { createServerSupabaseClient } from "./supabase/server";

export type PublishedAudioItem = AudioPackageItem & { path: string };

export class LessonPublicationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly result?: AudioPackageResult
  ) {
    super(message);
  }
}

function readEntries(value: unknown): LessonDraftEntry[] {
  const entries = decodeLessonDraftEntries(value);
  if (!entries) {
    throw new LessonPublicationError(500, "invalid-stored-draft", "저장된 레슨 초안 형식이 올바르지 않습니다.");
  }
  return entries;
}

export async function publishLessonDraft(admin: AdminIdentity, draftId: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    throw new LessonPublicationError(503, "supabase-unavailable", "Supabase가 설정되지 않았습니다.");
  }

  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select("id, lesson_id, created_by, parsed_entries, validation_issues, validation_status")
    .eq("id", draftId)
    .eq("created_by", admin.id)
    .maybeSingle();

  if (draftError) throw new LessonPublicationError(500, "draft-read-failed", draftError.message);
  if (!draft) throw new LessonPublicationError(404, "draft-not-found", "레슨 초안을 찾을 수 없습니다.");
  if (
    draft.validation_status !== "validated" ||
    !Array.isArray(draft.validation_issues) ||
    draft.validation_issues.length > 0
  ) {
    throw new LessonPublicationError(422, "text-draft-invalid", "텍스트 검증 오류를 먼저 해결해 주세요.");
  }

  const folder = getLessonAudioFolder(admin.id, draftId);
  const { data: storedFiles, error: storageError } = await supabase.storage
    .from(LESSON_AUDIO_BUCKET)
    .list(folder, { limit: 1000, sortBy: { column: "name", order: "asc" } });

  if (storageError) {
    throw new LessonPublicationError(500, "audio-list-failed", storageError.message);
  }

  const result = mapAudioPackage(
    readEntries(draft.parsed_entries),
    storedFiles.map((file) => ({
      name: file.name,
      size: Number(file.metadata?.size ?? 0),
      type: String(file.metadata?.mimetype ?? "")
    }))
  );

  if (!result.publishReady) {
    throw new LessonPublicationError(
      422,
      "audio-package-invalid",
      "문장별 음성 패키지를 완성한 뒤 다시 게시해 주세요.",
      result
    );
  }

  const contentIssues = await validateAudioContent(result.items, async (item, signal) => {
    const path = getLessonAudioPath(admin.id, draftId, item.canonicalName);
    const request = { headers: { Range: "bytes=0-11" }, cache: "no-store" as const, signal };
    const { data: audio, error: downloadError } = await supabase.storage
      .from(LESSON_AUDIO_BUCKET)
      .download(path, {}, request);
    if (downloadError || !audio) {
      throw downloadError ?? new Error("Empty audio response");
    }
    return new Uint8Array(await audio.slice(0, 12).arrayBuffer());
  }).catch(error => {
    if (error instanceof AudioContentValidationError) throw new LessonPublicationError(503, error.code, error.message);
    throw error;
  });
  if (contentIssues.length) {
    throw new LessonPublicationError(
      422,
      "audio-package-invalid",
      "실제 형식을 확인할 수 없는 음성 파일이 있습니다.",
      { ...result, publishReady: false, issues: contentIssues }
    );
  }

  const manifest: PublishedAudioItem[] = result.items.map((item) => ({
    ...item,
    path: getLessonAudioPath(admin.id, draftId, item.canonicalName)
  }));
  const secretSupabase = createSecretSupabaseClient();
  if (!secretSupabase) {
    throw new LessonPublicationError(503, "supabase-secret-unavailable", "서버 게시 키가 설정되지 않았습니다.");
  }
  const { error: publishError } = await secretSupabase.rpc("publish_lesson_draft", {
    p_draft_id: draftId,
    p_admin_id: admin.id,
    p_audio_manifest: manifest
  });

  if (publishError) {
    throw new LessonPublicationError(500, "publish-failed", publishError.message);
  }

  return { lessonId: draft.lesson_id as string, result };
}
