import { afterEach, expect, test, vi } from "vitest";
import { requestLessonPublication } from "./request-lesson-publication";

afterEach(() => vi.unstubAllGlobals());
test("a platform text timeout becomes an actionable publication retry error", async () => {
  vi.stubGlobal("fetch", async () => new Response("An error occurred", { status: 504 }));
  await expect(requestLessonPublication("draft-id")).rejects.toThrow(/시간.*초과/);
});
test.each(["", "<html>Gateway failed</html>", "null", '{"lessonId":42}', "{}"])("does not accept a malformed success: %s", async body => {
  vi.stubGlobal("fetch", async () => new Response(body, { status: 200 }));
  await expect(requestLessonPublication("draft-id")).rejects.toThrow(/응답/);
});
test("preserves a server validation error instead of exposing a JSON parse error", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ message: "누락된 음성을 확인해 주세요." }, { status: 422 }));
  await expect(requestLessonPublication("draft-id")).rejects.toThrow("누락된 음성을 확인해 주세요.");
});
test("a network interruption explains that publication can be retried", async () => {
  vi.stubGlobal("fetch", async () => { throw new TypeError("Failed to fetch"); });
  await expect(requestLessonPublication("draft-id")).rejects.toThrow(/연결/);
});
test("sends only a publication request and accepts a valid lesson ID", async () => {
  const requests: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    requests.push({ url, init });
    return Response.json({ lessonId: "lesson-id" });
  });
  await expect(requestLessonPublication("draft-id")).resolves.toBeUndefined();
  expect(requests).toEqual([{ url: "/api/admin/drafts/draft-id/publish", init: { method: "POST" } }]);
});
