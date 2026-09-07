import { expect, test } from "@playwright/test";
import { lessons } from "../src/lib/lessons";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";
import { testRecording } from "./fixtures/audio";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/setup?lesson=morning-routine");
});

test("the current-stage shortcut starts immediately and does not follow unrelated previews", async ({ page }) => {
  await page.getByRole("radio", { name: /^8 다문장 암기/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).click();
  await expect(page).toHaveURL(/level=1(?:&|$)/);
  await expect(page).toHaveURL(/stage=1(?:&|$)/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the shortcut restores the current run and its saved playback settings", async ({ page }) => {
  const lesson = lessons.find(item => item.id === "morning-routine")!;
  await page.evaluate(progress => localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify({ progress, history: [] })), {
    runId: "existing-stage-2", lessonId: lesson.id, lessonVersion: lesson.version, lessonName: lesson.name,
    language: lesson.language, level: 1, stage: 2, nextUnit: 1, nextPhrase: 1, activeMs: 2000,
    settings: { ...DEFAULT_SESSION_SETTINGS, speed: 1.5 }
  });
  await page.reload();
  await page.getByRole("button", { name: "현재 스테이지 2 시작", exact: true }).click();
  await expect(page).toHaveURL(/run=existing-stage-2(?:&|$)/);
  await expect(page).toHaveURL(/stage=2(?:&|$)/);
  await expect(page).toHaveURL(/speed=1.5(?:&|$)/);
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
});

test("popup metadata is subordinate while the title and instructions remain white", async ({ page }) => {
  await page.getByRole("radio", { name: /^1 자막 쉐도잉/ }).click();
  const popup = page.getByRole("dialog", { name: "자막 쉐도잉", exact: true });
  await expect(popup.getByText("스테이지 1 · Lv 1", { exact: true })).not.toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(popup.getByRole("heading", { name: "자막 쉐도잉", exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("home keeps its brand and real streak together in a fixed top navigation", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await page.goto("/home");
  const nav = page.getByRole("navigation", { name: "상단 탐색", exact: true });
  await expect(nav).toContainText("Meta Shadowing");
  await expect(nav.getByLabel("0일 연속 학습", { exact: true })).toBeVisible();
  const box = await nav.boundingBox();
  await page.getByRole("region", { name: "언어 목록" }).evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await nav.boundingBox()).toEqual(box);
  expect(await page.evaluate(() => ({ top: scrollY, fits: document.documentElement.scrollHeight <= innerHeight })))
    .toEqual({ top: 0, fits: true });
});

test("only a confirmed listen earns a study day, not a sentence jump or unconfirmed playback", async ({ page }) => {
  await page.goto("/player?lesson=morning-routine&level=1&mode=manual");
  await page.locator("#player-menu-trigger").click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("button", { name: /^2번 문장/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("meta-shadowing:learning:v1")!).studyDays)).toEqual([]);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  const confirm = page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true });
  await expect(confirm).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("meta-shadowing:learning:v1")!).studyDays)).toEqual([]);
  await confirm.click();
  await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText("필수 1 / 3");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("meta-shadowing:learning:v1")!).studyDays)).toHaveLength(1);
  await page.goto("/home");
  await expect(page.getByLabel("1일 연속 학습", { exact: true })).toBeVisible();
  await page.goto("/setup?lesson=morning-routine");
  await expect(page.getByRole("navigation", { name: "상단 탐색" }).getByLabel("1일 연속 학습", { exact: true })).toBeVisible();
});
