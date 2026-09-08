import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("Google login is readable and keyboard accessible across viewport sizes", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(`${message.text()} (${message.location().url})`); });
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  for (const [width, height] of [[375, 667], [430, 932], [768, 1024], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto("/login");
    await expect(page).toHaveTitle(/Meta Shadowing/);
    await expect(page.locator("nextjs-portal").getByRole("dialog")).toHaveCount(0);
    const button = page.getByRole("button", { name: "Google로 로그인하기", exact: true });
    await expect(button).toBeVisible();
    const box = (await button.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThanOrEqual(height);
    await expect(button.locator("img")).toHaveJSProperty("complete", true);
    expect(await button.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
    for (let tab = 0; tab < 3 && !(await button.evaluate(element => element === document.activeElement)); tab++) {
      await page.keyboard.press("Tab");
    }
    await expect(button).toBeFocused();
    await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`google-login-${width}x${height}.png`), scale: "css" });
  }
  await page.goto("/login?error=__proto__");
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("login shows a pending state then enters languages, and Google alone cannot bypass beta", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/login");
  // Hold only the native navigation, so the outgoing React UI is observable.
  // The ordinary, uninterrupted submit is covered by google-login.spec.ts.
  await page.evaluate(() => document.querySelector("form")!.addEventListener("submit", event => event.preventDefault(), { once: true }));
  const button = page.getByRole("button", { name: "Google로 로그인하기", exact: true });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("이동하고 있어요");
  await page.screenshot({ path: test.info().outputPath("google-login-pending.png"), scale: "css" });
  await page.evaluate(() => document.querySelector("form")!.submit());
  await expect(page).toHaveURL(/\/languages$/);
  await context.clearCookies({ name: "meta_shadowing_learner" });
  await page.goto("/languages");
  await expect(page).toHaveURL(/\/$/);
  expect((await page.request.get("/api/dictionary?language=english&word=wake")).status()).toBe(401);
});
