import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";

for (const level of [1, 3, 4, 6, 8]) test(`level ${level} exposes help and direct settings without duplicate status`, async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}&mode=manual`);
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
  await help.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(help).toHaveCount(0);
  await expect(stage).toBeFocused();
});

test("menu is bottom anchored and enters vertically with reduced-motion support", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1");
  const menu = page.getByRole("button", { name: "학습 메뉴", exact: true });
  await expect(menu).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const sheet = page.getByRole("dialog", { name: "학습 메뉴", exact: true });
  async function expectMenuLayout(viewport: { width: number; height: number }) {
    await sheet.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished)));
    await expect.poll(async () => { const box = (await sheet.boundingBox())!; return Math.round(box.y + box.height); }).toBe(viewport.height);
    const box = (await sheet.boundingBox())!;
    // Short screens allow a full-height sheet so menu rows remain reachable;
    // taller screens retain the 85dvh cap and visible space above the drawer.
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.height).toBeLessThanOrEqual(viewport.height * (viewport.height <= 540 ? 1 : 0.85) + 1);
    expect(Math.abs(box.x - (viewport.width - box.width) / 2)).toBeLessThan(1);
    await expect(sheet.getByRole("heading", { name: "학습 메뉴", exact: true })).toBeInViewport({ ratio: 0.999 });
    const footer = sheet.locator('[data-slot="drawer-footer"]');
    const footerBefore = await footer.boundingBox();
    for (const name of ["확인"]) {
      const action = footer.getByRole("button", { name, exact: true });
      await expect(action).toBeInViewport({ ratio: 0.999 });
      await expect(action).toBeEnabled();
    }
    const items = sheet.getByRole("navigation", { name: "학습 메뉴 항목", exact: true });
    for (const name of ["학습 설정", "문장 목록", "스테이지 화면으로"]) {
      const item = items.getByRole("button", { name, exact: true });
      await item.scrollIntoViewIfNeeded();
      await expect(item).toBeInViewport({ ratio: 0.999 });
      expect(await footer.boundingBox()).toEqual(footerBefore);
      expect(await sheet.boundingBox()).toEqual(box);
    }
    if (viewport.height === 320) expect(await items.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    await expect(sheet.getByRole("button", { name: /닫기/ })).toHaveCount(0);
  }
  for (const viewport of [{ width: 430, height: 932 }, { width: 1066, height: 788 }, { width: 844, height: 390 }, { width: 568, height: 320 }]) {
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
    expect(keyframes).toContainEqual(expect.stringMatching(/^translate3d\(0(?:px)?,\s*100%,\s*0(?:px)?\)$/));
    expect(keyframes).toContainEqual(expect.stringMatching(/^translate3d\(0(?:px)?,\s*0(?:px)?,\s*0(?:px)?\)$/));
    await expectMenuLayout(viewport);
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(menu).toBeFocused();
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await menu.click();
  await expect(sheet).toBeVisible();
  await expect.poll(() => sheet.evaluate(element => Math.max(...getComputedStyle(element).animationDuration.split(",").map(duration =>
    parseFloat(duration) / (duration.trim().endsWith("ms") ? 1000 : 1)
  )))).toBeLessThanOrEqual(0.01);
  await expectMenuLayout(page.viewportSize()!);
  await sheet.getByRole("button", { name: "확인", exact: true }).click();
  await expect(sheet).toHaveCount(0);
  await expect(menu).toBeFocused();
});
