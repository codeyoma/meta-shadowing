import { expect, test } from "@playwright/test";

test("rejects an incorrect password without revealing learner content", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("베타 비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "입장하기" }).click();

  await expect(page.getByText("오늘도 한 프레이즈부터.")).not.toBeVisible();
  await expect(page.locator("#password-error")).toHaveText("비밀번호가 올바르지 않습니다.");
  await expect(page.locator("#password-error")).toHaveAttribute("role", "alert");
  await expect(page.getByLabel("베타 비밀번호")).toHaveAttribute("aria-describedby", "password-error");
});

test("restores password entry after an authentication network failure", async ({ page }) => {
  await page.route("**/api/auth", (route) => route.abort("failed"));
  await page.goto("/");
  await page.getByLabel("베타 비밀번호").fill("test-beta-password");
  await page.getByRole("button", { name: "입장하기" }).click();

  await expect(page.locator("#password-error")).toHaveText("지금은 입장할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  await expect(page.getByRole("button", { name: "입장하기" })).toBeEnabled();
});

test("distinguishes an unavailable authentication service from a wrong password", async ({ page }) => {
  await page.route("**/api/auth", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"authenticated":false}' }));
  await page.goto("/");
  await page.getByLabel("베타 비밀번호").fill("test-beta-password");
  await page.getByRole("button", { name: "입장하기" }).click();

  await expect(page.locator("#password-error")).toHaveText("지금은 입장할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  await expect(page.getByRole("button", { name: "입장하기" })).toBeEnabled();
});

test("takes an authorized learner from password entry through session setup to the player", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("베타 비밀번호").fill("test-beta-password");
  await page.getByRole("button", { name: "입장하기" }).click();

  await expect(page).toHaveURL(/\/home$/);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /English 영어/ }).click();
  await page.getByRole("button", { name: /Morning Routine/ }).click();
  await expect(page.getByText("Morning Routine", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "아침 일과", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /3 첫 단어 힌트/ }).click();
  await page.getByRole("button", { name: "학습 시작" }).click();

  await expect(page).toHaveURL(/\/player/);
  await expect(page.getByRole("heading", { name: "메타쉐도잉 레벨 3" })).toBeVisible();
});

test("defaults invalid player levels to level 1", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("베타 비밀번호").fill("test-beta-password");
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page).toHaveURL(/\/home$/);

  for (const level of ["9", "-1", "1.5", "nope", ""]) {
    await page.goto(`/player?lesson=morning-routine${level ? `&level=${level}` : ""}`);
    await expect(page.getByRole("heading", { name: "메타쉐도잉 레벨 1" })).toBeVisible();
  }
});
