import { readDeviceJournal, readServerJournal, openLearnerPage } from "./fixtures/cloud-navigation";
import { seedLearningJournal } from "./fixtures/cloud-journal";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";

const stages = "/lessons/10000000-0000-4000-8000-000000000001/stages";

async function openStages(page: Page) {
  await page.clock.setFixedTime(new Date("2026-09-08T12:00:00+09:00"));
  await openLearnerPage(page, "/languages");
  await seedLearningJournal(page, {
    progress: null, studyDays: ["2026-09-07", "2026-09-08"],
    history: [1, 2].map(stage => ({
      runId: `complete-${stage}`, lessonId: "10000000-0000-4000-8000-000000000001", lessonVersion: "fixture-v1", lessonName: "Morning Routine",
      language: "english", level: 1, stage, nextPhrase: 3, nextUnit: 3, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS,
      completedAt: `2026-09-08T01:0${stage}:00Z`,
    })),
  });
  await openLearnerPage(page, stages);
  await expect(page.getByRole("button", { name: "현재 스테이지 3 시작", exact: true })).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
}

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
});

test("desktop browse destinations retain a centered phone-width shell", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openStages(page);
  for (const route of ["/languages", "/lessons?language=english", stages, "/settings?language=english&lesson=10000000-0000-4000-8000-000000000001", "/settings/session?language=english&lesson=10000000-0000-4000-8000-000000000001&stage=3&level=2"]) {
    await openLearnerPage(page, route);
    await expect(page).toHaveTitle(/Meta Shadowing/);
    const box = (await page.locator("main").boundingBox())!;
    expect(box.width).toBeCloseTo(430, 0);
    expect(box.x + box.width / 2).toBeCloseTo(640, 0);
    for (const name of ["상단 탐색", "하단 탐색"]) {
      const nav = (await page.locator(`nav[aria-label="${name}"]`).boundingBox())!;
      expect(nav.x).toBeGreaterThanOrEqual(box.x);
      expect(nav.x + nav.width).toBeLessThanOrEqual(box.x + box.width);
    }
  }
});

test("streak uses overlapping orange and yellow flames without a badge background", async ({ page }) => {
  await openStages(page);
  const streak = page.getByLabel("2일 연속 학습", { exact: true });
  await expect(streak).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const flames = streak.locator("svg");
  await expect(flames).toHaveCount(2);
  const [outer, inner] = await flames.evaluateAll(elements => elements.map(el => ({
    box: el.getBoundingClientRect().toJSON(), color: getComputedStyle(el).color,
    fill: getComputedStyle(el).fill, path: el.querySelector("path")?.getAttribute("d"),
  })));
  expect(outer.path).toBe(inner.path);
  expect(outer.box.width).toBeGreaterThan(inner.box.width);
  expect(inner.box.x).toBeGreaterThan(outer.box.x);
  expect(inner.box.x + inner.box.width).toBeLessThan(outer.box.x + outer.box.width);
  expect(inner.box.y).toBeGreaterThan(outer.box.y);
  expect(inner.box.y + inner.box.height).toBeLessThanOrEqual(outer.box.y + outer.box.height);
  expect(outer.color).toBe("rgb(255, 150, 0)");
  expect(inner.color).toBe("rgb(255, 200, 0)");
  expect(outer.fill).toBe(outer.color);
  expect(inner.fill).toBe(inner.color);
  await expect(streak).toHaveText("2");
});

test("stage metadata does not shift the method name away from the button and play-icon center", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await openStages(page);
  const start = page.getByRole("button", { name: "현재 스테이지 3 시작", exact: true });
  const metadata = start.getByText("스테이지 3 · Lv 2", { exact: true });
  await expect(metadata).toHaveCSS("font-size", "10px");
  const [button, title, icon, caption] = await Promise.all([
    start.boundingBox(), start.getByText("순간 암기", { exact: true }).boundingBox(),
    start.locator("svg").boundingBox(), metadata.boundingBox(),
  ]);
  expect(title!.y + title!.height / 2).toBeCloseTo(icon!.y + icon!.height / 2, 0);
  expect(icon!.x + icon!.width).toBeLessThan(title!.x);
  expect((icon!.x + title!.x + title!.width) / 2).toBeCloseTo(button!.x + button!.width / 2, 0);
  const text = await start.getByText("순간 암기", { exact: true }).evaluate(el => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect().toJSON();
  });
  expect((icon!.x + text.x + text.width) / 2).toBeCloseTo(button!.x + button!.width / 2, 0);
  expect(title!.y + title!.height / 2).toBeCloseTo(button!.y + button!.height / 2, 0);
  expect(caption!.y + caption!.height).toBeLessThanOrEqual(title!.y);
  expect(caption!.x).toBeCloseTo(title!.x, 0);
  expect(caption!.y).toBeGreaterThanOrEqual(button!.y);
});

for (const viewport of [{ width: 430, height: 932 }, { width: 1280, height: 900 }, { width: 320, height: 740 }, { width: 568, height: 320 }]) {
  test(`single-column stage controls remain usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const issues: string[] = [];
    page.on("pageerror", error => issues.push(error.message));
    page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400) issues.push(`HTTP ${response.status()}: ${response.url()}`); });
    await openStages(page);
    await expect(page.getByRole("heading", { name: "Morning Routine", exact: true })).toBeVisible();
    const history = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
    await expect(history.getByText("완료 기록", { exact: true })).toBeVisible();
    await history.scrollIntoViewIfNeeded();
    const start = page.getByRole("button", { name: "현재 스테이지 3 시작", exact: true });
    const [historyBox, startBox] = await Promise.all([history.boundingBox(), start.boundingBox()]);
    expect(historyBox!.width).toBeCloseTo(startBox!.width, 0);
    expect(historyBox!.height).toBeCloseTo(startBox!.height, 0);
    for (const button of [history, start]) expect(await button.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    const pathBox = (await page.getByRole("region", { name: "학습 단계 목록", exact: true }).boundingBox())!;
    expect(pathBox.y).toBeGreaterThan(startBox!.y + startBox!.height);
    expect(pathBox.width).toBeLessThanOrEqual(390);
    await page.screenshot({ path: test.info().outputPath(`stages-${viewport.width}.png`), animations: "disabled", scale: "css" });
    await history.click();
    const dialog = page.getByRole("dialog", { name: "완료 기록", exact: true });
    await expect(dialog.getByRole("table")).toBeVisible();
    await dialog.getByRole("button", { name: "설정 보기", exact: true }).first().click();
    await expect(dialog.getByText("버전 2026-09-01T00:00:00+00:00", { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "확인", exact: true }).click();
    await expect(history).toBeFocused();
    const lastStage = page.getByRole("radio", { name: /^16 / });
    await lastStage.click();
    const preview = page.getByRole("dialog", { name: "속사포 한글", exact: true });
    await expect(preview).toBeVisible();
    await page.screenshot({ path: test.info().outputPath(`preview-${viewport.width}.png`), animations: "disabled", scale: "css" });
    await preview.getByRole("button", { name: "스테이지 안내 닫기", exact: true }).click();
    await expect(lastStage).toBeFocused();
    await page.getByRole("navigation", { name: "하단 탐색", exact: true }).getByRole("button", { name: "설정", exact: true }).click();
    await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
    await page.getByRole("dialog", { name: "설정", exact: true }).getByRole("button", { name: "닫기", exact: true }).click();
    await page.getByRole("navigation", { name: "하단 탐색", exact: true }).getByRole("link", { name: "스테이지", exact: true }).click();
    await expect(lastStage).toBeInViewport();
    expect(await page.evaluate(() => ({ top: scrollY, width: document.documentElement.scrollWidth <= innerWidth, height: document.documentElement.scrollHeight <= innerHeight }))).toEqual({ top: 0, width: true, height: true });
    await expect(page.locator("nextjs-portal").getByText(/Build Error|Runtime Error/)).toHaveCount(0);
    expect(issues).toEqual([]);
  });
}

test("scrolling upward over the short-screen path returns to the summary actions", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await openStages(page);
  await page.getByRole("radio", { name: /^16 / }).click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: /^16 / })).toBeFocused();
  const list = page.getByRole("region", { name: "학습 단계 목록", exact: true });
  await list.evaluate(el => { el.scrollTop = 0; });
  await list.hover();
  await page.mouse.wheel(0, -1500);
  const history = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
  await expect(history).toBeInViewport({ ratio: 0.8 });
  await history.click();
  await expect(page.getByRole("dialog", { name: "완료 기록", exact: true })).toBeVisible();
});

test("long resume metadata and a wrapping method remain separated and centered", async ({ page }) => {
  // Fixed step names let CI retain timings without publishing selectors or data.
  await test.step("resume:open-stages:0", () => openStages(page));
  const journal = await test.step("resume:server-journal:0", () => readServerJournal(page));
  const local = await test.step("resume:device-journal:0", () => readDeviceJournal(page));
  if (!local?.history[0]) throw new Error("Expected the seeded local completion");
  await test.step("resume:seed:0", () => seedLearningJournal(page, { ...journal, history: [...journal.history, ...local.history],
    progress: { ...local.history[0], runId: "resume-ten", stage: 10, level: 5, nextPhrase: 1, nextUnit: 1 } }));
  for (const width of [320, 360, 375, 390, 430]) {
    await test.step(`resume:viewport:${width}`, () => page.setViewportSize({ width, height: 740 }));
    await test.step(`resume:navigate:${width}`, () => openLearnerPage(page, stages));
    const start = page.getByRole("button", { name: "현재 스테이지 10 시작", exact: true });
    await test.step(`resume:ready:${width}`, () => expect(start).toBeEnabled());
    await test.step(`resume:fonts:${width}`, () => page.evaluate(() => document.fonts.ready));
    const [button, title, icon, caption] = await test.step(`resume:measure:${width}`, () => Promise.all([
      start.boundingBox(), start.getByText("다문장 첫 단어", { exact: true }).boundingBox(), start.locator("svg").boundingBox(),
      start.getByText("이어서 학습 10 · Lv 5", { exact: true }).boundingBox(),
    ]));
    await test.step(`resume:assert:${width}`, async () => {
      expect(caption!.y + caption!.height).toBeLessThanOrEqual(title!.y);
      expect(caption!.x).toBeCloseTo(title!.x, 0);
      expect(caption!.y).toBeGreaterThanOrEqual(button!.y);
      expect(title!.y + title!.height / 2).toBeCloseTo(icon!.y + icon!.height / 2, 0);
      expect(icon!.x + icon!.width).toBeLessThan(title!.x);
      expect((icon!.x + title!.x + title!.width) / 2).toBeCloseTo(button!.x + button!.width / 2, 0);
      expect(title!.y + title!.height / 2).toBeCloseTo(button!.y + button!.height / 2, 0);
      expect(await start.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    });
    await test.step(`resume:screenshot:${width}`, () => start.screenshot({ path: test.info().outputPath(`resume-${width}.png`), animations: "disabled", scale: "css" }));
  }
});
