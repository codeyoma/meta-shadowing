import "server-only";

import { randomUUID } from "node:crypto";
import { readAdminTestEnvironment } from "./admin-test-mode";
import type { AdminIdentity } from "./admin-auth";
import { DraftRequestError, type LessonDraftImport } from "./admin-draft-request";
import { createServerSupabaseClient } from "./supabase/server";
import { createSecretSupabaseClient } from "./supabase/secret";

export async function saveLessonDraft(admin: AdminIdentity, draft: LessonDraftImport) {
  if (readAdminTestEnvironment()) return randomUUID();

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const values = {
      created_by: admin.id,
      title: draft.title,
      language: draft.language,
      target_filename: draft.targetFilename,
      korean_filename: draft.koreanFilename,
      target_source: draft.targetSource,
      korean_source: draft.koreanSource,
      parsed_entries: draft.parseResult.entries,
      validation_issues: draft.parseResult.issues,
      validation_status: draft.parseResult.publishReady ? "validated" : "invalid",
      phrase_count: draft.parseResult.summary.phrases,
      chapter_count: draft.parseResult.summary.chapters,
      section_count: draft.parseResult.summary.sections
    };
  if (draft.replacementFor) {
    const secret = createSecretSupabaseClient();
    if (!secret) throw new Error("Server publication key is not configured");
    const { data, error } = await secret.rpc("import_lesson_replacement", {
      p_lesson_id: draft.replacementFor, p_admin_id: admin.id, p_draft: values
    });
    if (error) throw new DraftRequestError(
      error.code === "23514" ? "교체할 레슨과 같은 언어를 선택해 주세요." : "레슨을 교체할 수 없습니다. 목록을 새로고침해 주세요.",
      error.code === "P0002" ? 404 : 409
    );
    return data as string;
  }
  const { data, error } = await supabase.from("lesson_drafts").insert(values)
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Draft insert returned no data");
  return data.id as string;
}
