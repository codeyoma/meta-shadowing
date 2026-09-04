import "server-only";

import type { AdminIdentity } from "./admin-auth";
import {
  mapAudioPackage,
  type AudioPackageResult,
  type AudioPackageItem
} from "./audio-package";
import type { LessonDraftEntry } from "./lesson-draft-parser";
import { LESSON_AUDIO_BUCKET } from "./lesson-audio";
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

function isLessonDraftEntry(value: unknown): value is LessonDraftEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  if (!Number.isInteger(entry.sourceLine)) return false;

  if (entry.kind === "section") return true;
  if (entry.kind === "chapter") {
    return typeof entry.target === "string" && typeof entry.korean === "string";
  }
  return (
    entry.kind === "phrase" &&
    Number.isInteger(entry.phraseNumber) &&
    typeof entry.target === "string" &&
    typeof entry.korean === "string"
  );
}

function readEntries(value: unknown): LessonDraftEntry[] {
  if (!Array.isArray(value) || !value.every(isLessonDraftEntry)) {
    throw new LessonPublicationError(500, "invalid-stored-draft", "저장된 레슨 초안 형식이 올바르지 않습니다.");
  }
  return value;
}

export async function publishLessonDraft(admin: AdminIdentity, draftId: string) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) {
    throw new LessonPublicationError(503, "supabase-unavailable", "Supabase가 설정되지 않았습니다.");
  }

  const { data: draft, error: draftError } = await supabase
    .from("lesson_drafts")
    .select("id, created_by, parsed_entries, validation_issues, validation_status")
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

  const folder = `${admin.id}/${draftId}`;
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

  const manifest: PublishedAudioItem[] = result.items.map((item) => ({
    ...item,
    path: `${folder}/${item.canonicalName}`
  }));
  const { error: publishError } = await supabase
    .from("lesson_drafts")
    .update({
      audio_manifest: manifest,
      publication_status: "published",
      published_at: new Date().toISOString()
    })
    .eq("id", draftId)
    .eq("created_by", admin.id);

  if (publishError) {
    throw new LessonPublicationError(500, "publish-failed", publishError.message);
  }

  return { lessonId: draftId, result };
}
