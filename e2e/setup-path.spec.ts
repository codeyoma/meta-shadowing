import { expect, test, type Page } from "@playwright/test";
import { openSelectedStageSettings, returnToStages, startSelectedStage } from "./fixtures/stage-preview";

async function openSetup(page: Page, lesson = "morning-routine") {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/setup?lesson=${lesson}`);
  await expect(page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio").first()).toBeEnabled();
}

test("setup places shared brand and streak navigation above the book summary", async ({ page }) => {
  await page.setViewportSize({ width: 583, height: 1488 });
  await openSetup(page);
  await expect(page.getByText("Meta Shadowing", { exact: true })).toBeVisible();
  const heading = page.getByRole("heading", { level: 1 });
  const nav = page.getByRole("navigation", { name: "상단 탐색", exact: true });
  const headingBox = (await heading.boundingBox())!;
  const navBox = (await nav.boundingBox())!;
  expect(headingBox.y).toBeGreaterThan(navBox.y + navBox.height);
  expect(headingBox.y).toBeLessThan(160);
  expect(await heading.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(22);
  await expect(page.getByText("0개 섹션 · 3개 프레이즈", { exact: true })).toBeVisible();
  await page.getByRole("navigation", { name: "하단 탐색" }).getByRole("link", { name: "레슨", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\?/);
});

test("all sixteen stages launch the correct paired level and retain their stage", async ({ page }) => {
  await openSetup(page);
  const path = page.getByRole("list", { name: "학습 단계", exact: true });
  const nodes = path.getByRole("radio");
  await expect(nodes).toHaveCount(16);
  await expect(path.getByRole("radio", { checked: true })).toHaveCount(0);
  const expectedLevels = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8];
  for (let index = 0; index < 16; index++) {
    const level = expectedLevels[index];
    await expect(nodes.nth(index)).toContainText(`Lv ${level}`);
    await expect(nodes.nth(index)).toBeEnabled();
    await nodes.nth(index).click();
    await expect(nodes.nth(index)).toHaveAttribute("aria-checked", "true");
    await expect(path.getByRole("radio", { checked: true })).toHaveCount(1);
    await startSelectedStage(page);
    await expect(page).toHaveURL(new RegExp(`level=${level}(?:&|$)`));
    await expect(page).toHaveURL(new RegExp(`stage=${index + 1}(?:&|$)`));
    await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
    await page.goto("/setup?lesson=morning-routine");
    await expect(page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio").first()).toBeEnabled();
  }
});

test("path selection preserves grouped and rapid preferences without starting practice early", async ({ page }) => {
  await openSetup(page);
  const path = page.getByRole("list", { name: "학습 단계", exact: true });
  await path.getByRole("radio", { name: /8 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  await page.getByLabel("묶음 크기").selectOption("4");
  await page.getByRole("combobox", { name: "재생속도", exact: true }).selectOption("1.5");
  await returnToStages(page);
  await path.getByRole("radio", { name: /14 속사포 한영/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("묶음 크기")).toHaveCount(0);
  await page.getByLabel("단어 속도").selectOption("6");
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await page.getByRole("radio", { name: "누적 단어", exact: true }).click();
  await page.getByLabel("말하기 추가 시간 (초)").fill("1.5");
  await expect(page).toHaveURL(/\/settings\/session/);
  await page.reload();
  await returnToStages(page);
  await path.getByRole("radio", { name: /8 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("묶음 크기")).toHaveValue("4");
  await expect(page.getByRole("combobox", { name: "재생속도", exact: true })).toHaveValue("1.5");
  await returnToStages(page);
  await path.getByRole("radio", { name: /14 속사포 한영/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("단어 속도")).toHaveValue("6");
  await expect(page.getByLabel("말하기 추가 시간 (초)")).toHaveValue("1.5");
  await returnToStages(page);
  await expect(page).toHaveURL(/\/lessons\/morning-routine\/stages/);
  await startSelectedStage(page);
  await expect(page).toHaveURL(/level=7/);
  await expect(page).toHaveURL(/wpm=6/);
  await expect(page).toHaveURL(/display=cumulative/);
});

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
  test(`the learning path keeps readable labels and keyboard order at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openSetup(page, "tokyo-walk");
    const path = page.getByRole("list", { name: "학습 단계", exact: true });
    const nodes = path.getByRole("radio");
    await expect(page.getByRole("heading", { name: "東京の散歩", exact: true })).toBeVisible();
    await expect(page.getByText("도쿄 산책", { exact: true }).filter({ visible: true })).toBeVisible();
    await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).focus();
    await expect(page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true })).toBeFocused();
    for (let index = 0; index < 16; index++) {
      await page.keyboard.press(index === 0 ? "Tab" : "ArrowDown");
      await expect(nodes.nth(index)).toBeFocused();
      const box = (await nodes.nth(index).boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
      expect(await nodes.nth(index).evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.keyboard.press("Enter");
    await expect(nodes.last()).toHaveAttribute("aria-checked", "true");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("heading", { level: 1 }).evaluate(element => {
      element.textContent = "A long lesson title — 日本語の会話と日常生活の練習";
    });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "학습 시작", exact: true }).scrollIntoViewIfNeeded();
    await expect(page.getByRole("button", { name: "학습 시작", exact: true })).toBeInViewport();
  });
}

test("the sentence menu returns to the current lesson's stage screen", async ({ page }) => {
  await openSetup(page);
  await startSelectedStage(page);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("button", { name: "메뉴로 돌아가기", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/morning-routine\/stages/);
  await expect(page.getByRole("list", { name: "학습 단계", exact: true })).toBeVisible();
});
