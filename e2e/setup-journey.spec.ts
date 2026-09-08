import { readServerJournal, reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { seedServerJournal } from "./fixtures/cloud-journal";
import { expect, test } from "./fixtures/cloud-ui";
import { lessons } from "./fixtures/cloud-ui";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
});

test("the book summary keeps the actual next stage separate from previews and does not invent progress", async ({ page }) => {
  await expect(page.getByRole("progressbar", { name: "완료한 스테이지" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("progressbar", { name: "완료한 스테이지" })).toHaveAttribute("aria-valuemax", "16");
  await page.getByRole("radio", { name: /^8 다문장 암기/ }).click();
  const popup = page.getByRole("dialog", { name: "다문장 암기", exact: true });
  await expect(popup).not.toContainText("스테이지 8 · Lv 4");
  await expect(popup).toHaveCSS("background-color", "rgb(88, 204, 2)");
  await expect(popup.getByText("다문장 암기", { exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(popup.getByRole("button", { name: "학습 시작", exact: true })).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/lessons\/[^/]+\/stages/);
  expect((await readServerJournal(page)).progress).toBeNull();
});

test("the winding path exposes all stages through its own viewport", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  const nodes = page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio");
  await expect(nodes.last()).toBeEnabled();
  await page.evaluate(() => document.fonts.ready);
  const firstThree = await Promise.all([0, 1, 2].map(index => nodes.nth(index).boundingBox()));
  expect(firstThree[1]!.x).toBeGreaterThan(firstThree[0]!.x + 40);
  expect(firstThree[2]!.x).toBeGreaterThan(firstThree[1]!.x + 40);
  await nodes.last().scrollIntoViewIfNeeded();
  await expect(nodes.last()).toBeInViewport({ ratio: 1 });
  await expect(nodes.last()).toContainText("Lv 8");
  expect(await page.evaluate(() => ({ top: scrollY, fits: document.documentElement.scrollHeight <= innerHeight }))).toEqual({ top: 0, fits: true });
});

test("the summary and checkmarks reflect unique completed stages from the real journal", async ({ page }) => {
  const lesson = lessons.find(item => item.id === "10000000-0000-4000-8000-000000000001")!;
  const record = { runId: "stage-complete", lessonId: lesson.id, lessonVersion: lesson.version,
    lessonName: lesson.name, language: lesson.language, level: 4, stage: 8, nextUnit: 3, nextPhrase: 3,
    activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS, completedAt: "2026-09-07T00:00:00Z" };
  await seedServerJournal(page, { history: [record, { ...record, runId: "replay" }, { ...record, stage: 7, lessonVersion: "old" }] });
  await reloadLearnerPage(page);
  await expect(page.getByRole("progressbar", { name: "완료한 스테이지" })).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByRole("radio", { name: "8 다문장 암기 Lv 4 · 완료", exact: true })).toBeEnabled();
  await expect(page.getByRole("radio", { name: "7 다문장 암기 Lv 4", exact: true })).toBeEnabled();
});
