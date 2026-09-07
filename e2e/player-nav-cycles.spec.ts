import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

async function openPlayer(page: Page) {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=1&mode=manual");
}

test("the player drawer has no close buttons and Escape returns focus", async ({ page }) => {
  await openPlayer(page);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();

  await expect(page.getByRole("dialog").getByRole("button", { name: /닫기/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "학습 메뉴", exact: true })).toBeFocused();
});

test("the confirmed count advances the circular activity indicator and fills its incoming line Macaw", async ({ page }) => {
  await openPlayer(page);
  const cycles = page.getByRole("group", { name: "완료한 듣기", exact: true });
  await expect(cycles.locator('[data-current="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await confirmManualListen(page);

  const current = cycles.locator('[data-current="true"]');
  await expect(current).toHaveCount(1);
  expect(await current.evaluate(element => getComputedStyle(element.querySelector("i")!, "::after").animationName)).toContain("current-cycle-ring");
  const orbit = await current.locator("i").evaluate(element => {
    const animation = element.getAnimations({ subtree: true }).find(a => a instanceof CSSAnimation && a.animationName.includes("current-cycle-ring"))!;
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    const frames = [0, duration / 4, duration / 2].map(time => {
      animation.currentTime = time;
      const matrix = new DOMMatrix(getComputedStyle(element, "::after").transform);
      const box = element.getBoundingClientRect();
      return { x: matrix.m11, y: matrix.m12, circleX: box.x, circleY: box.y };
    });
    animation.play();
    return frames;
  });
  for (const frame of orbit) {
    expect(Math.hypot(frame.x, frame.y)).toBeCloseTo(1, 1);
    expect(frame.circleX).toBe(orbit[0].circleX);
    expect(frame.circleY).toBe(orbit[0].circleY);
  }
  expect(orbit[1].x).toBeCloseTo(0, 1);
  expect(orbit[1].y).toBeCloseTo(1, 1);
  await expect.poll(() => current.evaluate(element => getComputedStyle(element, "::after").backgroundColor)).toBe("rgb(28, 176, 246)");
  await expect.poll(() => current.evaluate(element => getComputedStyle(element, "::after").transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
});

test("reduced motion leaves the current listening arc still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPlayer(page);

  const currentDot = page.getByRole("group", { name: "완료한 듣기", exact: true }).locator('[data-current="true"] i');
  await expect(currentDot).toHaveCount(1);
  expect(await currentDot.evaluate(element => getComputedStyle(element, "::after").animationName)).toBe("none");
});

test("only player content scrolls while the safe-area navigation and footer stay anchored", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 400 });
  await openPlayer(page);
  const header = page.locator("main > header");
  const content = page.locator("main > div").first();
  const footer = page.locator("main > footer");
  const before = { header: await header.boundingBox(), footer: await footer.boundingBox() };

  await content.evaluate(element => {
    const spacer = document.createElement("div");
    spacer.style.cssText = "height: 1200px; flex: none";
    element.append(spacer);
    element.scrollTop = element.scrollHeight;
  });

  expect(await content.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(await header.boundingBox()).toEqual(before.header);
  expect(await footer.boundingBox()).toEqual(before.footer);
});
