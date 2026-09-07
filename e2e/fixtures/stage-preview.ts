import { expect, type Page } from "@playwright/test";

export async function openSelectedStageSettings(page: Page) {
  const popup = page.locator('[data-slot="popover-content"][data-state="open"]');
  const settings = popup.getByRole("button", { name: "세션 설정", exact: true });
  if ((await popup.count()) === 0) {
    await page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio", { checked: true }).click();
  }
  await settings.click();
  await expect(page.getByRole("heading", { name: "세션 설정", exact: true })).toBeVisible();
}

export async function startSelectedStage(page: Page) {
  if (new URL(page.url()).pathname === "/settings/session") {
    await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
    await expect(page).toHaveURL(/\/lessons\/[^/]+\/stages/);
  }
  const popup = page.locator('[data-slot="popover-content"][data-state="open"]');
  const start = popup.getByRole("button", { name: "학습 시작", exact: true });
  // The retained popup is temporarily aria-hidden while settings animates closed.
  // Wait for its action instead of toggling the selected stage closed again.
  if ((await popup.count()) === 0) {
    await page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio", { checked: true }).click();
  }
  await expect(start).toBeEnabled();
  await start.click();
}
