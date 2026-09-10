import { enterAccountPractice, readServerJournal, reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { seedLearningJournal, fixtureRunId } from "./fixtures/cloud-journal";
import { expect, test } from "./fixtures/cloud-ui";
import { lessons } from "./fixtures/cloud-ui";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";
import { testRecording } from "./fixtures/audio";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
});

test("the current-stage shortcut starts immediately and does not follow unrelated previews", async ({ page }) => {
  await page.getByRole("radio", { name: /^8 다문장 암기/ }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).click();
  await enterAccountPractice(page);
  await expect(page).toHaveURL(/level=1(?:&|$)/);
  await expect(page).toHaveURL(/stage=1(?:&|$)/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the shortcut restores the current run and its saved playback settings", async ({ page }) => {
  const lesson = lessons.find(item => item.id === "10000000-0000-4000-8000-000000000001")!;
  await seedLearningJournal(page, { progress: {
    runId: "existing-stage-2", lessonId: lesson.id, lessonVersion: lesson.version, lessonName: lesson.name,
    language: lesson.language, level: 1, stage: 2, nextUnit: 1, nextPhrase: 1, activeMs: 2000,
    settings: { ...DEFAULT_SESSION_SETTINGS, speed: 1.5 }
  } });
  await reloadLearnerPage(page);
  await page.getByRole("button", { name: "현재 스테이지 2 시작", exact: true }).click();
  await enterAccountPractice(page);
  await expect(page).toHaveURL(new RegExp(`run=${fixtureRunId("existing-stage-2")}(?:&|$)`));
  await expect(page).toHaveURL(/stage=2(?:&|$)/);
  await expect(page).toHaveURL(/speed=1.5(?:&|$)/);
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
});

test("stage preview keeps a white title and compact dark-blue instructions", async ({ page }) => {
  await page.getByRole("radio", { name: /^1 자막 쉐도잉/ }).click();
  const popup = page.getByRole("dialog", { name: "자막 쉐도잉", exact: true });
  await expect(popup.getByRole("heading", { name: "자막 쉐도잉", exact: true })).toHaveCSS("color", "rgb(255, 255, 255)");
  const instructions = popup.getByText("자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.", { exact: true });
  await expect(instructions).toHaveCSS("color", "rgb(4, 44, 96)");
  await expect(instructions).toHaveCSS("font-size", "14px");
  await expect(popup.getByRole("button", { name: "세션 설정", exact: true })).toHaveCount(0);
  await expect(popup.getByRole("button", { name: "학습 시작", exact: true })).toBeInViewport();
});

test("home keeps its brand and real streak together in a fixed top navigation", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  await openLearnerPage(page, "/home");
  const nav = page.getByRole("navigation", { name: "상단 탐색", exact: true });
  await expect(nav).toContainText("Meta Shadowing");
  await expect(nav.getByLabel("0일 연속 학습", { exact: true })).toBeVisible();
  const box = await nav.boundingBox();
  await page.getByRole("region", { name: "언어 목록" }).evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await nav.boundingBox()).toEqual(box);
  expect(await page.evaluate(() => ({ top: scrollY, fits: document.documentElement.scrollHeight <= innerHeight })))
    .toEqual({ top: 0, fits: true });
});

test("legacy level two only earns a cloud study day on confirmed listening, not a jump or playback", async ({ page }) => {
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=2&stage=3&mode=manual");
  await page.locator("#player-menu-trigger").click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("button", { name: /^2번 문장/ }).click();
  expect((await readServerJournal(page)).studyDays).toEqual([]);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  const confirm = page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true });
  await expect(confirm).toBeVisible();
  expect((await readServerJournal(page)).studyDays).toEqual([]);
  await confirm.click();
  await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText("필수 1 / 3");
  expect((await readServerJournal(page)).studyDays).toHaveLength(1);
  await openLearnerPage(page, "/home");
  await expect(page.getByLabel("1일 연속 학습", { exact: true })).toBeVisible();
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
  await expect(page.getByRole("navigation", { name: "상단 탐색" }).getByLabel("1일 연속 학습", { exact: true })).toBeVisible();
});
