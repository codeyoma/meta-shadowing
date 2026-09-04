import "server-only";

import { randomUUID } from "node:crypto";
import { readAdminTestEnvironment } from "./admin-test-mode";
import type { AdminIdentity } from "./admin-auth";
import type { LessonDraftImport } from "./admin-draft-request";
import { createServerSupabaseClient } from "./supabase/server";

export async function saveLessonDraft(admin: AdminIdentity, draft: LessonDraftImport) {
  if (readAdminTestEnvironment()) return randomUUID();

  const supabase = await createServerSupabaseClient();
  if (!supabase) throw new Error("Supabase is not configured");

  const { data, error } = await supabase
    .from("lesson_drafts")
    .insert({
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
    })
    .select("id")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Draft insert returned no data");
  return data.id as string;
}
