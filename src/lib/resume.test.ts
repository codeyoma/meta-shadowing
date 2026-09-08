import { describe, expect, it } from "vitest";
import { getPlayerHref } from "./resume";

const selection = {
  language: "english",
  lessonId: "morning-routine",
  level: 3,
  mode: "manual",
  display: "current",
  speed: 1
} as const;

describe("server selection links", () => {
  it("retains WPM settings in a rapid session link without audio speed or grouping", () => {
    const rapid = { ...selection, level: 7, mode: "automatic" as const, display: "cumulative" as const, wpmLevel: 5 as const, speakingExtraMs: 1500, lineGapMs: 500, sectionGapMs: 3000 };
    const params = new URL(getPlayerHref(rapid), "http://localhost").searchParams;
    expect(Object.fromEntries(params)).toEqual({ lesson: "morning-routine", level: "7", mode: "automatic", display: "cumulative", wpm: "5", speak: "1.5", lineGap: "0.5", sectionGap: "3" });
  });

  it.each([2, 3, 4] as const)("retains group size %s in the saved selection and player URL", groupSize => {
    const grouped = { ...selection, level: 5, groupSize };
    expect(new URL(getPlayerHref(grouped), "http://localhost").searchParams.get("group")).toBe(String(groupSize));
  });


});
