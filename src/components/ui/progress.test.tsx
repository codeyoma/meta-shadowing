import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Progress } from "./progress";

it("reports lesson progress in the same units as its visible fill", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(createElement(Progress, { value: 1, max: 4, "aria-label": "Lesson progress" }));
  const bar = root.querySelector('[role="progressbar"]');
  expect(bar?.getAttribute("aria-valuenow")).toBe("1");
  expect(bar?.getAttribute("aria-valuemax")).toBe("4");
  expect(root.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style")).toContain("translateX(-75%)");
});

it("keeps a completed lesson fully filled", () => {
  const root = document.createElement("div");
  root.innerHTML = renderToStaticMarkup(createElement(Progress, { value: 560, max: 560 }));
  expect(root.querySelector('[data-slot="progress-indicator"]')?.getAttribute("style")).toContain("translateX(-0%)");
});
