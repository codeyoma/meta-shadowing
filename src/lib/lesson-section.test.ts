import { expect, it } from "vitest";
import { parseLessonDraft } from "./lesson-draft-parser";
import { lessonSectionAt } from "./lesson-section";

it("uses script headings verbatim and carries them across unnamed sections without counting marker rows", () => {
  const entries = parseLessonDraft(
    "Before.\n## Section 1\nOne.\n\nTwo.\nThree.\n## Section 2\nFour.",
    "이전.\n## 첫 구간\n하나.\n\n둘.\n셋.\n## 둘째 구간\n넷."
  ).entries;
  expect(lessonSectionAt(entries, 1)).toEqual({ chapter: null, startsSection: false });
  expect(lessonSectionAt(entries, 2)).toEqual({ chapter: { target: "Section 1", korean: "첫 구간" }, startsSection: false });
  expect(lessonSectionAt(entries, 3)).toEqual({ chapter: { target: "Section 1", korean: "첫 구간" }, startsSection: true });
  expect(lessonSectionAt(entries, 4)).toEqual({ chapter: { target: "Section 1", korean: "첫 구간" }, startsSection: false });
  expect(lessonSectionAt(entries, 5)).toEqual({ chapter: { target: "Section 2", korean: "둘째 구간" }, startsSection: false });
});

it("does not invent chapter names for unnamed boundaries, empty material, or missing phrases", () => {
  const entries = parseLessonDraft("One.\n\nTwo.", "하나.\n\n둘.").entries;
  expect(lessonSectionAt(entries, 2)).toEqual({ chapter: null, startsSection: true });
  expect(lessonSectionAt(entries, 99)).toEqual({ chapter: null, startsSection: false });
  expect(lessonSectionAt([], 1)).toEqual({ chapter: null, startsSection: false });
});
