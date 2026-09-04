import { beforeEach, describe, expect, it } from "vitest";
import { readLastSelection, saveLastSelection } from "./resume";

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
