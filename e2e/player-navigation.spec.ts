import { openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test } from "./fixtures/cloud-ui";

for (const width of [320, 583, 1440]) {
  for (const level of [1, 8]) test(`level ${level} keeps live mode and speed beside the lesson at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
    await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}`);
    await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
    const label = page.getByRole("button", { name: /^재생 모드 및 속도:/ });
    const title = page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true });
    await expect(label).toHaveText(level === 1 ? "수동 · 1×" : "수동 · 200 WPM");
    const checkPlacement = async () => {
      const text = (await label.boundingBox())!;
      const heading = (await title.boundingBox())!;
      expect(text.x).toBeGreaterThanOrEqual(heading.x + heading.width);
      expect(text.x + text.width).toBeLessThanOrEqual(width);
      expect(text.height).toBeGreaterThanOrEqual(44);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    };
    await checkPlacement();
    await label.click();
    await page.getByRole("radio", { name: "자동", exact: true }).click();
    if (level === 1) await page.getByLabel("재생속도").selectOption("3");
    else await page.getByLabel("단어 속도").selectOption("6");
    await page.keyboard.press("Escape");
    await expect(label).toHaveText(level === 1 ? "자동 · 3×" : "자동 · 400 WPM");
    await expect(page.getByText(level === 1 ? "자동 · 3×" : "자동 · 400 WPM", { exact: true })).toHaveCount(1);
    await checkPlacement();
  });
}
