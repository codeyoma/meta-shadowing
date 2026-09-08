import { describe, expect, it } from "vitest";
import { parsePreferencePatch, studyTimeZone } from "./learner-preferences";

describe("account preference input boundary", () => {
  it("accepts only explicit valid fields, never client ownership or silently filtered values", () => {
    const base = { accountId: "00000000-0000-4000-8000-000000000018", revision: 0 };
    expect(parsePreferencePatch({ ...base, changes: { speed: 2, mode: "automatic" } })?.changes).toEqual({ speed: 2, mode: "automatic" });
    for (const changes of [{ speed: 99 }, { user_id: base.accountId }, { speed: 2, unknown: true }, {}, { groupSize: 5 }, { wpmLevel: 7 }, { lineGapMs: -1 }, { display: "other" }]) {
      expect(parsePreferencePatch({ ...base, changes })).toBeNull();
    }
    expect(parsePreferencePatch({ ...base, revision: -1, changes: { speed: 2 } })).toBeNull();
    expect(parsePreferencePatch({ ...base, user_id: base.accountId, changes: { speed: 2 } })).toBeNull();
  });
  it("keeps the selection pair atomic and validates time zones", () => {
    const base = { accountId: "00000000-0000-4000-8000-000000000018", revision: 0 };
    expect(parsePreferencePatch({ ...base, changes: { selection: { language: "japanese", lessonId: null } } })).not.toBeNull();
    expect(parsePreferencePatch({ ...base, changes: { selection: { language: "invalid", lessonId: null } } })).toBeNull();
    expect(studyTimeZone("Asia/Seoul")).toBe("Asia/Seoul");
    expect(studyTimeZone("invalid")).toBe("UTC");
  });
});
