// @vitest-environment node
import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { readLessonDraftImport } from "./admin-draft-request";

function importRequest(language: string) {
  const form = new FormData();
  form.set("title", "Imported lesson");
  form.set("language", language);
  form.set("scriptFile", new File(["Target sentence.\n번역 문장."], "lesson.txt", { type: "text/plain" }));
  return new Request("http://localhost/api/admin/drafts", { method: "POST", body: form });
}

it.each(["english", "japanese", "chinese", "german", "french"] as const)("accepts a %s lesson draft", async language => {
  await expect(readLessonDraftImport(importRequest(language))).resolves.toMatchObject({
    language,
    parseResult: { publishReady: true, summary: { phrases: 1 } }
  });
});

it("rejects a lesson draft outside the learner language catalog", async () => {
  await expect(readLessonDraftImport(importRequest("spanish"))).rejects.toMatchObject({ status: 400 });
});
