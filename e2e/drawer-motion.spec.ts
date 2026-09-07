import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
});


test("player drawer interpolates menu height and stays mounted during its exit", async ({ page }) => {
  await page.goto("/player?lesson=morning-routine&level=1&mode=manual");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  const dialog = page.locator("#player-menu");
  await expect(dialog.getByRole("button", { name: "학습 설정", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "학습 설정", exact: true }).click({ trial: true });
  const heights = await dialog.evaluate(element => new Promise<number[]>(resolve => {
    const observer = new MutationObserver(() => {
      if (element.getAttribute("data-view") !== "settings") return;
      observer.disconnect();
      const animation = element.getAnimations().find(a => (a.effect as KeyframeEffect).getKeyframes().some(frame => "height" in frame));
      if (!animation) return resolve([]);
      animation.pause();
      const duration = Number(animation.effect!.getTiming().duration);
      const values = [0, duration / 2, duration].map(time => {
        animation.currentTime = time;
        return element.getBoundingClientRect().height;
      });
      animation.finish();
      resolve(values);
    });
    observer.observe(element, { attributes: true, attributeFilter: ["data-view"] });
    element.querySelector<HTMLButtonElement>('[data-drawer-view="settings"]')!.click();
  }));
  expect(heights).toHaveLength(3);
  expect(heights[1]).toBeGreaterThan(heights[0]);
  expect(heights[1]).toBeLessThan(heights[2]);
  await expect(dialog.getByRole("heading", { name: "세션 설정", exact: true })).toBeVisible();
  // Capture synchronous dismissal before the browser can finish the exit animation.
  const exit = await dialog.evaluate(element => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return new Promise<{ connected: boolean; state: string | null }>(resolve => requestAnimationFrame(() => resolve({ connected: element.isConnected, state: element.getAttribute("data-state") })));
  });
  expect(exit).toEqual({ connected: true, state: "closed" });
  await expect(dialog).toHaveCount(0);
});

async function swipeDrawerDown(page: Page) {
  // Vaul ignores drags during its opening transition. Wait for motion itself,
  // not just rounded bounding-box stability near the end of its easing curve.
  await expect.poll(() => page.getByRole("dialog").evaluate(element =>
    element.getAnimations().filter(animation => animation.playState === "running").length
  )).toBe(0);
  const handle = page.locator('[data-slot="drawer-handle"]');
  await handle.click({ trial: true });
  const box = (await handle.boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const endY = page.viewportSize()!.height - 12;
  const client = await page.context().newCDPSession(page);
  try {
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (endY - y) * step / 8 }] });
      await page.evaluate(() => new Promise(requestAnimationFrame));
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } finally {
    await client.detach();
  }
}

for (const screen of ["player"] as const) test(`${screen} dismisses by outside tap and handle swipe, then restores its opener`, async ({ page }) => {
  await page.goto("/player?lesson=morning-routine&level=1&mode=manual");
  const opener = page.getByRole("button", { name: "학습 메뉴", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog");
  await dialog.click({ trial: true });
  await page.mouse.click(2, 2);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await swipeDrawerDown(page);
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  if (screen === "player") await expect(page.locator("audio")).toHaveJSProperty("paused", true);
});

test("reduced motion skips drawer resizing and long exit motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/player?lesson=morning-routine&level=1&mode=manual");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "학습 설정", exact: true }).click();
  expect(await dialog.evaluate(element => element.getAnimations().some(a =>
    (a.effect as KeyframeEffect).getKeyframes().some(frame => "height" in frame)
  ))).toBe(false);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
});
