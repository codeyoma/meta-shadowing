import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

for (const level of [1, 3, 4, 6, 8]) test(`level ${level} uses one drawer for settings, sentences and home`, async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=morning-routine&level=${level}&mode=manual&group=2`);
  const trigger = page.getByRole("button", { name: "학습 메뉴", exact: true });
  await expect(trigger).toBeVisible();
  await expect(page.locator("main > header").getByRole("button")).toHaveCount(1);
  await trigger.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer).toHaveCount(1);
  await expect(drawer).toHaveAccessibleName("학습 메뉴");
  await expect(drawer.getByRole("button", { name: "학습 설정", exact: true })).toBeFocused();
  await drawer.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(drawer).toHaveAccessibleName("세션 설정");
  await expect(drawer.getByRole("button", { name: "메뉴로 돌아가기", exact: true }).locator("svg")).toHaveCSS("color", "rgb(60, 60, 60)");
  await expect(page.getByRole("dialog")).toHaveCount(1);
  const speed = drawer.getByRole("combobox", { name: level < 6 ? "재생속도" : "단어 속도", exact: true });
  await speed.selectOption(level < 6 ? "2" : "6");
  await drawer.getByRole("button", { name: "메뉴로 돌아가기", exact: true }).click();
  await expect(drawer.getByRole("button", { name: "학습 설정", exact: true })).toBeFocused();
  await expect(drawer.getByRole("button", { name: /^재생 모드 및 속도:/ })).toHaveCount(0);
  await drawer.getByRole("button", { name: "문장 목록", exact: true }).click();
  await expect(drawer).toHaveAccessibleName("문장 목록");
  await expect(drawer.getByRole("button", { name: /^1번 문장/ })).toBeFocused();
  await drawer.getByRole("button", { name: /^3번 문장/ }).click();
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("button", { name: /^재생 모드 및 속도:/ })).toHaveText(level < 6 ? "수동 · 2×" : "수동 · 400 WPM");
  const progress = page.locator("main > header").getByRole("progressbar");
  // The final single phrase joins the preceding two-phrase group.
  await expect(progress).toHaveAttribute("aria-valuenow", level === 4 ? "0" : "2");
  await trigger.click();
  await drawer.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(speed).toHaveValue(level < 6 ? "2" : "6");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  if (level < 6) {
    await expect(page.locator("audio")).toHaveJSProperty("paused", true);
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  }
  await trigger.click();
  await drawer.getByRole("button", { name: "첫 화면으로", exact: true }).click();
  await expect(page).toHaveURL(/\/languages$/);
});

test("progress stays in the top bar and the listening controls sit directly above the borderless actions", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=3");
  for (const viewport of [{ width: 320, height: 568 }, { width: 583, height: 1488 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    const header = page.locator("main > header");
    await expect(header.getByRole("progressbar", { name: "프레이즈 진행" })).toBeVisible();
    await expect(header.getByText("Meta Shadowing", { exact: true })).toHaveCount(0);
    const footer = page.locator("main > footer");
    const cycles = footer.getByLabel("완료한 듣기");
    const speaker = footer.getByRole("button", { name: "재생 또는 일시정지", exact: true });
    const actions = footer.getByRole("group", { name: "학습 진행", exact: true });
    await expect(cycles).toBeInViewport();
    await expect(speaker).toBeInViewport();
    await expect(actions).toBeInViewport();
    await expect(footer).toHaveCSS("border-top-width", "0px");
    await expect(cycles).toHaveCSS("border-bottom-width", "0px");
    const dots = (await cycles.boundingBox())!;
    const playback = (await speaker.boundingBox())!;
    const listeningControls = (await cycles.locator("..").boundingBox())!;
    const buttons = (await actions.boundingBox())!;
    expect(Math.abs((playback.y + playback.height / 2) - (dots.y + dots.height / 2))).toBeLessThanOrEqual(1);
    expect(buttons.y - (listeningControls.y + listeningControls.height)).toBeGreaterThanOrEqual(0);
    expect(buttons.y - (listeningControls.y + listeningControls.height)).toBeLessThanOrEqual(16);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
