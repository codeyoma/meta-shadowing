import { expect, it } from "vitest";
import { parseLessonDraft } from "./lesson-draft-parser";
import { groupLessonPhrases } from "./phrase-groups";

it.each([
  { size: 2 as const, counts: [[], [1], [2], [3], [2, 2], [2, 3]] },
  { size: 3 as const, counts: [[], [1], [2], [3], [4], [3, 2], [3, 3], [3, 4], [3, 3, 2]] },
  { size: 4 as const, counts: [[], [1], [2], [3], [4], [5], [6], [4, 3], [4, 4], [4, 5], [4, 6], [4, 4, 3]] }
])("size $size appends remainders through 50 percent and starts a new group above it", ({ size, counts }) => {
  for (const [phraseCount, expected] of counts.entries()) {
    const source = Array.from({ length: phraseCount }, (_, index) => `Phrase ${index + 1}`).join("\n");
    const entries = parseLessonDraft(source, source).entries;
    const groups = groupLessonPhrases(entries, size);
    expect(groups.map(group => group.phrases.length), `size ${size}, ${phraseCount} phrases`).toEqual(expected);
    expect(groups.flatMap(group => group.phrases)).toEqual(entries.filter(entry => entry.kind === "phrase"));
  }
});

it.each([2, 3, 4] as const)("size %s never borrows a remainder across a chapter or unnamed section", (size) => {
  const target = "## Home\nOne.\nTwo.\nThree.\n\nFour.\n## Work\nFive.\nSix.\n\n\n## Empty\n## Travel\nSeven.";
  const korean = "## 집\n하나.\n둘.\n셋.\n\n넷.\n## 직장\n다섯.\n여섯.\n\n\n## 빈 챕터\n## 여행\n일곱.";
  const groups = groupLessonPhrases(parseLessonDraft(target, korean).entries, size);
  expect(groups.map(group => ({
    phrases: group.phrases.map(phrase => phrase.phraseNumber),
    chapter: group.chapter,
    startsSection: group.startsSection
  }))).toEqual([
    { phrases: [1, 2, 3], chapter: { target: "Home", korean: "집" }, startsSection: false },
    { phrases: [4], chapter: { target: "Home", korean: "집" }, startsSection: true },
    { phrases: [5, 6], chapter: { target: "Work", korean: "직장" }, startsSection: false },
    { phrases: [7], chapter: { target: "Travel", korean: "여행" }, startsSection: false }
  ]);
});
