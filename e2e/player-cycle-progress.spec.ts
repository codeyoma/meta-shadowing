import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { timedRecording } from "./fixtures/timed-audio";
import { packageResources } from "./fixtures/package-resources";
import { confirmManualListen } from "./fixtures/manual-practice";

async function openPlayer(page: Page, level = 1) {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await packageResources(page, { audio: { bytes: timedRecording, mimeType: "audio/wav" } });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/wav", body: timedRecording }));
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}&speed=0.5`);
  await page.waitForLoadState("networkidle");
}

test("compact text controls replace the title and speaker without clipping", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  await openPlayer(page);
  await expect(page).toHaveTitle("Meta Shadowing");
  await expect(page).toHaveURL(url => url.pathname === "/player" && url.searchParams.get("level") === "1");
  const context = page.getByLabel("레슨 안내", { exact: true });
  await expect(context).not.toContainText("Morning Routine");
  await expect(context.getByRole("button", { name: "문장 분석", exact: true })).toHaveText("문장 분석");
  await expect(page.getByRole("button", { name: "재생 또는 일시정지", exact: true })).toHaveCount(0);
  for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 932 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    const controls = context.getByRole("button");
    await expect(controls).toHaveCount(3);
    for (const control of await controls.all()) {
      await expect(control).toBeInViewport();
      expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(context.getByRole("button", { name: "문장 분석", exact: true })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(page.getByRole("region", { name: "학습 자막", exact: true })).toContainText("I wake up at seven.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`player-${viewport.width}.png`), scale: "css", animations: "disabled" });
  }
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("r");
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toBeVisible();
  await expect(page.locator("nextjs-portal").getByText(/Runtime Error|Build Error|Hydration failed/)).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the current cycle tracks playback, freezes on pause, ignores R, and resets for the next listen", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await openPlayer(page);
  const cycles = page.getByRole("group", { name: "완료한 듣기", exact: true });
  const ring = cycles.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  await page.keyboard.press("Space");
  await expect.poll(() => page.locator("audio").evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(0.75);
  await page.keyboard.press("Space");
  const media = await page.locator("audio").evaluate(element => {
    const audio = element as HTMLAudioElement;
    return { time: audio.currentTime, duration: audio.duration };
  });
  await expect(ring).toHaveAttribute("aria-valuenow", String(Math.round(media.time / media.duration * 1000) / 10));
  const frozen = await ring.getAttribute("aria-valuenow");
  await page.keyboard.press("r");
  await page.keyboard.press("Shift+R");
  await page.waitForTimeout(250);
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  await expect(ring).toHaveAttribute("aria-valuenow", frozen!);
  expect(await cycles.locator('[data-current="true"] i').evaluate(element => getComputedStyle(element, "::after").animationName)).toBe("none");
  await page.screenshot({ path: testInfo.outputPath("cycle-progress-paused.png"), animations: "disabled", scale: "css" });
  await page.keyboard.press("Space");
  await expect(ring).toHaveAttribute("aria-valuenow", "100");
  await expect(cycles).toHaveText("필수 0 / 3");
  await confirmManualListen(page, "keyboard");
  await page.keyboard.press("Space");
  await expect(cycles).toHaveText("필수 1 / 3");
  await expect(ring).not.toHaveAttribute("aria-valuenow", "100");
  expect(await ring.evaluate(element => element.closest('[data-current="true"]')?.previousElementSibling?.getAttribute("data-complete"))).toBe("true");
});

test("R does not restart a paused rapid exercise", async ({ page }) => {
  await openPlayer(page, 6);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^PAUSE/ })).toBeVisible();
  await page.keyboard.press("Space");
  const display = page.getByRole("region", { name: "속사포 학습", exact: true });
  const before = await display.innerText();
  await page.keyboard.press("r");
  await expect(page.getByRole("button", { name: /^CONTINUE/ })).toBeVisible();
  await expect(display).toHaveText(before);
});

// Each layout case owns its account/lease, avoiding cross-level lease contention
// when the previous page's best-effort release has not completed.
for (const level of [6, 7, 8]) test(`rapid mode labels leave readable room for all three controls on a narrow phone (level ${level})`, async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPlayer(page, level);
  const controls = page.getByLabel("레슨 안내", { exact: true }).getByRole("button");
  await expect(controls).toHaveCount(3);
  for (const control of await controls.all()) {
    await expect(control).toBeInViewport();
    expect(await control.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (level === 6) await page.screenshot({ path: testInfo.outputPath("rapid-320.png"), scale: "css", animations: "disabled" });
});
