import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

for (const level of [3, 5]) test(`level ${level} preserves manual bilingual reveal and speaking control in the extra pair`, async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=morning-routine&level=${level}&mode=manual&group=2`);
  await page.waitForLoadState("networkidle");
  const canvas = page.getByRole("region", { name: "학습 자막" });
  const cycles = page.getByLabel("완료한 듣기");
  const progress = page.getByRole("progressbar", { name: level === 5 ? "묶음 진행" : "프레이즈 진행" });
  for (let cycle = 1; cycle <= 3; cycle++) {
    await page.keyboard.press("Space");
    await expect(cycles).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.keyboard.press("r");
  await expect(cycles.locator("[data-complete]")).toHaveCount(5);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("s");
  await expect(canvas).toContainText("I wake up at seven.");
  await expect(canvas).toContainText("나는 일곱 시에 일어난다.");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 2 / 2");
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  await page.keyboard.press("Space");
  await expect(progress).toHaveAttribute("aria-valuenow", "1");
  if (level === 5) {
    // The fixture's three phrases form one group: the small remainder is attached.
    await expect(page.getByRole("heading", { name: "레벨 5 학습 완료" })).toBeVisible();
  } else await expect(cycles.locator("[data-complete]")).toHaveCount(3);
});
