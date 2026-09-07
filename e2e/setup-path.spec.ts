import { expect, test, type Page } from "@playwright/test";

async function openSetup(page: Page, lesson = "morning-routine") {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/setup?lesson=${lesson}`);
  await expect(page.getByRole("button", { name: "학습 시작", exact: true })).toBeEnabled();
}

test("the compact setup header keeps the back control beside the title without a brand bar", async ({ page }) => {
  await page.setViewportSize({ width: 583, height: 1488 });
  await openSetup(page);
  await expect(page.getByText("Meta Shadowing", { exact: true })).toHaveCount(0);
  const heading = page.getByRole("heading", { level: 1 });
  const back = page.getByRole("button", { name: "레슨", exact: true });
  const headingBox = (await heading.boundingBox())!;
  const backBox = (await back.boundingBox())!;
  expect(headingBox.x).toBeGreaterThan(backBox.x + backBox.width);
  const metadataBox = (await page.getByText("3개 프레이즈", { exact: true }).boundingBox())!;
  expect(Math.abs((headingBox.y + metadataBox.y + metadataBox.height) / 2 - backBox.y - backBox.height / 2)).toBeLessThanOrEqual(2);
  expect(headingBox.y).toBeLessThan(64);
  expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(22);
  await expect(page.getByText("3개 프레이즈", { exact: true })).toBeVisible();
  await back.click();
  await expect(page).toHaveURL(/\/home$/);
});

test("all eight path nodes remain selectable and launch their chosen level", async ({ page }) => {
  await openSetup(page);
  const path = page.getByRole("list", { name: "학습 단계", exact: true });
  const nodes = path.getByRole("button");
  await expect(nodes).toHaveCount(8);
  await expect(nodes.first()).toHaveAttribute("aria-pressed", "true");
  for (let index = 0; index < 8; index++) {
    await expect(nodes.nth(index)).toBeEnabled();
    await nodes.nth(index).click();
    await expect(nodes.nth(index)).toHaveAttribute("aria-pressed", "true");
    await expect(path.locator('button[aria-pressed="true"]')).toHaveCount(1);
    await page.getByRole("button", { name: "학습 시작", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`level=${index + 1}(?:&|$)`));
    await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${index + 1}`, exact: true })).toBeVisible();
    await page.goto("/setup?lesson=morning-routine");
    await expect(page.getByRole("button", { name: "학습 시작", exact: true })).toBeEnabled();
  }
});

test("path selection preserves grouped and rapid preferences without starting practice early", async ({ page }) => {
  await openSetup(page);
  const path = page.getByRole("list", { name: "학습 단계", exact: true });
  await path.getByRole("button", { name: /4 다문장 암기/ }).click();
  await page.getByRole("button", { name: "세션 설정", exact: true }).click();
  await page.getByLabel("묶음 크기").selectOption("4");
  await page.getByRole("combobox", { name: "재생속도", exact: true }).selectOption("1.5");
  await page.getByRole("button", { name: "설정 닫기", exact: true }).click();
  await path.getByRole("button", { name: /7 속사포 한영/ }).click();
  await page.getByRole("button", { name: "세션 설정", exact: true }).click();
  await expect(page.getByLabel("묶음 크기")).toHaveCount(0);
  await page.getByLabel("단어 속도").selectOption("6");
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByRole("button", { name: "누적 단어", exact: true }).click();
  await page.getByLabel("말하기 추가 시간 (초)").fill("1.5");
  await expect(page).toHaveURL(/\/setup\?/);
  await page.reload();
  await path.getByRole("button", { name: /4 다문장 암기/ }).click();
  await page.getByRole("button", { name: "세션 설정", exact: true }).click();
  await expect(page.getByLabel("묶음 크기")).toHaveValue("4");
  await expect(page.getByRole("combobox", { name: "재생속도", exact: true })).toHaveValue("1.5");
  await page.getByRole("button", { name: "설정 닫기", exact: true }).click();
  await path.getByRole("button", { name: /7 속사포 한영/ }).click();
  await page.getByRole("button", { name: "세션 설정", exact: true }).click();
  await expect(page.getByLabel("단어 속도")).toHaveValue("6");
  await expect(page.getByLabel("말하기 추가 시간 (초)")).toHaveValue("1.5");
  await page.getByRole("button", { name: "설정 닫기", exact: true }).click();
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page).toHaveURL(/level=7/);
  await expect(page).toHaveURL(/wpm=6/);
  await expect(page).toHaveURL(/display=cumulative/);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`the learning path keeps readable labels and keyboard order at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSetup(page, "tokyo-walk");
    const path = page.getByRole("list", { name: "학습 단계", exact: true });
    const nodes = path.getByRole("button");
    await expect(page.getByText("東京の散歩", { exact: true })).toBeVisible();
    await expect(page.getByText("도쿄 산책", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "레슨", exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "세션 설정", exact: true })).toBeFocused();
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press("Tab");
      await expect(nodes.nth(index)).toBeFocused();
      const box = (await nodes.nth(index).boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      expect(await nodes.nth(index).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.keyboard.press("Enter");
    await expect(nodes.last()).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("heading", { level: 1 }).evaluate(element => {
      element.textContent = "A long lesson title — 日本語の会話と日常生活の練習";
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "학습 시작", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "학습 시작", exact: true })).toBeInViewport();
  });
}

test("the sentence menu returns to the first screen using its renamed action", async ({ page }) => {
  await openSetup(page);
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "첫 화면으로", exact: true }).click();
  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("heading", { name: "오늘도 한 프레이즈부터." })).toBeVisible();
});
