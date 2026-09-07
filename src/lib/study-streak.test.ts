import { expect, it } from "vitest";
import { studyStreak, localStudyDay, validStudyDay } from "./study-streak";

const today = new Date(2026, 8, 7, 12);
it.each([
  [[], 0], [["2026-09-07"], 1], [["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-07"], 3],
  [["2026-09-05", "2026-09-06"], 2], [["2026-09-05"], 0],
  [["2026-09-04", "2026-09-06", "2026-09-07"], 2], [["2026-09-08", "garbage", "2026-09-07"], 1]
] as [string[], number][]) ("counts local consecutive practice days %j as %i", (days, count) => {
  expect(studyStreak(days, today)).toBe(count);
});
it("uses local calendar dates, including across month and year boundaries", () => {
  expect(localStudyDay(new Date(2026, 0, 1, 0, 5))).toBe("2026-01-01");
  expect(studyStreak(["2025-12-30", "2025-12-31", "2026-01-01"], new Date(2026, 0, 1))).toBe(3);
});
it("rejects impossible or malformed days instead of normalizing them into activity", () => {
  expect(["2026-02-30", "2026-13-01", "2026-9-07", null, 123].map(validStudyDay)).toEqual([false, false, false, false, false]);
  expect(validStudyDay("2024-02-29")).toBe(true);
});
