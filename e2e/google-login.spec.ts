import { expect, test } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

test("beta entry opens Google-only login without granting learner access", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("베타 비밀번호").fill("test-beta-password");
  await page.getByRole("button", { name: "입장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "로그인", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Google로 로그인하기", exact: true })).toBeVisible();
  await expect(page.locator('input[type="email"], input[type="password"]')).toHaveCount(0);
  await page.goto("/languages");
  await expect(page).toHaveURL(/\/login$/);
  const api = await page.request.get("/api/dictionary?language=english&word=wake");
  expect(api.status()).toBe(401);
});

test("login and callback cannot skip the beta gate", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/auth/callback?code=untrusted-code");
  await expect(page).toHaveURL(/\/$/);
});

test("Google PKCE login completes and existing sessions skip the login screen", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/login");
  await page.getByRole("button", { name: "Google로 로그인하기", exact: true }).click();
  await expect(page).toHaveURL(/\/languages$/);
  await expect(page.getByRole("heading", { name: "계정 학습이 잠시 중지되었습니다." })).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/languages$/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/languages$/);
  expect(errors).toEqual([]);
});

test("cancelled or invalid callbacks keep the Google retry button available", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/auth/callback?error=access_denied");
  await expect(page.locator("form").getByRole("alert")).toContainText("취소");
  await expect(page.getByRole("button", { name: "Google로 로그인하기", exact: true })).toBeEnabled();
  await page.goto("/auth/callback?code=invalid-code");
  await expect(page.locator("form").getByRole("alert")).toContainText("완료하지 못했습니다");
  await page.getByRole("button", { name: "Google로 로그인하기", exact: true }).click();
  await expect(page).toHaveURL(/\/languages$/);
});

test("beta-only sessions cannot enter learner pages or protected APIs", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  for (const path of ["/lessons?language=english", "/lessons/morning-routine/stages", "/settings", "/settings/session", "/player?lesson=morning-routine&level=1", "/home", "/setup"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
  }
  for (const path of ["/api/dictionary?language=english&word=wake", "/api/lessons/morning-routine/audio/1", "/api/lessons/morning-routine/syntax/1"]) {
    expect((await page.request.get(path)).status()).toBe(401);
  }
  const forged = await page.request.post("/auth/google", { headers: { Origin: "https://attacker.example" }, maxRedirects: 0 });
  expect(forged.status()).toBe(403);
});
