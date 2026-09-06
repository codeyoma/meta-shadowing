import { beforeEach, describe, expect, it } from "vitest";
import { getPlayerHref, readLastSelection, saveLastSelection } from "./resume";

const selection = {
  language: "english",
  lessonId: "morning-routine",
  level: 3,
  mode: "manual",
  display: "current",
  speed: 1
} as const;

describe("last learner selection", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value)
      }
    });
  });

  it("returns the saved session selection for the home continuation row", () => {
    saveLastSelection(selection);

    expect(readLastSelection()).toEqual(selection);
  });

  it("retains WPM settings in a rapid session link without audio speed or grouping", () => {
    const rapid = { ...selection, level: 7, mode: "automatic" as const, display: "cumulative" as const, wpmLevel: 5 as const, speakingExtraMs: 1500, lineGapMs: 500, sectionGapMs: 3000 };
    saveLastSelection(rapid);
    expect(readLastSelection()).toEqual(rapid);
    const params = new URL(getPlayerHref(rapid), "http://localhost").searchParams;
    expect(Object.fromEntries(params)).toEqual({ lesson: "morning-routine", level: "7", mode: "automatic", display: "cumulative", wpm: "5", speak: "1.5", lineGap: "0.5", sectionGap: "3" });
  });

  it.each([{ wpmLevel: 2 }, { speakingExtraMs: -1 }, { lineGapMs: "1000" }, { sectionGapMs: 30001 }])("rejects invalid saved rapid settings %j", invalid => {
    window.localStorage.setItem("meta-shadowing:last-selection", JSON.stringify({ ...selection, level: 8, ...invalid }));
    expect(readLastSelection()).toBeNull();
  });

  it.each([2, 3, 4] as const)("retains group size %s in the saved selection and player URL", groupSize => {
    const grouped = { ...selection, level: 5, groupSize };
    saveLastSelection(grouped);
    expect(readLastSelection()).toEqual(grouped);
    expect(new URL(getPlayerHref(grouped), "http://localhost").searchParams.get("group")).toBe(String(groupSize));
  });

  it.each([0, 1, 5, 2.5, "2", null])("rejects invalid saved group size %s", groupSize => {
    window.localStorage.setItem("meta-shadowing:last-selection", JSON.stringify({ ...selection, level: 5, groupSize }));
    expect(readLastSelection()).toBeNull();
  });

  it("does not offer a continuation row for malformed local data", () => {
    window.localStorage.setItem("meta-shadowing:last-selection", "not-json");

    expect(readLastSelection()).toBeNull();
  });

  it("keeps session start usable when saving browser storage is blocked", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        setItem: () => {
          throw new DOMException("Storage access denied", "SecurityError");
        }
      }
    });

    expect(() => saveLastSelection(selection)).not.toThrow();
  });

  it("omits the continuation row when reading browser storage is blocked", () => {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        getItem: () => {
          throw new DOMException("Storage access denied", "SecurityError");
        }
      }
    });

    expect(readLastSelection()).toBeNull();
  });
});
