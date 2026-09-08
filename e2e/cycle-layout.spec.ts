import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

for (const viewport of [{ width: 320, height: 568 }, { width: 430, height: 932 }, { width: 1280, height: 900 }]) {
  test(`three and five listening dots span both edges of the action row at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
    await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
    await page.goto("/player?lesson=morning-routine&level=1&mode=manual");
    const dots = page.getByRole("group", { name: "완료한 듣기", exact: true }).locator('[data-visible="true"] i');
    const actions = page.getByRole("group", { name: "학습 진행", exact: true });
    const checkEdges = async (count: number) => {
      await expect(dots).toHaveCount(count);
      await expect.poll(async () => {
        const last = (await dots.last().boundingBox())!, bounds = (await actions.boundingBox())!;
        return Math.abs(last.x + last.width - bounds.x - bounds.width);
      }).toBeLessThanOrEqual(1);
      const first = (await dots.first().boundingBox())!;
      const bounds = (await actions.boundingBox())!;
      expect(first.x).toBeCloseTo(bounds.x, 0);
      expect(first.y + first.height).toBeLessThan(bounds.y);
    };
    await checkEdges(3);
    await page.getByRole("button", { name: /^CONTINUE/ }).click();
    for (let i = 0; i < 3; i++) await confirmManualListen(page);
    await page.getByRole("button", { name: /^REPEAT/ }).click();
    await checkEdges(5);
  });
}
