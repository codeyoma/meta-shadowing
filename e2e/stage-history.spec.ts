import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";
import type { CompletionRecord, ProgressRecord } from "../src/lib/learning-records";

const key = "meta-shadowing:learning:v1";
const stages = "/lessons/morning-routine/stages";
const recordsIn = (dialog: Locator) => dialog.getByRole("row").filter({ has: dialog.page().getByRole("button", { name: "설정 보기", exact: true }) });
async function settingsFor(button: Locator) {
  return button.page().locator(`[id="${await button.getAttribute("aria-controls")}"]`);
}
const complete = (stage: number, overrides: Partial<CompletionRecord> = {}): CompletionRecord => ({
  runId: `stage-${stage}`, lessonId: "morning-routine", lessonVersion: "fixture-v1", lessonName: "Morning Routine",
  language: "english", level: Math.ceil(stage / 2), stage, nextUnit: 3, nextPhrase: 3, activeMs: stage * 1000,
  settings: DEFAULT_SESSION_SETTINGS, completedAt: `2026-09-08T01:${String(stage).padStart(2, "0")}:00Z`, ...overrides,
});
async function seed(page: Page, history: CompletionRecord[], progress: ProgressRecord | null = null) {
  await page.goto("/languages");
  await page.evaluate(({ key, history, progress }) => localStorage.setItem(key, JSON.stringify({ history, progress, studyDays: [] })), { key, history, progress });
  await page.goto(stages);
  await expect(page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true })).toBeEnabled();
}

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
});

test("history moves off lessons into a lesson-only dialog, preserving old versions and saved data", async ({ page }) => {
  const records = [complete(1), complete(8, { runId: "old", lessonVersion: "old-v1", completedAt: "2026-09-07T01:00:00Z" }),
    complete(4, { lessonId: "daily-conversation" }), complete(2)];
  await seed(page, records);
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  await page.goto("/lessons?language=english");
  await expect(page.getByRole("region", { name: "완료 기록", exact: true })).toHaveCount(0);
  await page.goto(stages);
  const trigger = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
  const start = page.getByRole("button", { name: "현재 스테이지 3 시작", exact: true });
  await expect(trigger).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const [a, b] = await Promise.all([trigger.boundingBox(), start.boundingBox()]);
  expect(a!.x + a!.width).toBeLessThan(b!.x);
  expect(a!.height).toBeCloseTo(b!.height, 0);
  expect(a!.width).toBeCloseTo(b!.width, 0);
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "완료 기록", exact: true });
  const table = dialog.getByRole("table", { name: "이 레슨의 완료 기록", exact: true });
  await expect(table).toHaveAttribute("data-slot", "table");
  await expect(table.getByRole("columnheader")).toHaveText(["단계", "완료일시", "학습시간", "설정"]);
  const items = recordsIn(dialog);
  await expect(items).toHaveCount(3);
  await expect(items.nth(0)).toContainText("스테이지 2");
  await expect(items.nth(1)).toContainText("스테이지 1");
  await expect(items.nth(2)).toContainText("스테이지 8");
  await expect(items.first().getByLabel("완료 날짜")).toHaveAttribute("datetime", records[3].completedAt);
  await expect(items.first().getByLabel("완료 날짜")).toContainText(/\d{2}:\d{2}:\d{2}/);
  await expect(items.first().getByLabel("활성 학습시간")).toHaveText("2.0초");
  const settings = items.last().getByRole("button", { name: "설정 보기", exact: true });
  await settings.click();
  await expect(settings).toHaveAttribute("aria-expanded", "true");
  await expect(await settingsFor(settings)).toContainText("버전 old-v1");
  await expect(await settingsFor(settings)).toContainText("수동");
  await settings.click();
  await expect(settings).toHaveAttribute("aria-expanded", "false");
  await expect(await settingsFor(settings)).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: "완료 기록 닫기", exact: true }).click();
  await expect(trigger).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe(original);
  await expect(page).toHaveURL(new RegExp(`${stages}$`));
});

test("empty history is meaningful and each opening reads freshly saved records", async ({ page }) => {
  await seed(page, [complete(1, { lessonId: "daily-conversation" })]);
  const trigger = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
  await trigger.click();
  await expect(page.getByRole("dialog")).toContainText("아직 완료한 학습이 없습니다.");
  await page.keyboard.press("Escape");
  await page.evaluate(({ key, record }) => {
    const journal = JSON.parse(localStorage.getItem(key)!);
    journal.history.push(record);
    localStorage.setItem(key, JSON.stringify(journal));
  }, { key, record: complete(1) });
  await trigger.click();
  await expect(recordsIn(page.getByRole("dialog"))).toHaveCount(1);
});

test("the recommended stage uses the idle background until its preview is selected", async ({ page }) => {
  await seed(page, [complete(1), complete(2)]);
  const current = page.getByRole("radio", { name: "3 순간 암기 Lv 2", exact: true });
  const node = current.locator('[class*="levelNode"]');
  await expect(current).toHaveAttribute("aria-current", "step");
  await expect(current).toHaveAttribute("aria-checked", "false");
  await expect(node).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await current.click();
  await expect(current).toHaveAttribute("aria-checked", "true");
  await expect(node).toHaveCSS("background-color", "rgb(88, 204, 2)");
  await page.keyboard.press("Escape");
  await expect(current).toHaveAttribute("aria-checked", "false");
  await expect(node).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(current.locator('[data-stage-arc]')).toBeVisible();
});

test("clicking a selected stage again clears its selection without clearing completion", async ({ page }) => {
  await seed(page, [complete(1), complete(2)]);
  const stage = page.getByRole("radio", { name: "5 첫 단어 힌트 Lv 3", exact: true });
  const node = stage.locator('[class*="levelNode"]');
  await stage.click();
  await expect(stage).toHaveAttribute("aria-checked", "true");
  await expect(node).toHaveCSS("background-color", "rgb(88, 204, 2)");
  await stage.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(stage).toHaveAttribute("aria-checked", "false");
  await expect(node).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
  const completed = page.getByRole("radio", { name: "1 자막 쉐도잉 Lv 1 · 완료", exact: true });
  await completed.click();
  await completed.click();
  await expect(completed).toHaveAttribute("aria-checked", "false");
  await expect(completed.locator('[class*="levelNode"]')).toHaveCSS("background-color", "rgb(88, 204, 2)");
});

test("only the recommended stage has a clockwise border arc, even when preview selection changes", async ({ page }) => {
  await seed(page, [complete(1), complete(2)]);
  const current = page.getByRole("radio", { name: "3 순간 암기 Lv 2", exact: true });
  await expect(current).toHaveAttribute("aria-current", "step");
  await expect(page.locator('[data-stage-ring]')).toHaveCount(1);
  const ring = current.locator('[data-stage-ring]');
  await expect(ring).toBeVisible();
  await expect(ring).toHaveAttribute("aria-hidden", "true");
  await expect(current.getByRole("progressbar")).toHaveCount(0);
  const arc = ring.locator('[data-stage-arc]');
  await expect(arc).toBeVisible();
  await expect(arc).toHaveCSS("stroke-width", "4px");
  await page.getByRole("radio", { name: "5 첫 단어 힌트 Lv 3", exact: true }).click();
  await expect(current).toHaveAttribute("aria-checked", "false");
  await expect(current).toHaveAttribute("aria-current", "step");
  await expect(page.locator('[data-stage-ring]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "5 첫 단어 힌트 Lv 3", exact: true })).toBeFocused();
  await current.scrollIntoViewIfNeeded();
  await expect(current).toBeInViewport({ ratio: 0.8 });
  await expect.poll(() => arc.evaluate(el => el.getAnimations().filter(a => a.playState === "running").length)).toBe(1);
  const stateAt = (time: number) => arc.evaluate((el, time) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime = time;
    const ring = el.closest('[data-stage-ring]')!;
    const ringBox = ring.getBoundingClientRect();
    const nodeBox = ring.parentElement!.getBoundingClientRect();
    // Focus restoration may scroll the page; the border must stay fixed to its node.
    return {
      offset: parseFloat(getComputedStyle(el).strokeDashoffset),
      box: { x: ringBox.x - nodeBox.x, y: ringBox.y - nodeBox.y, width: ringBox.width, height: ringBox.height },
      transform: getComputedStyle(ring).transform,
    };
  }, time);
  const initial = await stateAt(0);
  const quarter = await stateAt(600);
  const half = await stateAt(1200);
  expect(quarter.offset).toBeLessThan(initial.offset);
  expect(half.offset).toBeLessThan(quarter.offset);
  expect(quarter.box).toEqual(initial.box);
  expect(half.box).toEqual(initial.box);
  expect(initial.transform).toBe("none");
  expect(await arc.evaluate(el => getComputedStyle(el).strokeDasharray.split(/[ ,]+/).map(Number.parseFloat).every(n => n > 0))).toBe(true);
  await current.screenshot({ path: test.info().outputPath("current-stage-arc.png"), scale: "css" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => ring.evaluate(el => el.getAnimations({ subtree: true }).length)).toBe(0);
  await expect(arc).toBeVisible();
  expect(await arc.evaluate(el => parseFloat(getComputedStyle(el).strokeWidth))).toBeGreaterThan(0);
});

test("resuming a stage takes priority and a fully completed lesson has no ring", async ({ page }) => {
  await seed(page, [complete(1)], { ...complete(5), runId: "resume-five", nextPhrase: 1, nextUnit: 1 });
  await expect(page.getByRole("radio", { name: "5 첫 단어 힌트 Lv 3", exact: true })).toHaveAttribute("aria-current", "step");
  await seed(page, Array.from({ length: 16 }, (_, i) => complete(i + 1)));
  await expect(page.locator('[data-stage-ring]')).toHaveCount(0);
  await expect(page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true })).toContainText("복습");
});

for (const viewport of [{ width: 430, height: 932 }, { width: 1280, height: 800 }, { width: 320, height: 740 }, { width: 568, height: 320 }]) {
  test(`history remains usable and scrollable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const issues: string[] = [];
    page.on("pageerror", error => issues.push(error.message));
    page.on("console", message => { if (["error", "warning"].includes(message.type())) issues.push(message.text()); });
    await seed(page, Array.from({ length: 30 }, (_, i) => complete(i % 2 + 1, { runId: `repeat-${i}` })));
    await expect(page).toHaveTitle(/Meta Shadowing/i);
    await expect(page.getByRole("heading", { name: "Morning Routine", exact: true })).toBeVisible();
    const statistics = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
    const start = page.getByRole("button", { name: "현재 스테이지 3 시작", exact: true });
    await statistics.scrollIntoViewIfNeeded();
    await page.evaluate(() => document.fonts.ready);
    const [statisticsBox, startBox] = await Promise.all([statistics.boundingBox(), start.boundingBox()]);
    expect(statisticsBox!.width).toBeCloseTo(startBox!.width, 0);
    expect(statisticsBox!.height).toBeCloseTo(startBox!.height, 0);
    expect(await start.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.getByRole("radio", { name: "3 순간 암기 Lv 2", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: test.info().outputPath(`stages-${viewport.width}.png`), scale: "css" });
    await page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "완료 기록", exact: true });
    const records = recordsIn(dialog);
    const table = dialog.getByRole("table", { name: "이 레슨의 완료 기록", exact: true });
    await expect(records).toHaveCount(30);
    await expect(table).toHaveCSS("font-size", "12px");
    expect(await table.evaluate(el => el.parentElement!.scrollWidth <= el.parentElement!.clientWidth)).toBe(true);
    const close = dialog.getByRole("button", { name: "닫기", exact: true });
    const closeBefore = await close.boundingBox();
    const lastSettings = records.last().getByRole("button", { name: "설정 보기", exact: true });
    await lastSettings.click();
    await expect(await settingsFor(lastSettings)).toContainText("버전 fixture-v1");
    await (await settingsFor(lastSettings)).scrollIntoViewIfNeeded();
    const closeAfter = (await close.boundingBox())!;
    expect(closeAfter.y).toBeCloseTo(closeBefore!.y, 0);
    expect(closeAfter.y + closeAfter.height).toBeLessThanOrEqual(viewport.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const firstSettings = records.first().getByRole("button", { name: "설정 보기", exact: true });
    await firstSettings.click();
    await expect(await settingsFor(firstSettings)).toContainText("버전 fixture-v1");
    await expect((await settingsFor(firstSettings)).getByText("버전 fixture-v1", { exact: true })).toHaveCSS("font-size", "12px");
    await page.screenshot({ path: test.info().outputPath(`history-${viewport.width}.png`), animations: "disabled", scale: "css" });
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
    await close.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('nextjs-portal').getByText(/Build Error|Runtime Error/)).toHaveCount(0);
    expect(issues).toEqual([]);
  });
}
