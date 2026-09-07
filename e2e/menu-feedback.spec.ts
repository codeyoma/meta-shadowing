import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

for (const menu of ["player-menu", "sentences", "audio-settings", "rapid-settings"] as const) {
  test(`${menu} dismisses only a complete outside pointer gesture`, async ({ page, isMobile }) => {
    await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
    await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
    await page.goto(`/player?lesson=morning-routine&level=${menu === "rapid-settings" ? 6 : 1}&mode=manual`);
    const trigger = page.getByRole("button", { name: "학습 메뉴", exact: true });
    // Cover browsers where mouse activation does not focus its button.
    await trigger.evaluate(button => button.addEventListener("mousedown", event => event.preventDefault()));
    const open = async () => {
      await trigger.click();
      if (menu !== "player-menu") await page.getByRole("button", { name: menu === "sentences" ? "문장 목록" : "학습 설정", exact: true }).click();
    };
    await open();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Vaul's entrance transform must settle before sampling screen coordinates.
    await dialog.click({ trial: true });
    await dialog.getByRole("button").first().focus();
    // Toggle groups use roving tab stops; their current tabbable item changes
    // on focus. Traverse a complete cycle in each direction instead of treating
    // the last button as the final focusable control.
    const stops = await dialog.locator("button, select, input").count() + 2;
    for (const key of ["Tab", "Shift+Tab"]) for (let index = 0; index < stops; index++) {
      await page.keyboard.press(key);
      expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
    }
    const bounds = (await dialog.boundingBox())!;
    const outside = { x: page.viewportSize()!.width - 2, y: 2 };
    const inside = { x: bounds.x + bounds.width / 2, y: bounds.y + 20 };
    await page.mouse.click(inside.x, inside.y);
    await expect(dialog).toBeVisible();
    // Finishing a text selection or drag outside must not accidentally dismiss.
    await page.mouse.move(inside.x, inside.y);
    await page.mouse.down();
    await page.mouse.move(outside.x, outside.y);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
    if (isMobile) await page.touchscreen.tap(outside.x, outside.y);
    else await page.mouse.click(outside.x, outside.y);
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    if (menu === "sentences" || menu === "audio-settings") {
      await expect(page.locator("audio")).toHaveJSProperty("paused", true);
      await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
    }
    await open();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
}

for (const reducedMotion of ["no-preference", "reduce"] as const) test(`completed listens fill the circle and connector with ${reducedMotion}`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=1&mode=manual");
  const cycles = page.getByLabel("완료한 듣기");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await confirmManualListen(page);
  await expect(cycles).toHaveText("필수 1 / 3");
  const sample = cycles.evaluate(el => new Promise<{ count: number; early: string[]; late: string[] }>(resolve => {
    const step = el.querySelectorAll<HTMLElement>("[data-complete]")[1];
    const read = () => [getComputedStyle(step.querySelector("i")!, "::before").transform, getComputedStyle(step, "::after").transform];
    read();
    const observer = new MutationObserver(() => {
      if (step.dataset.complete !== "true") return;
      observer.disconnect();
      read();
      const animations = el.getAnimations({ subtree: true });
      animations.forEach(a => { a.pause(); a.currentTime = 60; });
      const early = read();
      animations.forEach(a => { a.currentTime = 600; });
      resolve({ count: animations.length, early, late: read() });
    });
    observer.observe(step, { attributes: true, attributeFilter: ["data-complete"] });
  }));
  await confirmManualListen(page);
  const motion = await sample;
  if (reducedMotion === "reduce") expect(motion.count).toBe(0);
  else {
    expect(motion.count).toBeGreaterThan(0);
    expect(motion.early[0]).not.toBe(motion.late[0]);
    // The incoming connector is already filled while this cycle is current.
    expect(motion.early[1]).toBe(motion.late[1]);
  }
  expect(motion.late).toEqual(["matrix(1, 0, 0, 1, 0, 0)", "matrix(1, 0, 0, 1, 0, 0)"]);
  await expect(cycles).toHaveText("필수 2 / 3");
});
