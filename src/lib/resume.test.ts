import { beforeEach, describe, expect, it } from "vitest";
import { readLastSelection, saveLastSelection } from "./resume";

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
    saveLastSelection({
      language: "english",
      lessonId: "morning-routine",
      level: 3,
      mode: "manual",
      display: "current",
      speed: 1
    });

    expect(readLastSelection()).toEqual({
      language: "english",
      lessonId: "morning-routine",
      level: 3,
      mode: "manual",
      display: "current",
      speed: 1
    });
  });

  it("does not offer a continuation row for malformed local data", () => {
    window.localStorage.setItem("meta-shadowing:last-selection", "not-json");

    expect(readLastSelection()).toBeNull();
  });
});
