import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

for (const level of [1, 3, 4, 6, 8]) test(`level ${level} exposes help and direct settings without duplicate status`, async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=morning-routine&level=${level}&mode=manual`);
  const stage = page.locator("#practice-help-trigger");
  await expect(page.getByLabel("학습 방법", { exact: true })).toBeHidden();
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await stage.click();
  const help = page.getByRole("dialog", { name: "학습 방법", exact: true });
  await expect(help).toBeVisible();
  await expect(help.getByRole("tabpanel").locator("p")).not.toBeEmpty();
  await expect(help.getByRole("tab", { name: `Lv ${level}`, exact: true })).toHaveAttribute("aria-selected", "true");
  const helpBox = (await help.boundingBox())!;
  await expect(help.getByRole("button", { name: "닫기", exact: true })).toBeInViewport();
  expect(helpBox.x).toBeGreaterThanOrEqual(0);
  expect(helpBox.x + helpBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.keyboard.press("Escape");
  await expect(help).toHaveCount(0);
  await expect(stage).toBeFocused();
  if (level < 6) await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  else await expect(page.getByRole("button", { name: /^CONTINUE/ })).toBeVisible();

  const shortcut = page.getByRole("button", { name: /^재생 모드 및 속도:/ });
  await expect(shortcut).toHaveAccessibleName(/수동/);
  await shortcut.click();
  const sheet = page.getByRole("dialog", { name: "세션 설정", exact: true });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^재생 모드 및 속도:/ })).toHaveCount(0);
  await sheet.getByRole("combobox", { name: level < 6 ? "재생속도" : "단어 속도", exact: true }).selectOption(level < 6 ? "2" : "6");
  await page.keyboard.press("Escape");
  await expect(shortcut).toBeFocused();
  await expect(shortcut).toHaveText(level < 6 ? "수동 · 2×" : "수동 · 400 WPM");
  await shortcut.click();
  await expect(sheet.getByRole("combobox", { name: level < 6 ? "재생속도" : "단어 속도", exact: true })).toHaveValue(level < 6 ? "2" : "6");
  // A value is readable while the reopened sheet is still mounting/animating.
  // Wait for pointer readiness before the raw-coordinate outside gesture.
  await sheet.click({ trial: true });
  await page.mouse.click(2, 2);
  await expect(sheet).toHaveCount(0);
  await expect(shortcut).toBeFocused();
  await stage.click();
  await help.click({ trial: true });
  await page.mouse.click(2, 2);
  await expect(help).toHaveCount(0);
  await expect(stage).toBeFocused();
});

test("menu is bottom anchored and enters vertically with reduced-motion support", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=1");
  await expect(page.getByRole("button", { name: "학습 메뉴", exact: true })).toBeVisible();
  for (const viewport of [{ width: 430, height: 932 }, { width: 1066, height: 788 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    // Capture at DOM insertion in the same browser turn, before a slow test
    // process can miss the finite entrance animation.
    const keyframes = await page.evaluate(() => new Promise(resolve => {
      const observer = new MutationObserver(() => {
        const sheet = document.querySelector<HTMLDivElement>('#player-menu[role="dialog"][data-state="open"]');
        if (!sheet) return;
        const frames = sheet.getAnimations().flatMap(a => (a.effect as KeyframeEffect).getKeyframes().map(k => k.transform));
        observer.disconnect();
        resolve(frames);
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-state"] });
      document.getElementById("player-menu-trigger")!.click();
    }));
    const sheet = page.getByRole("dialog");
    expect(keyframes).toContainEqual(expect.stringMatching(/^translate3d\(0(?:px)?,\s*100%,\s*0(?:px)?\)$/));
    await expect.poll(async () => { const b = (await sheet.boundingBox())!; return Math.round(b.y + b.height); }).toBe(viewport.height);
    const box = (await sheet.boundingBox())!;
    expect(box.y).toBeGreaterThan(24);
    expect(Math.abs(box.x - (viewport.width - box.width) / 2)).toBeLessThan(1);
    await expect(sheet.getByRole("button", { name: "스테이지 화면으로", exact: true })).toBeInViewport();
    await expect(sheet.getByRole("button", { name: /닫기/ })).toHaveCount(0);
    await page.keyboard.press("Escape");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate(element => Math.max(...getComputedStyle(element).animationDuration.split(",").map(duration =>
    parseFloat(duration) / (duration.trim().endsWith("ms") ? 1000 : 1)
  )))).toBeLessThanOrEqual(0.01);
});
