import { expect, test } from "./fixtures/cloud-ui";

test.use({ profileMetadata: { full_name: "Test Learner With A Long Display Name", avatar_url: "https://example.com/learner-avatar.svg" } });

test("settings drawer preserves the account avatar and name", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.route("https://example.com/learner-avatar.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="blue"/></svg>' }));
  await page.goto("/settings");
  const profile = page.getByLabel("Google 계정", { exact: true });
  await expect(profile).toHaveText("Test Learner With A Long Display Name");
  await expect(profile.locator('[data-slot="avatar-image"]')).toBeVisible();
  await expect(page.getByRole("dialog", { name: "설정", exact: true })).toBeVisible();
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
