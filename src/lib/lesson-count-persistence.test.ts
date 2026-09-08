// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseLessonDraft } from "./lesson-draft-parser";
import type { LessonDraftImport } from "./admin-draft-request";

const { createClient, insert, rpc } = vi.hoisted(() => ({ createClient: vi.fn(), insert: vi.fn(), rpc: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("./supabase/server", () => ({ createServerSupabaseClient: createClient }));
vi.mock("./supabase/secret", () => ({ createSecretSupabaseClient: createClient }));
import { saveLessonDraft } from "./lesson-draft-repository";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_TEST_MODE", "0");
  createClient.mockReturnValue({ from: () => ({ insert }), rpc });
  insert.mockReturnValue({ select: () => ({ single: async () => ({ data: { id: "saved" }, error: null }) }) });
  rpc.mockResolvedValue({ data: "replacement", error: null });
});
afterEach(() => vi.unstubAllEnvs());

it.each([false, true])("persists heading and phrase totals on import (replacement=%s)", async replacement => {
  const targetSource = "## A\nOne.\n\nTwo.\n## B\nThree.";
  const koreanSource = "## 가\n하나.\n\n둘.\n## 나\n셋.";
  const draft: LessonDraftImport = {
    title: "Counted lesson", language: "english", targetFilename: "en.txt", koreanFilename: "ko.txt",
    targetSource, koreanSource, parseResult: parseLessonDraft(targetSource, koreanSource),
    replacementFor: replacement ? "existing-lesson" : undefined
  };
  await expect(saveLessonDraft({ id: "admin", email: "admin@example.com" }, draft)).resolves.toBe(replacement ? "replacement" : "saved");
  const counts = { phrase_count: 3, chapter_count: 2, section_count: 1 };
  if (replacement) expect(rpc).toHaveBeenCalledWith("import_lesson_replacement", expect.objectContaining({
    p_lesson_id: "existing-lesson", p_draft: expect.objectContaining(counts)
  }));
  else expect(insert).toHaveBeenCalledWith(expect.objectContaining(counts));
});
