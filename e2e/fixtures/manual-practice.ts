import { expect, type Page } from "@playwright/test";

export function manualConfirmation(page: Page) {
  return page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true });
}

export async function waitForManualListen(page: Page) {
  await expect(manualConfirmation(page)).toBeVisible();
}

export async function confirmManualListen(page: Page, input: "click" | "touch" | "keyboard" = "click") {
  await waitForManualListen(page);
  if (input === "keyboard") await page.keyboard.press("Space");
  else if (input === "touch") await manualConfirmation(page).tap();
  else await manualConfirmation(page).click();
}
