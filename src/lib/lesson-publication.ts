import "server-only";

import { createHash } from "node:crypto";
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
import { hasSupportedAudioSignature } from "./audio-signature";

export type PublishedAudioItem = AudioPackageItem & { path: string; sha256?: string };

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
    .select("id, lesson_id, created_by, parsed_entries, validation_issues, validation_status, published_at, audio_manifest")
    .eq("id", draftId)
    .eq("created_by", admin.id)
    .maybeSingle();

  if (draftError) throw new LessonPublicationError(500, "draft-read-failed", draftError.message);
  if (!draft) throw new LessonPublicationError(404, "draft-not-found", "레슨 초안을 찾을 수 없습니다.");
  const secretSupabase = createSecretSupabaseClient();
  if (!secretSupabase) {
    throw new LessonPublicationError(503, "supabase-secret-unavailable", "서버 게시 키가 설정되지 않았습니다.");
  }
  // Republishing an immutable version must preserve its exact manifest, including
  // legacy versions that predate verified copies. Only replacement drafts upgrade.
  if (draft.published_at) {
    const { error } = await secretSupabase.rpc("publish_lesson_draft", {
      p_draft_id: draftId, p_admin_id: admin.id, p_audio_manifest: draft.audio_manifest,
    });
    if (error) throw new LessonPublicationError(500, "publish-failed", error.message);
    return { lessonId: draft.lesson_id as string, result: { publishReady: true, items: draft.audio_manifest as PublishedAudioItem[], issues: [] } };
  }
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
    storedFiles.filter(file => file.id).map((file) => ({
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

  const manifest: PublishedAudioItem[] = new Array(result.items.length);
  // Identical source clips share one immutable retained path. Do not race the
  // Storage backend's duplicate-upload cleanup against this publication's reads.
  const retainedCopies = new Map<string, Promise<void>>();
  const contentIssues = await validateAudioContent(result.items, async (item, signal) => {
    const path = getLessonAudioPath(admin.id, draftId, item.canonicalName);
    const request = { cache: "no-store" as const, signal };
    const { data: audio, error: downloadError } = await supabase.storage
      .from(LESSON_AUDIO_BUCKET)
      .download(path, {}, request);
    if (downloadError || !audio) {
      throw downloadError ?? new Error("Empty audio response");
    }
    if (audio.size !== item.size || audio.size < 1 || audio.size > 4 * 1024 * 1024 || audio.type !== item.contentType) {
      throw new Error("Audio metadata changed during publication");
    }
    const bytes = new Uint8Array(await audio.arrayBuffer());
    signal.throwIfAborted();
    if (!hasSupportedAudioSignature(item.canonicalName, bytes)) return bytes.subarray(0, 12);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const extension = item.canonicalName.split(".")[1];
    const verifiedPath = `${folder}/verified/${sha256}.${extension}`;
    let retained = retainedCopies.get(verifiedPath);
    if (!retained) {
      retained = (async () => {
        const storage = createSecretSupabaseClient(signal)!.storage.from(LESSON_AUDIO_BUCKET);
        // Independent prior copies must still pass the original collision check;
        // no upsert, retry or swallowed integrity failure is introduced.
        const uploaded = await storage.upload(verifiedPath, bytes, { contentType: item.contentType, upsert: false });
        if (uploaded.error) {
          if (!("statusCode" in uploaded.error) || String(uploaded.error.statusCode) !== "409") throw uploaded.error;
          const existing = await storage.download(verifiedPath, {}, request);
          if (existing.error || !existing.data || existing.data.size !== bytes.length || existing.data.type !== item.contentType
            || createHash("sha256").update(new Uint8Array(await existing.data.arrayBuffer())).digest("hex") !== sha256) {
            throw new Error("Existing verified audio does not match its digest");
          }
        }
      })();
      retainedCopies.set(verifiedPath, retained);
    }
    await retained;
    signal.throwIfAborted();
    manifest[item.phraseNumber - 1] = { ...item, size: bytes.length, path: verifiedPath, sha256 };
    return bytes.subarray(0, 12);
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
