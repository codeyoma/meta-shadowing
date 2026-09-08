import { pauseCloudClock, advanceCloudClock, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";

for (const level of [1, 4]) test(`level ${level} confirms extra listens from the main action without double-counting a pause or resume`, async ({ page }) => {
  test.setTimeout(60_000);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}&mode=manual&speed=0.5&group=2`);
  const action = page.getByRole("group", { name: "학습 진행", exact: true }).getByRole("button");
  const cycles = page.getByLabel("완료한 듣기");
  const progress = page.getByRole("progressbar", { name: level === 4 ? "묶음 진행" : "프레이즈 진행", exact: true });
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await page.getByRole("button", { name: "PAUSE · 일시정지", exact: true }).click();
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  await expect(cycles).toHaveText("필수 0 / 3");
  await page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true }).click();
  await waitForManualListen(page);
  await expect(cycles).toHaveText("필수 0 / 3");
  for (const cycle of [1, 2, 3]) {
    await confirmManualListen(page);
    await expect(cycles).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  await waitForManualListen(page);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 0 / 2");
  // Pause the fifth listen only after the fourth has been acknowledged.
  // Gestures during a pending cloud save are deliberately ignored.
  await confirmManualListen(page);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await page.getByRole("button", { name: "PAUSE · 일시정지", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).paused)).toBe(true);
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true }).click();
  await waitForManualListen(page);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 1 / 2");
  // Opening a menu pauses a ready confirmation; Space on the main action
  // must still confirm that final extra once after returning to the player.
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.keyboard.press("Escape");
  await action.focus();
  await page.keyboard.press("Space");
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 2 / 2");
  await expect(page.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("button", { name: /^REPEAT/ })).toHaveCount(0);
  await page.getByRole("button", { name: /^NEXT/ }).click();
  if (level === 4) await expect(page.getByRole("heading", { name: "레벨 4 학습 완료" })).toBeVisible();
  else {
    await expect(progress).toHaveAttribute("aria-valuenow", "1");
    await expect(cycles).toHaveText("필수 0 / 3");
  }
});

for (const level of [1, 4]) test(`level ${level} waits for the final automatic speaking window before offering choices`, async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}&mode=automatic&speed=3&group=2`);
  await page.waitForLoadState("networkidle");
  await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
  const cycles = page.getByLabel("완료한 듣기");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  for (const cycle of [1, 2, 3]) {
    if (level === 4) {
      for (let phrase = 0; phrase < 2; phrase++) {
        await expect.poll(() => page.locator("audio").evaluate(element => (element as HTMLAudioElement).ended)).toBe(true);
        await advanceCloudClock(page, 500);
      }
    }
    const timer = page.getByRole("timer");
    await expect(timer).toBeVisible();
    await expect(cycles).toHaveText(`필수 ${cycle - 1} / 3`);
    await expect(page.getByRole("button", { name: /^REPEAT|^NEXT/ })).toHaveCount(0);
    // The timer label rounds to tenths; one extra tick covers that rounding.
    await advanceCloudClock(page, Number((await timer.innerText()).replace("초", "")) * 1000 + 100);
    await expect(cycles).toHaveText(`필수 ${cycle} / 3`);
  }
  await expect(page.getByRole("button", { name: /^REPEAT/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(0);
  // Even beyond the default next-phrase delay, automatic mode waits for a choice.
  await advanceCloudClock(page, 1500);
  await expect(cycles).toHaveText("필수 3 / 3");
  await expect(page.getByRole("button", { name: /^REPEAT/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: level === 4 ? "묶음 진행" : "프레이즈 진행", exact: true })).toHaveAttribute("aria-valuenow", "0");
});

for (const level of [3, 5]) test(`level ${level} preserves manual bilingual reveal and speaking control in the extra pair`, async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}&mode=manual&group=2`);
  await page.waitForLoadState("networkidle");
  const canvas = page.getByRole("region", { name: "학습 자막" });
  const cycles = page.getByLabel("완료한 듣기");
  const progress = page.getByRole("progressbar", { name: level === 5 ? "묶음 진행" : "프레이즈 진행" });
  await page.keyboard.press("Space");
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page, "keyboard");
    await expect(cycles).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  await expect(cycles.locator("[data-complete]")).toHaveCount(5);
  await waitForManualListen(page);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 0 / 2");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("s");
  await expect(canvas).toContainText("I wake up at seven.");
  await expect(canvas).toContainText("나는 일곱 시에 일어난다.");
  await confirmManualListen(page, "keyboard");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await confirmManualListen(page, "keyboard");
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 2 / 2");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("Space");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  if (level === 5) {
    // The fixture's three phrases form one group: the small remainder is attached.
    await expect(page.getByRole("heading", { name: "레벨 5 학습 완료" })).toBeVisible();
  } else await expect(cycles.locator("[data-complete]")).toHaveCount(3);
});
