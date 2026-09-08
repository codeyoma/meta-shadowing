import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

async function openPlayer(page: Page, mode = "manual") {
  await page.addInitScript(() => {
    const audioWindow = window as typeof window & { successTones: number[] };
    audioWindow.successTones = [];
    const createOscillator = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () {
      const oscillator = createOscillator.call(this);
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (when?: number) => { audioWindow.successTones.push(oscillator.frequency.value); start(when); };
      return oscillator;
    };
  });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=morning-routine&level=1&mode=${mode}`);
}

const tones = (page: Page) => page.evaluate(() => (window as typeof window & { successTones: number[] }).successTones);

test("manual confirmations add checks and play one success chime on the third, not on replay or menu dismissal", async ({ page }) => {
  await openPlayer(page);
  const progress = page.getByLabel("완료한 듣기", { exact: true });
  const continueButton = page.getByRole("button", { name: /^CONTINUE/ });
  await continueButton.click();
  for (let count = 1; count <= 3; count++) {
    await expect(page.locator("audio")).toHaveJSProperty("ended", true);
    await expect(continueButton).toBeVisible();
    await expect(progress).toHaveText(`필수 ${count - 1} / 3`);
    expect(await tones(page)).toHaveLength(0);
    await continueButton.click();
    await expect(progress).toHaveText(`필수 ${count} / 3`);
  }
  await expect(page.getByRole("button", { name: /^REPEAT/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  await expect.poll(() => tones(page)).toHaveLength(3);
  const melody = await tones(page);
  expect(melody[0]).toBeLessThan(melody[1]);
  expect(melody[1]).toBeLessThan(melody[2]);
  await page.getByRole("button", { name: "메타쉐도잉 레벨 1", exact: true }).click();
  await page.keyboard.press("Escape");
  expect(await tones(page)).toHaveLength(3);
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  for (const count of [1, 2]) {
    await expect(page.locator("audio")).toHaveJSProperty("ended", true);
    await expect(continueButton).toBeVisible();
    await expect(progress).toHaveText(`필수 3 / 3 · 추가 ${count - 1} / 2`);
    await continueButton.click();
    await expect(progress).toHaveText(`필수 3 / 3 · 추가 ${count} / 2`);
  }
  expect(await tones(page)).toHaveLength(3);
});

test("automatic checks wait for the full timer and the third check chimes without advancing", async ({ page }) => {
  await openPlayer(page, "automatic");
  await page.clock.install({ time: new Date("2026-09-07T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-07T00:01:00Z"));
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  const progress = page.getByLabel("완료한 듣기", { exact: true });
  for (let count = 1; count <= 3; count++) {
    await expect(page.getByRole("timer")).toBeVisible();
    await expect(progress).toHaveText(`필수 ${count - 1} / 3`);
    expect(await tones(page)).toHaveLength(0);
    const remainingMs = Number((await page.getByRole("timer").innerText()).replace("초", "")) * 1000;
    await page.clock.runFor(remainingMs + 100);
    await expect(progress).toHaveText(`필수 ${count} / 3`);
    const journal = await page.evaluate(() => JSON.parse(localStorage.getItem("meta-shadowing:learning:v1")!));
    expect(journal.studyDays).toHaveLength(1);
    expect(journal.progress.nextPhrase).toBe(0);
  }
  await expect.poll(() => tones(page)).toHaveLength(3);
  await expect(page.getByRole("button", { name: /^REPEAT/ })).toBeVisible();
  await page.clock.runFor(60000);
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행", exact: true })).toHaveAttribute("aria-valuenow", "0");
  expect(await tones(page)).toHaveLength(3);
});

test("header segments highlight help or settings only while their popup is open", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await openPlayer(page);
  const help = page.locator("#practice-help-trigger");
  const settings = page.locator("#player-settings-trigger");
  const analysis = page.getByRole("button", { name: "문장 분석", exact: true });
  await expect(help).toHaveAttribute("data-selected", "false");
  await expect(settings).toHaveAttribute("data-selected", "false");
  await help.click();
  await expect(help).toHaveAttribute("data-selected", "true");
  await expect(settings).toHaveAttribute("data-selected", "false");
  await page.keyboard.press("Escape");
  await expect(help).toHaveAttribute("data-selected", "false");
  await expect(help).toBeFocused();
  await settings.click();
  await expect(settings).toHaveAttribute("data-selected", "true");
  await expect(help).toHaveAttribute("data-selected", "false");
  await page.mouse.click(2, 2);
  await expect(settings).toHaveAttribute("data-selected", "false");
  await expect(settings).toBeFocused();
  for (const item of [help, settings, analysis]) {
    const box = (await item.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(430);
  }
});

test("settings selection follows sheet navigation without changing the original focus target", async ({ page }) => {
  await openPlayer(page);
  const menu = page.locator("#player-menu-trigger");
  const settings = page.locator("#player-settings-trigger");
  await menu.click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(settings).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Escape");
  await expect(settings).toHaveAttribute("data-selected", "false");
  await expect(menu).toBeFocused();
  await settings.click();
  await page.getByRole("button", { name: "메뉴로 돌아가기" }).click();
  await expect(settings).toHaveAttribute("data-selected", "false");
  await page.keyboard.press("Escape");
  await expect(settings).toBeFocused();
});

test("Space on Continue confirms a pending listen exactly once", async ({ page }) => {
  await openPlayer(page);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await expect(page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true })).toBeVisible();
  const confirmation = page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true });
  await confirmation.focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText("필수 1 / 3");
  await expect(confirmation).toBeVisible();
  await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText("필수 1 / 3");
});

test("switching modes in the open sheet keeps the speaking timer paused", async ({ page }) => {
  await openPlayer(page, "automatic");
  await page.clock.install({ time: new Date("2026-09-07T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-07T00:01:00Z"));
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.locator("#player-settings-trigger").click();
  await page.getByRole("radio", { name: "수동", exact: true }).click();
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await page.clock.runFor(60000);
  await page.keyboard.press("Escape");
  await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText("필수 0 / 3");
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  await page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true }).click();
  const remainingMs = Number((await page.getByRole("timer").innerText()).replace("초", "")) * 1000;
  await page.clock.runFor(remainingMs + 100);
  await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText("필수 1 / 3");
});

test("confirming all three listens still works when the sound device is unavailable", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openPlayer(page);
  await page.evaluate(() => {
    Object.defineProperty(window, "AudioContext", { value: class { constructor() { throw new Error("Audio unavailable"); } } });
  });
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  for (let count = 1; count <= 3; count++) {
    await page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true }).click();
    await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText(`필수 ${count} / 3`);
  }
  await expect(page.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  expect(errors).toEqual([]);
});
