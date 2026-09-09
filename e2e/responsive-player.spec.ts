import { enterAccountPractice, openLearnerPage, readServerJournal } from "./fixtures/cloud-navigation";
import { seedServerJournal, fixtureVersion } from "./fixtures/cloud-journal";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";

async function openPlayer(page: Page, query = "") {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=1${query}`);
  await page.waitForLoadState("networkidle");
}

test("one Repeat adds two circle slots and manual Continue completes them before Next", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPlayer(page);
  const actions = page.getByRole("group", { name: "학습 진행", exact: true });
  const cycles = page.getByLabel("완료한 듣기");
  const dots = cycles.locator("[data-complete]");
  await expect(dots).toHaveCount(3);
  const guidanceBox = (await page.getByLabel("레슨 안내", { exact: true }).boundingBox())!;
  const cyclesBox = (await cycles.boundingBox())!;
  const sentenceBox = (await page.getByRole("region", { name: "학습 자막" }).boundingBox())!;
  expect(cyclesBox.y).toBeGreaterThanOrEqual(guidanceBox.y + guidanceBox.height);
  expect(cyclesBox.y).toBeGreaterThanOrEqual(sentenceBox.y + sentenceBox.height);
  expect(cyclesBox.y + cyclesBox.height).toBeLessThanOrEqual((await actions.boundingBox())!.y);
  await expect(actions.getByRole("button")).toHaveCount(1);
  await actions.getByRole("button", { name: /^CONTINUE/ }).click();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page);
    await expect(cycles).toHaveText(`필수 ${cycle} / 3`);
    await expect(cycles.locator('[data-complete="true"] svg')).toHaveCount(cycle);
  }
  await expect(actions.getByRole("button")).toHaveCount(2);
  await expect(actions.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  for (const button of await actions.getByRole("button").all()) {
    const box = (await button.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(568);
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    expect(await button.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  // Hold the real fourth recording at playback start so the two-pending state
  // cannot disappear before the assertion on a slow CI worker.
  await page.locator("audio").evaluate(element => {
    const audio = element as HTMLAudioElement;
    audio.addEventListener("playing", () => audio.pause(), { once: true });
  });
  await actions.getByRole("button", { name: /^REPEAT/ }).click();
  await expect(dots).toHaveCount(5);
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  await expect(cycles.locator('[data-complete="false"]')).toHaveCount(2);
  await actions.getByRole("button", { name: /^CONTINUE/ }).click();
  await confirmManualListen(page);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await expect(actions.getByRole("button", { name: /^REPEAT|^NEXT/ })).toHaveCount(0);
  await confirmManualListen(page);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 2 / 2");
  await expect(cycles.locator('[data-complete="true"]')).toHaveCount(5);
  await expect(actions.getByRole("button", { name: /^REPEAT/ })).toHaveCount(0);
  await expect(actions.getByRole("button")).toHaveCount(1);
  await actions.getByRole("button", { name: /^NEXT/ }).click();
  await expect(page.getByRole("region", { name: "학습 자막" })).toContainText("I wash my face.");
  await expect(cycles).toHaveText("필수 0 / 3");
  await expect(dots).toHaveCount(3);
});

test("help stays collapsed and playback uses one control without a timeline", async ({ page }) => {
  await page.setViewportSize({ width: 583, height: 1488 });
  await openPlayer(page);
  await expect(page.getByLabel("학습 방법", { exact: true })).toBeHidden();
  await expect(page.getByText(/^\d\d:\d\d\.\d$/)).toHaveCount(0);
  const outline = page.getByRole("progressbar", { name: "원음 재생 진행" });
  await expect(outline).toBeVisible();
  expect((await outline.boundingBox())!.width).toBe(28);
  await expect(page.getByLabel("완료한 듣기").locator('[data-current="true"]').getByRole("progressbar")).toHaveCount(1);
  await page.keyboard.press("Space");
  await confirmManualListen(page, "keyboard");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await expect(page.getByRole("button", { name: "학습 일시정지", exact: true })).toHaveCount(0);
  await expect(page.getByRole("group", { name: "학습 진행", exact: true }).getByRole("button")).toHaveCount(1);
});

test("the focused main action confirms with Space while r and R are ignored and arrows preserve progress", async ({ page }) => {
  await openPlayer(page);
  const continueButton = page.getByRole("button", { name: /^CONTINUE/ });
  const subtitles = page.getByRole("region", { name: "학습 자막", exact: true });
  const cycles = page.getByLabel("완료한 듣기");
  await continueButton.click();
  await waitForManualListen(page);
  await expect(cycles).toHaveText("필수 0 / 3");
  await continueButton.focus();
  await page.keyboard.press("r");
  await page.keyboard.press("R");
  await waitForManualListen(page);
  await expect(cycles).toHaveText("필수 0 / 3");
  await expect(page.locator("audio")).toHaveJSProperty("ended", true);
  await page.keyboard.press("Space");
  await expect(cycles).toHaveText("필수 1 / 3");
  await subtitles.focus();
  await confirmManualListen(page, "keyboard");
  await expect(cycles).toHaveText("필수 2 / 3");
  await confirmManualListen(page, "keyboard");
  await expect(cycles).toHaveText("필수 3 / 3");
  await page.keyboard.press("Space");
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  await continueButton.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  await subtitles.focus();
  await page.keyboard.press("Space");
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page, "keyboard");
    await expect(cycles).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.getByRole("button", { name: /^NEXT/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "2");
});

test("Repeat resumes a paused checkpoint and only Next remains after the fifth listen", async ({ page }) => {
  await openPlayer(page);
  await page.keyboard.press("Space");
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page, "keyboard");
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 0 / 2");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 2 / 2");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await page.keyboard.press("Escape");
  const actions = page.getByRole("group", { name: "학습 진행", exact: true });
  await expect(actions.getByRole("button")).toHaveCount(1);
  await expect(actions.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "0");
});

for (const level of [1, 8]) test(`level ${level} automatically starts a new lesson version at the first phrase and preserves history`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  const previous = {
      runId: "previous-version-run", lessonId: "10000000-0000-4000-8000-000000000001", lessonVersion: "2026-08-01T00:00:00+00:00",
      lessonName: "Morning Routine", language: "english" as const, level, nextUnit: 1, nextPhrase: 1, activeMs: 1000, settings: DEFAULT_SESSION_SETTINGS
  };
  await seedServerJournal(page, { progress: previous, history: [{
    ...previous, runId: "completed-previous-version", nextUnit: 3, nextPhrase: 3, completedAt: "2026-08-02T00:00:00Z",
  }] });
  const before = await readServerJournal(page);
  await page.goto(`/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}`);
  // Entry is automatic: a transient pre-entry notice is not the contract.
  // Do not use the takeover helper to silently accept an unexpected prompt.
  await expect(page.getByRole("button", { name: /^CONTINUE/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "이 기기에서 이어 학습", exact: true })).toHaveCount(0);
  const after = await readServerJournal(page);
  expect(after.progress).toMatchObject({ lessonId: previous.lessonId, level, nextUnit: 0, nextPhrase: 0, activeMs: 0 });
  expect(Date.parse(after.progress.lessonVersion)).toBe(Date.parse(fixtureVersion));
  expect(after.progress.runId).not.toBe(before.progress.runId);
  expect(after.history).toEqual(before.history);
  const box = (await page.getByRole("group", { name: "학습 진행", exact: true }).boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
});

for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 844, height: 390 }, { width: 768, height: 1024 },
  { width: 1024, height: 768 }, { width: 1440, height: 900 }
]) test(`compact player keeps the sentence and bottom action usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await openPlayer(page);
  const canvas = page.getByRole("region", { name: "학습 자막" });
  const footer = page.getByRole("group", { name: "학습 진행", exact: true });
  await expect(footer).toBeVisible();
  const actionBox = (await footer.boundingBox())!;
  const canvasBox = (await canvas.boundingBox())!;
  expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(viewport.height);
  expect(canvasBox.y + canvasBox.height).toBeLessThanOrEqual(actionBox.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const font = await canvas.locator('[lang="en"]').evaluate(element => parseFloat(getComputedStyle(element).fontSize));
  expect(font).toBeGreaterThanOrEqual(22);
  expect(font).toBeLessThanOrEqual(28);
  for (const button of await page.getByRole("main").getByRole("button").all()) {
    // Inline dictionary words follow subtitle typography; standalone controls
    // retain the full touch-target requirement.
    if (await button.getAttribute("data-dictionary-word") !== null) continue;
    const box = await button.boundingBox();
    if (box) expect(Math.min(box.width, box.height), (await button.getAttribute("aria-label")) ?? undefined).toBeGreaterThanOrEqual(44);
  }
  const icons = page.locator("main button svg");
  expect(await icons.count()).toBeGreaterThan(0);
  for (const icon of await icons.all()) {
    const box = await icon.boundingBox();
    if (box) expect(Math.max(box.width, box.height)).toBeLessThanOrEqual(24);
  }
  await footer.getByRole("button", { name: /^CONTINUE/ }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});
