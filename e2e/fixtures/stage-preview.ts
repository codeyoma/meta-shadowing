import { expect, type Page } from "@playwright/test";
import { enterAccountPractice } from "./cloud-navigation";

// Test intent survives the Settings-tab round trip; the app deliberately opens
// the stage map with no preview selected. Re-select the intended stage on Start.
const preparedStages = new WeakMap<Page, { path: string; stage: number }>();

async function openPreparedStage(page: Page) {
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
  await page.getByRole("navigation", { name: "하단 탐색" }).getByRole("link", { name: "설정", exact: true }).click();
  await page.getByRole("link", { name: "세션 설정", exact: true }).click();
  await expect(page.getByRole("heading", { name: "세션 설정", exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "학습 레벨", exact: true }).selectOption(level);
}

export async function returnToStages(page: Page) {
  await page.getByRole("navigation", { name: "하단 탐색" }).getByRole("link", { name: "스테이지", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/[^/]+\/stages/);
}

export async function startSelectedStage(page: Page) {
  if (new URL(page.url()).pathname === "/settings/session") {
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
