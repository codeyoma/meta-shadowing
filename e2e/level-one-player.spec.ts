import { reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { openSelectedStageSettings, startSelectedStage } from "./fixtures/stage-preview";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";

async function openPlayer(page: Page, query = "") {
  await page.route("**/api/lessons/*/audio/*", (route) => route.fulfill({
    contentType: "audio/webm", body: testRecording
  }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=1${query}`);
  // Keyboard input does not auto-wait for the streamed page's client listeners.
  await page.waitForLoadState("networkidle");
}

test("keyboard confirmation counts three required and two extra listens before Next advances", async ({ page }) => {
  await openPlayer(page);
  const cycles = page.getByLabel("완료한 듣기");
  await expect(cycles).toHaveText("필수 0 / 3");
  await page.keyboard.press("Space");
  for (const cycle of [1, 2, 3]) {
    await waitForManualListen(page);
    if (cycle === 2) {
      await page.keyboard.press("r");
      await page.keyboard.press("R");
      await waitForManualListen(page);
      await expect(cycles).toHaveText("필수 1 / 3");
      await expect(page.locator("audio")).toHaveJSProperty("ended", true);
    }
    await confirmManualListen(page, "keyboard");
    await expect(cycles).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  for (const extra of [1, 2]) {
    await confirmManualListen(page, "keyboard");
    await expect(cycles).toHaveText(`필수 3 / 3 · 추가 ${extra} / 2`);
  }
  await page.keyboard.press("Space");
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  await expect(cycles).toHaveText("필수 0 / 3");
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
});

test("automatic mode waits after three, then Repeat runs both extras with speaking windows and advances", async ({ page }) => {
  await openPlayer(page, "&mode=automatic&speed=0.5&gap=3");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await expect(page.getByText("자동 · 0.5×")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await expect(page.getByRole("timer", { name: "남은 시간" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^REPEAT/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole("timer")).toHaveCount(0);
  await page.waitForTimeout(3500);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3");
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  await expect(page.getByRole("timer", { name: "남은 시간" })).toBeVisible();
  await expect(page.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 2 / 2", { timeout: 10000 });
  await expect(page.getByRole("button", { name: /^REPEAT/ })).toHaveCount(0);
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("Space pauses and resumes live audio while r and R leave the unfinished listen unchanged", async ({ page }) => {
  await openPlayer(page, "&speed=0.5");
  await page.keyboard.press("Space");
  await expect.poll(() => page.locator("audio").evaluate((element) => {
    const audio = element as HTMLAudioElement;
    return audio.currentTime > 0 && !audio.paused;
  })).toBe(true);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  const pausedTime = await page.locator("audio").evaluate((audio) => (audio as HTMLAudioElement).currentTime);
  await page.waitForTimeout(900);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  expect(await page.locator("audio").evaluate((audio) => (audio as HTMLAudioElement).currentTime)).toBe(pausedTime);
  await page.keyboard.press("r");
  await page.keyboard.press("R");
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  expect(await page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBe(pausedTime);
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  await page.keyboard.press("Space");
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await confirmManualListen(page, "keyboard");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("touch controls recover a failed recording and complete every phrase without keyboard input", async ({ page, isMobile }) => {
  await openPlayer(page);
  await page.addInitScript(() => {
    let failPlayback = true;
    window.addEventListener("fixture-audio-recovered", () => { failPlayback = false; });
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      return failPlayback ? Promise.reject(new DOMException("Fixture decoder failure", "NotSupportedError")) : original.call(this);
    };
  });
  // Installed audio no longer streams. Inject a real media-boundary failure.
  await reloadLearnerPage(page);
  await page.waitForLoadState("networkidle");
  const activate = async (locator: ReturnType<Page["getByRole"]>) => isMobile ? locator.tap() : locator.click();
  await activate(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }));
  const retry = page.getByRole("button", { name: "RETRY · 다시 시도", exact: true });
  await expect(retry).toBeInViewport();
  await expect(page.getByRole("alert", { name: "원음 재생 오류" })).toHaveCount(0);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await page.evaluate(() => window.dispatchEvent(new Event("fixture-audio-recovered")));
  await activate(retry);
  await confirmManualListen(page, isMobile ? "touch" : "click");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  for (let phrase = 0; phrase < 3; phrase++) {
    if (phrase > 0) await activate(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }));
    for (let cycle = phrase === 0 ? 2 : 1; cycle <= 3; cycle++) {
      await confirmManualListen(page, isMobile ? "touch" : "click");
      await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    }
    await activate(page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }));
  }
  await expect(page.getByRole("heading", { name: "레벨 1 학습 완료" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "3");
});

test("keyboard focus keeps settings operable and speed choices reach the actual audio element", async ({ page }) => {
  await openPlayer(page);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("재생속도")).toBeVisible();
  await page.getByLabel("재생속도").selectOption("3");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await expect(page.getByText("수동 · 3×")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  expect(await page.locator("audio").evaluate((element) => (element as HTMLAudioElement).playbackRate)).toBe(3);
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});
