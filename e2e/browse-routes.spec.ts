import { enterAccountPractice, installStagePackage, reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { seedLearningJournal } from "./fixtures/cloud-journal";
import { expect, test } from "./fixtures/cloud-ui";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";
import { openSelectedStageSettings, returnToStages } from "./fixtures/stage-preview";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
});

test("separate destinations retain the shell and local settings overlay", async ({ page }) => {
  await openLearnerPage(page, "/languages");
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
  await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000003\/stages/);
  await expect(page.getByRole("radio", { name: /^1 자막/ })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "하단 탐색" });
  const stageUrl = page.url();
  await nav.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page).toHaveURL(stageUrl);
  await expect(page.getByRole("dialog", { name: "설정", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "재생속도", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "재생속도", exact: true }).selectOption("1.5");
  await reloadLearnerPage(page);
  await nav.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "재생속도", exact: true })).toHaveValue("1.5");
  await page.getByRole("dialog", { name: "설정", exact: true }).getByRole("button", { name: "닫기" }).click();
  await nav.getByRole("link", { name: "스테이지", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000003\/stages/);
  await installStagePackage(page);
  await page.getByRole("button", { name: "현재 스테이지 1 시작" }).click();
  await enterAccountPractice(page);
  await expect(page).toHaveURL(/\/player\?.*speed=1(?:&|$)/);
  await expect(nav).toHaveCount(0);
});

test("legacy links redirect and Settings-tab preferences apply to the chosen stage", async ({ page }) => {
  await openLearnerPage(page, "/home?tab=lessons&language=japanese&lesson=10000000-0000-4000-8000-000000000003");
  await expect(page).toHaveURL(/\/lessons\?language=japanese/);
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
  await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000001\/stages/);
  await page.getByRole("radio", { name: /^7 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await expect(page.getByLabel("묶음 크기")).toBeVisible();
  await page.getByLabel("묶음 크기").selectOption("3");
  await returnToStages(page);
  await expect(page.getByRole("radio", { name: /^7 다문장 암기/ })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("radio", { name: /^7 다문장 암기/ }).click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await enterAccountPractice(page);
  await expect(page).toHaveURL(/level=4.*stage=7.*group=2/);
});

test("navigation and stage scroll positions survive tab changes without document scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000001/stages");
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
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&mode=manual");
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
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000001/stages");
  await expect(page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true })).toBeEnabled();
  const nav = page.getByRole("navigation", { name: "하단 탐색", exact: true });
  await nav.getByRole("link", { name: "레슨", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\?language=english&lesson=10000000-0000-4000-8000-000000000001$/);
  const list = page.getByRole("region", { name: "레슨 목록" });
  async function waitForScrollableList() {
    // Radix enables viewport scrolling after mount; useBrowseScroll also
    // restores once on the next frame. Finish both before the user scrolls.
    await expect(list).toHaveCSS("overflow-y", "scroll");
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
  }
  await waitForScrollableList();
  const nextLesson = list.getByRole("link", { name: /Daily Conversation/ });
  await nextLesson.scrollIntoViewIfNeeded();
  await expect(nextLesson).toBeInViewport();
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(50);
  const scrollBefore = await list.evaluate(el => el.scrollTop);
  const savedSelection = page.waitForResponse(response => new URL(response.url()).pathname === "/api/learner/preferences" && response.request().method() === "PATCH");
  await nextLesson.click();
  expect((await savedSelection).status()).toBe(200);
  await expect(page).toHaveURL(/\/10000000-0000-4000-8000-000000000002\/stages/);
  await installStagePackage(page);
  await expect(page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true })).toBeEnabled();
  await nav.getByRole("link", { name: "레슨", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\?language=english&lesson=10000000-0000-4000-8000-000000000002$/);
  await waitForScrollableList();
  await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeCloseTo(scrollBefore, 0);
  await expect(nextLesson).toBeInViewport();
  await expect(nav.getByRole("link", { name: "스테이지", exact: true })).toHaveAttribute("href", "/lessons/10000000-0000-4000-8000-000000000002/stages");
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test("lesson history distinguishes both stages belonging to the same level", async ({ page }) => {
  await openLearnerPage(page, "/languages");
  await seedLearningJournal(page, { progress: null, studyDays: [], history: [1, 2].map(stage => ({
      runId: `history-${stage}`, lessonId: "10000000-0000-4000-8000-000000000001", lessonVersion: "fixture-v1", lessonName: "Morning Routine",
      language: "english", level: 1, stage, nextUnit: 3, nextPhrase: 3, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
      completedAt: `2026-09-07T01:0${stage}:00Z`,
    })) });
  await openLearnerPage(page, "/lessons?language=english");
  await expect(page.getByRole("region", { name: "완료 기록" })).toHaveCount(0);
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000001/stages");
  await page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
  const history = page.getByRole("dialog", { name: "완료 기록", exact: true });
  await expect(history.getByText("스테이지 1", { exact: true })).toBeVisible();
  await expect(history.getByText("스테이지 2", { exact: true })).toBeVisible();
});

test("a completed run returns to its language's lesson list and recorded stage", async ({ page }) => {
  await openLearnerPage(page, "/languages");
  await seedLearningJournal(page, { progress: null, studyDays: [], history: [{
      runId: "finished-browse-run", lessonId: "10000000-0000-4000-8000-000000000003", lessonVersion: "fixture-v1", lessonName: "東京の散歩",
      language: "japanese", level: 1, stage: 2, nextUnit: 3, nextPhrase: 3, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
      completedAt: "2026-09-07T01:00:00Z",
    }] });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000003&level=1&stage=2&run=finished-browse-run");
  await page.getByRole("button", { name: "레슨 목록으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\?language=japanese/);
  await expect(page.getByRole("region", { name: "완료 기록" })).toHaveCount(0);
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000003/stages");
  await page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "완료 기록", exact: true }).getByText("스테이지 2", { exact: true })).toBeVisible();
});
