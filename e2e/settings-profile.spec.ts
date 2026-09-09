import { expect, test } from "./fixtures/cloud-ui";

test.use({ profileMetadata: { full_name: "Test Learner With A Long Display Name", avatar_url: "https://example.com/learner-avatar.svg" } });

test("settings shows the account avatar and name opposite its heading", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.route("https://example.com/learner-avatar.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>' }));
  await page.goto("/settings");
  const profile = page.getByLabel("Google 계정", { exact: true });
  await expect(profile).toHaveText("Test Learner With A Long Display Name");
  await expect(profile.locator('[data-slot="avatar-image"]')).toBeVisible();
  const heading = (await page.getByRole("heading", { name: "설정", exact: true }).boundingBox())!;
  const account = (await profile.boundingBox())!;
  expect(account.x).toBeGreaterThan(heading.x + heading.width);
  expect(Math.abs(account.y + account.height / 2 - heading.y - heading.height / 2)).toBeLessThan(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("settings uses an initial when the account photo cannot load", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.route("https://example.com/learner-avatar.svg", route => route.fulfill({ status: 404, body: "" }));
  await page.goto("/settings");
  const profile = page.getByLabel("Google 계정", { exact: true });
  await expect(profile.locator('[data-slot="avatar-fallback"]')).toHaveText("T");
  await expect(profile.getByText("Test Learner With A Long Display Name", { exact: true })).toBeVisible();
});
