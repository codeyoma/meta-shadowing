import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

async function openPlayer(page: Page) {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&mode=manual");
}

test("the player drawer has no close buttons and Escape returns focus", async ({ page }) => {
  await openPlayer(page);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();

  await expect(page.getByRole("dialog").getByRole("button", { name: /닫기/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "학습 메뉴", exact: true })).toBeFocused();
});

test("the confirmed count moves media progress to the next cycle and fills its incoming line Macaw", async ({ page }) => {
  await openPlayer(page);
  const cycles = page.getByRole("group", { name: "완료한 듣기", exact: true });
  await expect(cycles.locator('[data-current="true"]')).toHaveCount(1);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await confirmManualListen(page);

  const current = cycles.locator('[data-current="true"]');
  await expect(current).toHaveCount(1);
  await expect(cycles.locator('[data-complete="true"] svg')).toHaveCount(1);
  const ring = current.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  await expect(ring).toBeVisible();
  await expect(ring).toHaveCSS("width", "28px");
  await expect(ring).toHaveCSS("height", "28px");
  await expect(ring).toHaveCSS("animation-name", "none");
  await expect(ring).toHaveAttribute("aria-valuenow", "100");
  await expect.poll(() => current.evaluate(element => getComputedStyle(element, "::after").backgroundColor)).toBe("rgb(28, 176, 246)");
  await expect.poll(() => current.evaluate(element => getComputedStyle(element, "::after").transform)).toBe("matrix(1, 0, 0, 1, 0, 0)");
});

test("reduced motion preserves the static current listening progress ring", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openPlayer(page);

  const currentDot = page.getByRole("group", { name: "완료한 듣기", exact: true }).locator('[data-current="true"] i');
  await expect(currentDot).toHaveCount(1);
  expect(await currentDot.evaluate(element => getComputedStyle(element, "::after").animationName)).toBe("none");
  const ring = currentDot.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  await expect(ring).toBeVisible();
  await expect(ring).toHaveCSS("animation-name", "none");
  await expect(ring.locator("circle")).toHaveCSS("transition-property", "none");
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
