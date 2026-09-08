// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { access, lookup } = vi.hoisted(() => ({ access: vi.fn(), lookup: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ hasLearnerAccess: access }));
vi.mock("@/lib/dictionary-repository", () => ({ lookupDictionaryEntries: lookup }));
import { GET } from "./route";

const request = (query: string) => new Request(`http://localhost/api/dictionary?${query}`);
beforeEach(() => { vi.clearAllMocks(); access.mockResolvedValue(true); lookup.mockResolvedValue([]); });

describe("learner dictionary API", () => {
  it("checks learner access before querying the private dictionary", async () => {
    access.mockResolvedValue(false);
    const response = await GET(request("language=en&word=school"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthorized" });
    expect(lookup).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });

  it("returns Unicode lookups using language aliases and no shared cache", async () => {
    const entries = [{ headword: "学校", language: "ja", pos: "noun", senses: [{ glosses: ["학교"] }] }];
    lookup.mockResolvedValue(entries);
    const response = await GET(request("language=japanese&word=%E5%AD%A6%E6%A0%A1"));
    expect(response.status).toBe(200);
    expect(lookup).toHaveBeenCalledWith("ja", "学校");
    expect(await response.json()).toEqual({ word: "学校", entries });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });

  it.each(["language=ko&word=school", "language=en", "language=en&word=", "language=en&word=a%00b",
    "language=en&word=a,b", `language=en&word=${"a".repeat(81)}`, "language=en&word=a&word=b", "language=en&language=ja&word=a"])("rejects malformed or oversized query %s", async (query) => {
    const response = await GET(request(query));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid-dictionary-query" });
    expect(lookup).not.toHaveBeenCalled();
  });

  it("distinguishes no entry from backend failure without leaking backend details", async () => {
    const empty = await GET(request("language=en&word=missing"));
    expect(await empty.json()).toEqual({ word: "missing", entries: [] });
    lookup.mockRejectedValue(new Error("backend secret should stay private"));
    const failed = await GET(request("language=en&word=school"));
    expect(failed.status).toBe(503);
    expect(await failed.json()).toEqual({ error: "dictionary-unavailable" });
    expect(failed.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
