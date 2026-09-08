// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { englishDictionaryLemmas } from "./dictionary-lemmas";

describe("English lookup candidates", () => {
  it.each([
    ["passed", "pass"], ["passes", "pass"], ["passing", "pass"], ["studied", "study"],
    ["went", "go"], ["goes", "go"], ["gone", "go"], ["were", "be"], ["did", "do"],
    ["saw", "see"], ["running", "run"], ["bought", "buy"], ["children", "child"],
    ["mice", "mouse"], ["knives", "knife"], ["better", "good"], ["best", "good"]
  ])("finds a base candidate for %s", (surface, expected) => {
    expect(englishDictionaryLemmas(surface).map(candidate => candidate.word)).toContain(expected);
  });
  it("keeps distinct noun and verb interpretations without claiming a contextual choice", () => {
    expect(englishDictionaryLemmas("leaves")).toEqual([
      { word: "leave", partsOfSpeech: ["verb"] }, { word: "leaf", partsOfSpeech: ["noun"] }
    ]);
    expect(englishDictionaryLemmas("passes")).toEqual([{ word: "pass", partsOfSpeech: ["verb", "noun"] }]);
  });
  it("adds verb and adjective alternatives without guessing noun roots for matched words", () => {
    expect(englishDictionaryLemmas("saw", false)).toEqual([{ word: "see", partsOfSpeech: ["verb"] }]);
    expect(englishDictionaryLemmas("better", false)).toEqual([{ word: "good", partsOfSpeech: ["adj"] }]);
    expect(englishDictionaryLemmas("boss", false)).toEqual([]);
    expect(englishDictionaryLemmas("physics", false)).toEqual([]);
  });
  it("preserves compound meaning, normalizes case, and does not guess other languages", () => {
    expect(englishDictionaryLemmas("EX‑GIRLFRIENDS")).toEqual([{ word: "ex-girlfriend", partsOfSpeech: ["noun"] }]);
    expect(englishDictionaryLemmas("ex-girlfriend")).toEqual([]);
    expect(englishDictionaryLemmas("食べました")).toEqual([]);
    expect(englishDictionaryLemmas("don't")).toEqual([]);
  });
});
