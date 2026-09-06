import { expect, it } from "vitest";
import { parseLessonDraft } from "./lesson-draft-parser";
import { prepareRapidLines } from "./rapid-lines";

it("keeps only phrases in the timeline and carries chapter and blank-section boundaries", () => {
  const draft = parseLessonDraft("## At home\nGood morning.\nWelcome.\n\nCome in.\n## At work\n\nLet's start.", "## 집에서\n좋은 아침입니다.\n환영합니다.\n\n들어오세요.\n## 직장에서\n\n시작합시다.");
  const lines = prepareRapidLines(draft.entries, "english");
  expect(lines).toHaveLength(4);
  expect(lines.map(line => line.target)).toEqual([["Good", "morning."], ["Welcome."], ["Come", "in."], ["Let's", "start."]]);
  expect(lines.map(line => line.boundary)).toEqual(["chapter", null, "section", "section"]);
  expect(lines.map(line => line.chapter?.target)).toEqual(["At home", "At home", "At home", "At work"]);
  expect(lines[0].korean).toEqual(["좋은", "아침입니다."]);
});

it("preserves a real blank boundary immediately after a chapter while keeping its bilingual title", () => {
  const draft = parseLessonDraft("## Chapter\n\nFirst phrase.", "## 챕터\n\n첫 문장.");
  expect(prepareRapidLines(draft.entries, "english")).toEqual([
    { target: ["First", "phrase."], korean: ["첫", "문장."], chapter: { target: "Chapter", korean: "챕터" }, boundary: "section" }
  ]);
});

it("prepares Japanese supplied spaces and fallback segmentation once, without requiring audio", () => {
  const draft = parseLessonDraft("私は 七時に 起きます。\n顔を洗います。", "나는 일곱 시에 일어난다.\n나는 세수를 한다.");
  expect(prepareRapidLines(draft.entries, "japanese").map(line => line.target)).toEqual([
    ["私は", "七時に", "起きます。"], ["顔", "を", "洗い", "ます。"]
  ]);
});
