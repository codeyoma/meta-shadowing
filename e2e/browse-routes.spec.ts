import { expect, test } from "@playwright/test";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";
import { openSelectedStageSettings, returnToStages } from "./fixtures/stage-preview";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
});

test("separate destinations retain the shell and show only their own content", async ({ page }) => {
  await page.goto("/languages");
  await expect(page.getByRole("heading", { name: "언어 선택", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: /영어 English/ })).toBeVisible();
  await expect(page.getByText("Morning Routine", { exact: true })).toHaveCount(0);
  await page.getByRole("navigation", { name: "상단 탐색" }).evaluate(el => el.setAttribute("data-persistent-proof", "yes"));
  await page.getByRole("link", { name: /일본어 日本語/ }).click();
  await expect(page).toHaveURL(/\/lessons\?language=japanese/);
  await expect(page.getByRole("link", { name: /東京の散歩/ })).toBeVisible();
  await expect(page.getByText("Morning Routine", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "상단 탐색" })).toHaveAttribute("data-persistent-proof", "yes");
  await page.getByRole("link", { name: /東京の散歩/ }).click();
  await expect(page).toHaveURL(/\/lessons\/tokyo-walk\/stages/);
  await expect(page.getByRole("radio", { name: /^1 자막/ })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "하단 탐색" });
  await nav.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\?/);
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "설정 목록" }).getByRole("link")).toHaveText(["세션 설정"]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { name: "세션 설정", exact: true }).click();
  await expect(page).toHaveURL(/\/settings\/session\?/);
  await expect(page.getByRole("combobox", { name: "재생속도", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "재생속도", exact: true }).selectOption("1.5");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "재생속도", exact: true })).toHaveValue("1.5");
  await nav.getByRole("link", { name: "스테이지", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/tokyo-walk\/stages/);
  await page.getByRole("button", { name: "현재 스테이지 1 시작" }).click();
  await expect(page).toHaveURL(/\/player\?.*speed=1.5/);
  await expect(nav).toHaveCount(0);
});

test("legacy links redirect and Settings-tab preferences apply to the chosen stage", async ({ page }) => {
  await page.goto("/home?tab=lessons&language=japanese&lesson=tokyo-walk");
  await expect(page).toHaveURL(/\/lessons\?language=japanese/);
  await page.goto("/setup?lesson=morning-routine");
  await expect(page).toHaveURL(/\/lessons\/morning-routine\/stages/);
  await page.getByRole("radio", { name: /^7 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByRole("heading", { name: "세션 설정", exact: true })).toBeVisible();
  await expect(page.getByLabel("묶음 크기")).toBeVisible();
  await page.getByLabel("묶음 크기").selectOption("3");
  await returnToStages(page);
  await expect(page.getByRole("radio", { name: /^7 다문장 암기/ })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("radio", { name: /^7 다문장 암기/ }).click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page).toHaveURL(/level=4.*stage=7.*group=3/);
});

test("navigation and stage scroll positions survive tab changes without document scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await page.goto("/lessons/morning-routine/stages");
  const list = page.getByRole("region", { name: "학습 단계 목록" });
  await expect(page.getByRole("radio", { name: /^1 자막/ })).toBeEnabled();
  await list.evaluate(el => { el.scrollTop = 500; });
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(500);
  const nav = page.getByRole("navigation", { name: "하단 탐색" });
  await nav.getByRole("link", { name: "레슨", exact: true }).click();
  await nav.getByRole("link", { name: "스테이지", exact: true }).click();
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBe(500);
  expect(await page.evaluate(() => ({ y: window.scrollY, height: document.documentElement.scrollHeight, viewport: innerHeight })))
    .toEqual({ y: 0, height: 600, viewport: 600 });
});

test("pending cycles have no inner marks and only the current cycle shows media progress", async ({ page }) => {
  await page.goto("/player?lesson=morning-routine&level=1&mode=manual");
  const cycles = page.getByRole("group", { name: "완료한 듣기" });
  const current = cycles.locator('[data-current="true"] i');
  await expect(current).toBeVisible();
  const ring = current.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  await expect(ring).toBeVisible();
  await expect(ring).toHaveAttribute("aria-valuemin", "0");
  await expect(ring).toHaveAttribute("aria-valuemax", "100");
  await expect(ring).toHaveCSS("width", "28px");
  await expect(ring).toHaveCSS("animation-name", "none");
  const pending = cycles.locator('[data-visible="true"][data-complete="false"]:not([data-current]) i').first();
  expect(await pending.evaluate(el => getComputedStyle(el, "::after").content)).toBe("none");
  await expect(pending.locator("svg")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(ring).toBeVisible();
  await expect(ring).toHaveCSS("animation-name", "none");
});

test("choosing another lesson does not reset that language's lesson-list scroll", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 350 });
  await page.goto("/lessons?language=english");
  const list = page.getByRole("region", { name: "레슨 목록" });
  await page.getByRole("link", { name: /Daily Conversation/ }).scrollIntoViewIfNeeded();
  expect(await list.evaluate(el => el.scrollTop)).toBeGreaterThan(50);
  await page.getByRole("link", { name: /Daily Conversation/ }).click();
  await expect(page).toHaveURL(/\/daily-conversation\/stages/);
  await page.getByRole("navigation", { name: "하단 탐색" }).getByRole("link", { name: "레슨", exact: true }).click();
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(50);
});

test("lesson history distinguishes both stages belonging to the same level", async ({ page }) => {
  await page.goto("/languages");
  await page.evaluate(settings => {
    localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify({ progress: null, studyDays: [], history: [1, 2].map(stage => ({
      runId: `history-${stage}`, lessonId: "morning-routine", lessonVersion: "fixture-v1", lessonName: "Morning Routine",
      language: "english", level: 1, stage, nextUnit: 3, nextPhrase: 3, activeMs: 1000, settings,
      completedAt: `2026-09-07T01:0${stage}:00Z`,
    })) }));
  }, DEFAULT_SESSION_SETTINGS);
  await page.goto("/lessons?language=english");
  await expect(page.getByRole("region", { name: "완료 기록" })).toHaveCount(0);
  await page.goto("/lessons/morning-routine/stages");
  await page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
  const history = page.getByRole("dialog", { name: "완료 기록", exact: true });
  await expect(history.getByText("스테이지 1", { exact: true })).toBeVisible();
  await expect(history.getByText("스테이지 2", { exact: true })).toBeVisible();
});

test("a completed run returns to its language's lesson list and recorded stage", async ({ page }) => {
  await page.goto("/languages");
  await page.evaluate(settings => {
    localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify({ progress: null, studyDays: [], history: [{
      runId: "finished-browse-run", lessonId: "tokyo-walk", lessonVersion: "fixture-v1", lessonName: "東京の散歩",
      language: "japanese", level: 1, stage: 2, nextUnit: 3, nextPhrase: 3, activeMs: 1000, settings,
      completedAt: "2026-09-07T01:00:00Z",
    }] }));
  }, DEFAULT_SESSION_SETTINGS);
  await page.goto("/player?lesson=tokyo-walk&level=1&stage=2&run=finished-browse-run");
  await page.getByRole("button", { name: "레슨 목록으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\?language=japanese/);
  await expect(page.getByRole("region", { name: "완료 기록" })).toHaveCount(0);
  await page.goto("/lessons/tokyo-walk/stages");
  await page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "완료 기록", exact: true }).getByText("스테이지 2", { exact: true })).toBeVisible();
});
