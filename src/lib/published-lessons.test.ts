// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseLessonDraft } from "./lesson-draft-parser";

const { createClient, query } = vi.hoisted(() => ({
  createClient: vi.fn(),
  query: { select: vi.fn(), eq: vi.fn(), order: vi.fn(), maybeSingle: vi.fn() }
}));
vi.mock("server-only", () => ({}));
vi.mock("./supabase/secret", () => ({ createSecretSupabaseClient: createClient }));
import { getPublishedLesson, listPublishedLessons } from "./published-lessons";

const row = {
  id: "draft", lesson_id: "lesson", title: "Sections", language: "english",
  phrase_count: 3, chapter_count: 2, section_count: 1, published_at: "2026-09-08T00:00:00Z",
  parsed_entries: parseLessonDraft("## A\nOne.\n\nTwo.\n## B\nThree.", "## 가\n하나.\n\n둘.\n## 나\n셋.").entries
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("ADMIN_TEST_MODE", "0");
  createClient.mockReturnValue({ from: () => query });
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockResolvedValue({ data: [row], error: null });
  query.maybeSingle.mockResolvedValue({ data: row, error: null });
});
afterEach(() => vi.unstubAllEnvs());

it("exposes stored heading counts as sections, not blank separator counts, in catalog and detail", async () => {
  expect(await listPublishedLessons()).toMatchObject([{ sectionCount: 2, phraseCount: 3 }]);
  expect(await getPublishedLesson("lesson")).toMatchObject({ sectionCount: 2, phraseCount: 3 });
  expect(query.select).toHaveBeenCalledWith(expect.stringContaining("chapter_count"));
});

it("keeps lessons without headings available with zero sections", async () => {
  query.maybeSingle.mockResolvedValue({ data: { ...row, chapter_count: 0, parsed_entries: row.parsed_entries.filter(entry => entry.kind !== "chapter") }, error: null });
  expect(await getPublishedLesson("lesson")).toMatchObject({ sectionCount: 0, phraseCount: 3 });
});

it("does not expose stored counts that disagree with the published script", async () => {
  query.maybeSingle.mockResolvedValue({ data: { ...row, chapter_count: 99 }, error: null });
  expect(await getPublishedLesson("lesson")).toBeNull();
});

it("derives accurate counts for the test catalog too", async () => {
  vi.stubEnv("ADMIN_TEST_MODE", "1");
  expect(await listPublishedLessons()).toMatchObject([
    { id: "morning-routine", sectionCount: 0, phraseCount: 3 },
    { id: "daily-conversation", sectionCount: 2, phraseCount: 10 },
    { id: "tokyo-walk", sectionCount: 0, phraseCount: 3 }
  ]);
});
