import { describe, expect, it } from "vitest";
import { createLearnerCookie, verifyLearnerCookie } from "./auth";

describe("learner cookie", () => {
  it("accepts a correctly signed unexpired learner cookie", () => {
    const cookie = createLearnerCookie("test-signing-secret", 1_000);

    expect(verifyLearnerCookie(cookie, "test-signing-secret", 1_000 + 29 * 24 * 60 * 60 * 1_000)).toBe(true);
  });

  it("rejects a cookie whose signature has been changed", () => {
    const cookie = createLearnerCookie("test-signing-secret", 1_000);
    const tampered = `${cookie.slice(0, -1)}x`;

    expect(verifyLearnerCookie(tampered, "test-signing-secret", 1_001)).toBe(false);
  });

  it("rejects a cookie after the 30-day session lifetime", () => {
    const cookie = createLearnerCookie("test-signing-secret", 1_000);

    expect(verifyLearnerCookie(cookie, "test-signing-secret", 1_000 + 30 * 24 * 60 * 60 * 1_000)).toBe(false);
  });
});
