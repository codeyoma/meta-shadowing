import { expect, type Page } from "@playwright/test";
import { enterAccountPractice, installStagePackage } from "./cloud-navigation";

// Test intent survives the Settings-tab round trip; the app deliberately opens
// the stage map with no preview selected. Re-select the intended stage on Start.
const preparedStages = new WeakMap<Page, { path: string; stage: number }>();

async function openPreparedStage(page: Page) {
  await installStagePackage(page);
  await expect(page.getByRole("button", { name: /^현재 스테이지 \d+ 시작$/ })).toBeEnabled();
  const nodes = page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio");
  const url = new URL(page.url());
  const prepared = preparedStages.get(page);
  const requested = prepared?.path === url.pathname ? prepared.stage : Number(url.searchParams.get("stage"));
  const current = nodes.and(page.locator('[aria-current="step"]'));
  const target = Number.isInteger(requested) && requested >= 1 && requested <= 16
    ? nodes.nth(requested - 1) : (await current.count()) ? current : nodes.first();
  await target.click();
}

export async function openSelectedStageSettings(page: Page) {
  const popup = page.locator('[data-slot="popover-content"][data-state="open"]');
  if ((await popup.count()) === 0) {
    await openPreparedStage(page);
  }
  const selected = page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio", { checked: true });
  const label = (await selected.getAttribute("aria-label"))!;
  const stage = Number(label.match(/^\d+/)![0]);
  const level = label.match(/Lv (\d+)/)![1];
  preparedStages.set(page, { path: new URL(page.url()).pathname, stage });
  await popup.getByRole("button", { name: "스테이지 안내 닫기", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await page.getByRole("navigation", { name: "하단 탐색" }).getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "설정", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "학습 레벨", exact: true }).selectOption(level);
}

export async function returnToStages(page: Page) {
  const drawer = page.getByRole("dialog", { name: "설정", exact: true });
  if (await drawer.and(page.locator('[data-state="open"]')).count()) await drawer.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).toHaveURL(/\/lessons\/[^/]+\/stages/);
}

export async function startSelectedStage(page: Page) {
  if (await page.getByRole("dialog", { name: "설정", exact: true }).count()) {
    await returnToStages(page);
  }
  const popup = page.locator('[data-slot="popover-content"][data-state="open"]');
  const start = popup.getByRole("button", { name: "학습 시작", exact: true });
  // Reuse an open preview instead of toggling its stage closed again.
  if ((await popup.count()) === 0) {
    await openPreparedStage(page);
  }
  await expect(start).toBeEnabled();
  await start.click();
  if (process.env.CLOUD_LEARNING_ENABLED === "1") await enterAccountPractice(page);
}
