import { expect, test } from "@playwright/test";

for (const width of [320, 583, 1440]) {
  for (const level of [1, 8]) test(`level ${level} keeps live mode and speed beside settings at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
    await page.goto(`/player?lesson=morning-routine&level=${level}`);
    await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
    const label = page.getByLabel("재생 모드 및 속도", { exact: true });
    const settings = page.getByRole("button", { name: "학습 설정", exact: true });
    await expect(label).toHaveText(level === 1 ? "수동 · 1×" : "수동 · 200 WPM");
    const checkPlacement = async () => {
      const text = (await label.boundingBox())!;
      const gear = (await settings.boundingBox())!;
      expect(text.x + text.width).toBeLessThanOrEqual(gear.x);
      expect(Math.abs(text.y + text.height / 2 - gear.y - gear.height / 2)).toBeLessThanOrEqual(1);
      expect(gear.x + gear.width).toBeLessThanOrEqual(width);
      expect(gear.width).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await checkPlacement();
    await settings.click();
    await page.getByRole("button", { name: "자동", exact: true }).click();
    if (level === 1) await page.getByLabel("재생속도").selectOption("3");
    else await page.getByLabel("단어 속도").selectOption("6");
    await expect(label).toHaveText(level === 1 ? "자동 · 3×" : "자동 · 400 WPM");
    await page.getByRole("button", { name: "설정 닫기", exact: true }).click();
    await expect(page.getByText(level === 1 ? "자동 · 3×" : "자동 · 400 WPM", { exact: true })).toHaveCount(1);
    await checkPlacement();
  });
}
