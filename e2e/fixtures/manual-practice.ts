import { expect, type Page } from "@playwright/test";

export function manualConfirmation(page: Page) {
  return page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true });
}

export async function waitForManualListen(page: Page) {
  await expect(manualConfirmation(page)).toBeVisible();
  await expect(manualConfirmation(page)).toBeEnabled();
}

export async function confirmManualListen(page: Page, input: "click" | "touch" | "keyboard" = "click") {
  await waitForManualListen(page);
  const cycles = page.getByRole("group", { name: "완료한 듣기", exact: true });
  const before = await cycles.textContent();
  if (input === "keyboard") await page.keyboard.press("Space");
  else if (input === "touch") await manualConfirmation(page).tap();
  else await manualConfirmation(page).click();
  // A real server acknowledgment must update the cycle before another gesture.
  // Reusing the still-visible old confirmation can otherwise race the save.
  await expect(cycles).not.toHaveText(before!);
}
