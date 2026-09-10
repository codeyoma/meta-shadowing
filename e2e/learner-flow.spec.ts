import { openLearnerPage, installStagePackage } from "./fixtures/cloud-navigation";
import { expect, test } from "./fixtures/cloud-ui";
import { startSelectedStage } from "./fixtures/stage-preview";

test("rejects an incorrect password without revealing learner content", async ({ page }) => {
  await openLearnerPage(page, "/");
  await page.getByLabel("베타 비밀번호").fill("wrong-password");
  await page.getByRole("button", { name: "입장하기" }).click();

  await expect(page.getByText("오늘도 한 프레이즈부터.")).not.toBeVisible();
  await expect(page.locator("#password-error")).toHaveText("비밀번호가 올바르지 않습니다.");
  await expect(page.locator("#password-error")).toHaveAttribute("role", "alert");
  await expect(page.getByLabel("베타 비밀번호")).toHaveAttribute("aria-describedby", "password-error");
});

test("restores password entry after an authentication network failure", async ({ page }) => {
  await page.route("**/api/auth", (route) => route.abort("failed"));
  await openLearnerPage(page, "/");
  await page.getByLabel("베타 비밀번호").fill("integration-beta-password");
  await page.getByRole("button", { name: "입장하기" }).click();

  await expect(page.locator("#password-error")).toHaveText("지금은 입장할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  await expect(page.getByRole("button", { name: "입장하기" })).toBeEnabled();
});

test("distinguishes an unavailable authentication service from a wrong password", async ({ page }) => {
  await page.route("**/api/auth", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"authenticated":false}' }));
  await openLearnerPage(page, "/");
  await page.getByLabel("베타 비밀번호").fill("integration-beta-password");
  await page.getByRole("button", { name: "입장하기" }).click();

  await expect(page.locator("#password-error")).toHaveText("지금은 입장할 수 없습니다. 잠시 후 다시 시도해 주세요.");
  await expect(page.getByRole("button", { name: "입장하기" })).toBeEnabled();
});

test("takes an authorized learner from password entry through session setup to the player", async ({ page }) => {
  await openLearnerPage(page, "/");
  await page.getByLabel("베타 비밀번호").fill("integration-beta-password");
  await page.getByRole("button", { name: "입장하기" }).click();

  await expect(page).toHaveURL(/\/languages$/);
  await expect(page.getByRole("heading", { name: "언어 선택" })).toBeVisible();
  await page.getByRole("link", { name: /영어 English/ }).click();
  await page.getByRole("link", { name: /Morning Routine/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Morning Routine", exact: true })).toBeVisible();
  await expect(page.getByText("Morning Routine", { exact: true })).toBeVisible();
  await installStagePackage(page);
  await page.getByRole("radio", { name: /5 첫 단어 힌트/ }).click();
  await startSelectedStage(page);

  await expect(page).toHaveURL(/\/player/);
  await expect(page.getByRole("heading", { name: "메타쉐도잉 레벨 3" })).toBeVisible();
});

test("defaults invalid player levels to level 1", async ({ page }) => {
  await openLearnerPage(page, "/");
  await page.getByLabel("베타 비밀번호").fill("integration-beta-password");
  await page.getByRole("button", { name: "입장하기" }).click();
  await expect(page).toHaveURL(/\/languages$/);

  for (const level of ["9", "-1", "1.5", "nope", ""]) {
    await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001${level ? `&level=${level}` : ""}`);
    await expect(page.getByRole("heading", { name: "메타쉐도잉 레벨 1" })).toBeVisible();
  }
});
