import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
});

test("the second grouped stage survives settings, a sentence jump, refresh and home continuation", async ({ page }) => {
  await page.goto("/player?lesson=daily-conversation&level=4&stage=8&mode=manual");
  await page.locator("#player-settings-trigger").click();
  await page.getByRole("combobox", { name: "재생속도", exact: true }).selectOption("2");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/stage=8(?:&|$)/);
  await page.locator("#player-menu-trigger").click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("button", { name: /^5번 문장/ }).click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("meta-shadowing:learning:v1")!).progress);
  expect(before).toMatchObject({ level: 4, stage: 8 });
  await page.reload();
  await expect(page.locator("#player-title")).toBeVisible();
  await expect(page).toHaveURL(/stage=8(?:&|$)/);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("meta-shadowing:learning:v1")!).progress)).toMatchObject({ stage: 8, nextPhrase: before.nextPhrase, runId: before.runId });
  await page.goto("/lessons?language=english");
  await page.getByRole("link", { name: /Daily Conversation/ }).click();
  const resume = page.getByRole("button", { name: "현재 스테이지 8 시작", exact: true });
  await expect(resume).toContainText("이어서 학습 8");
  await resume.click();
  await expect(page).toHaveURL(/level=4(?:&|$)/);
  await expect(page).toHaveURL(/stage=8(?:&|$)/);
  await expect(page).toHaveURL(/speed=2(?:&|$)/);
});

for (const query of ["level=4", "level=4&stage=9", "level=4&stage=99"]) {
  test(`${query} preserves its playback level and defaults to that level's first stage`, async ({ page }) => {
    await page.goto(`/player?lesson=morning-routine&${query}`);
    await expect(page.locator("#player-title")).toHaveText("메타쉐도잉 레벨 4");
    await expect(page).toHaveURL(/stage=7(?:&|$)/);
    await expect(page).toHaveURL(/level=4(?:&|$)/);
  });
}
