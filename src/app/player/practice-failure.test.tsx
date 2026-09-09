import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { PracticeFailure } from "./use-cloud-recording";

it("offers a read retry without claiming an attempted save failed", () => {
  const markup = renderToStaticMarkup(createElement(PracticeFailure, { error: "read-failed", retry: () => {} }));
  expect(markup).toContain("학습 기록을 불러오지 못했습니다.");
  expect(markup).toContain("다시 불러오기");
  expect(markup).not.toContain("저장 재시도");
});

it("directs a stale lesson back to the current catalog instead of retrying the old run", () => {
  const markup = renderToStaticMarkup(createElement(PracticeFailure, { error: "lesson-version-changed", retry: () => {} }));
  expect(markup).toContain("레슨을 다시 불러와 주세요.");
  expect(markup).toContain("완료 기록은 보존됩니다.");
  expect(markup).not.toContain("저장 재시도");
});
