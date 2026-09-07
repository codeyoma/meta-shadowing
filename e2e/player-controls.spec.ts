import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
});

test("the settings segment is touch-sized within a borderless lesson heading", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.goto("/player?lesson=morning-routine&level=1");
  const shortcut = page.getByRole("button", { name: /^재생 모드 및 속도:/ });
  await expect(shortcut).toBeVisible();
  await expect(shortcut).toHaveAttribute("data-selected", "false");
  expect((await shortcut.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  const context = page.getByLabel("레슨 안내", { exact: true });
  await expect(context).toHaveCSS("border-top-width", "0px");
  await expect(context).toHaveCSS("border-bottom-width", "0px");
  await shortcut.click();
  await page.getByRole("combobox", { name: "재생속도", exact: true }).selectOption("2");
  await page.keyboard.press("Escape");
  await expect(shortcut).toBeFocused();
  await expect(shortcut).toHaveText("수동 · 2×");
});

for (const level of [1, 2, 3, 4, 5]) test(`level ${level} keeps one playback control beside the lower listening dots`, async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(`/player?lesson=morning-routine&level=${level}`);
  const speaker = page.getByRole("button", { name: "재생 또는 일시정지", exact: true });
  await expect(speaker).toHaveCount(1);
  await expect(page.locator("footer").getByRole("button", { name: "재생 또는 일시정지", exact: true })).toBeVisible();
  const button = (await speaker.boundingBox())!;
  const dots = (await page.getByRole("group", { name: "완료한 듣기", exact: true }).boundingBox())!;
  const actions = (await page.getByRole("group", { name: "학습 진행", exact: true }).boundingBox())!;
  expect(button.x + button.width).toBeLessThan(dots.x);
  expect(Math.abs(button.y + button.height / 2 - dots.y - dots.height / 2)).toBeLessThanOrEqual(1);
  expect(button.y + button.height).toBeLessThan(actions.y);
  expect(actions.y + actions.height).toBeLessThanOrEqual(568);
  expect(Math.min(button.width, button.height)).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await speaker.click();
  await expect(page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true })).toBeVisible();
  await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText("필수 0 / 3");
  await page.getByRole("button", { name: "CONTINUE · 듣기 완료 확인", exact: true }).click();
  await expect(page.getByLabel("완료한 듣기", { exact: true })).toHaveText("필수 1 / 3");
});
