import { describe, expect, it } from "vitest";
import { resolveBrowseSelection, browseHref } from "./browse-navigation";
import { lessons } from "./lessons";

describe("browsing context", () => {
  it("the stage route's actual lesson determines the language", () => {
    expect(resolveBrowseSelection("/lessons/tokyo-walk/stages", new URLSearchParams("language=english"), lessons))
      .toEqual({ language: "japanese", lessonId: "tokyo-walk" });
  });
  it("does not carry an English lesson into an explicit Japanese selection", () => {
    expect(resolveBrowseSelection("/lessons", new URLSearchParams("language=japanese&lesson=morning-routine"), lessons,
      { language: "english", lessonId: "morning-routine" })).toEqual({ language: "japanese", lessonId: "tokyo-walk" });
  });
  it("discards stale selections and keeps settings reachable in an empty catalog", () => {
    const selection = resolveBrowseSelection("/settings", new URLSearchParams(), [], { language: "japanese", lessonId: "gone" });
    expect(selection).toEqual({ language: "japanese", lessonId: null });
    expect(browseHref("settings", selection)).toBe("/settings?language=japanese");
    expect(browseHref("stages", selection)).toBe("/lessons?language=japanese");
  });
  it("uses remembered context only when the URL does not select one", () => {
    expect(resolveBrowseSelection("/settings", new URLSearchParams(), lessons, { language: "japanese", lessonId: "tokyo-walk" }))
      .toEqual({ language: "japanese", lessonId: "tokyo-walk" });
  });
});
