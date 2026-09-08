// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { access, lookup } = vi.hoisted(() => ({ access: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ hasLearnerAccess: access }));
vi.mock("@/lib/published-syntax", () => ({ getPublishedPhraseSyntax: lookup }));
import { GET } from "./route";
const id = "11111111-1111-4111-8111-111111111111";
const version = "2026-09-06T14:56:09.015164+00:00";
const request = (query = new URLSearchParams({ version }).toString()) => new Request(`http://localhost/api/lessons/${id}/syntax/7?${query}`);
const context = (phraseNumber = "7", lessonId = id) => ({ params: Promise.resolve({ id: lessonId, phraseNumber }) });
beforeEach(() => { vi.resetAllMocks(); access.mockResolvedValue(true); lookup.mockResolvedValue({ phraseNumber: 7, sentences: [] }); });

it("checks learner authentication before reading private analysis", async () => {
  access.mockResolvedValue(false);
  const response = await GET(request(), context());
  expect(response.status).toBe(401); expect(lookup).not.toHaveBeenCalled();
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
});
it("passes the exact version including microseconds and returns private read-only results", async () => {
  const response = await GET(request(), context());
  expect(response.status).toBe(200);
  expect(lookup).toHaveBeenCalledWith(id, 7, version);
  expect(await response.json()).toEqual({ phraseNumber: 7, sentences: [] });
  expect(response.headers.get("Vary")).toBe("Cookie");
});
it.each(["0", "-1", "1.5", "1e2", "07", "99999999"])("rejects invalid phrase %s", async phrase => {
  expect((await GET(request(), context(phrase))).status).toBe(400); expect(lookup).not.toHaveBeenCalled();
});
it.each(["", "version=bad", "version=2026-09-06", "version=2026-09-06Tinvalid", `version=${version}&version=${version}`])("requires one valid version (%s)", async query => {
  expect((await GET(request(query), context())).status).toBe(400); expect(lookup).not.toHaveBeenCalled();
});
it("rejects non-book identifiers", async () => {
  expect((await GET(request(), context("7", "bad-id"))).status).toBe(400);
  expect(lookup).not.toHaveBeenCalled();
});
it("keeps backend details private on failure", async () => {
  lookup.mockRejectedValue(new Error("sensitive credentials"));
  const response = await GET(request(), context());
  expect(response.status).toBe(503); expect(await response.json()).toEqual({ error: "syntax-unavailable" });
});
