import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

async function openPlayer(page: Page, level: number) {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=morning-routine&level=${level}`);
  await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
}

async function expectGuidanceAbovePractice(page: Page, level: number) {
  const heading = page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true });
  const guidance = page.getByLabel("학습 방법", { exact: true });
  await expect(heading).toHaveCount(1);
  await expect(guidance).toHaveCount(1);
  const headingBox = (await heading.boundingBox())!;
  const guidanceBox = (await guidance.boundingBox())!;
  const canvasBox = (await page.getByRole("region", { name: level <= 5 ? "학습 자막" : "속사포 학습" }).boundingBox())!;
  expect(guidanceBox.y).toBeGreaterThanOrEqual(headingBox.y + headingBox.height);
  expect(guidanceBox.y + guidanceBox.height).toBeLessThan(canvasBox.y);
}

for (let level = 1; level <= 8; level++) test(`level ${level} puts the book and level together with guidance underneath`, async ({ page }) => {
  await page.setViewportSize({ width: 583, height: 701 });
  await openPlayer(page, level);
  const book = (await page.getByText("Morning Routine", { exact: true }).boundingBox())!;
  const heading = (await page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true }).boundingBox())!;
  expect(heading.x).toBeGreaterThan(book.x + book.width);
  expect(Math.abs(heading.y - book.y)).toBeLessThanOrEqual(2);
  await expectGuidanceAbovePractice(page, level);
  const instructions = [
    "자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.",
    "자막을 보며 따라 말하고, 눈을 감고 한 번 더 말하세요.",
    "첫 단어를 힌트로 듣고, 자막 없이 두 번 말하세요.",
    "여러 문장을 따라 말하고, 눈을 감고 한 번 더 말하세요.",
    "각 문장의 첫 단어를 보고, 자막 없이 두 번 말하세요.",
    "목표어를 따라 말하고, 이어지는 한국어 뜻을 확인하세요.",
    "한국어를 보고 목표어로 말한 뒤, 정답을 확인하세요.",
    "한국어만 보고, 목표어 문장을 빠르게 말하세요."
  ];
  await expect(page.getByLabel("학습 방법", { exact: true })).toHaveText(instructions[level - 1]);
});

test("the narrow header wraps long titles without covering guidance or the bottom action", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPlayer(page, 5);
  // Exercise a long localized upload title without changing published fixture data.
  await page.getByText("Morning Routine", { exact: true }).evaluate(element => {
    element.textContent = "A long bilingual lesson title — 日本語の会話と日常生活の練習";
  });
  await expectGuidanceAbovePractice(page, 5);
  const context = page.getByLabel("레슨 안내", { exact: true });
  expect(await context.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("group", { name: "학습 진행", exact: true })).toBeInViewport();
});

test("audio learning instructions stay fixed through playback, repeat, and settings", async ({ page }) => {
  await openPlayer(page, 1);
  const guidance = page.getByLabel("학습 방법", { exact: true });
  const instruction = "자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.";
  await expect(guidance).toHaveText(instruction);
  for (let cycle = 1; cycle <= 3; cycle++) {
    await page.getByRole("button", { name: /^CONTINUE/ }).click();
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    await expect(guidance).toHaveText(instruction);
  }
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await expect(guidance).toHaveText(instruction);
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(guidance).toHaveText(instruction);
  await page.getByRole("button", { name: "설정 닫기", exact: true }).click();
  await expect(guidance).toHaveText(instruction);
  await expectGuidanceAbovePractice(page, 1);
});

test("rapid learning instructions stay fixed across languages, pause, and settings", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await openPlayer(page, 6);
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  const context = page.getByLabel("레슨 안내", { exact: true });
  const guidance = context.getByLabel("학습 방법", { exact: true });
  const instruction = "목표어를 따라 말하고, 이어지는 한국어 뜻을 확인하세요.";
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await expect(guidance).toHaveText(instruction);
  await page.clock.runFor(1500);
  await expect(guidance).toHaveText(instruction);
  await expectGuidanceAbovePractice(page, 6);
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(context.locator("h1")).toBeVisible();
  await expect(guidance).toHaveText(instruction);
  await page.getByRole("button", { name: "설정 닫기", exact: true }).click();
  await expect(guidance).toHaveText(instruction);
  await expect(context).not.toContainText("일시정지됨");
});

for (let level = 1; level <= 8; level++) test(`level ${level} follows the script chapter above the speech bubble`, async ({ page }) => {
  await openPlayer(page, level);
  await expect(page.getByLabel("현재 챕터", { exact: true })).toHaveCount(0);
  await page.goto(`/player?lesson=daily-conversation&level=${level}&group=2`);
  const chapter = page.getByLabel("현재 챕터", { exact: true });
  await expect(chapter.getByRole("heading", { name: "At home", exact: true })).toBeVisible();
  await expect(page.getByLabel("레슨 안내", { exact: true }).getByLabel("현재 챕터")).toHaveCount(0);
  for (const [number, title] of [[8, "At work"], [1, "At home"]] as const) {
    await page.getByRole("button", { name: "문장 목록", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: new RegExp(`^${number}번 문장`) }).click();
    await expect(chapter.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const headingBox = (await chapter.boundingBox())!;
    const canvasBox = (await page.getByRole("region", { name: level <= 5 ? "학습 자막" : "속사포 학습" }).boundingBox())!;
    expect(headingBox.y + headingBox.height).toBeLessThan(canvasBox.y);
    expect(await chapter.evaluate(element => Boolean(element.nextElementSibling?.querySelector('[role="region"]')))).toBe(true);
  }
});

test("section headings wrap long script titles without clipping or displacing the bottom action", async ({ page }) => {
  await openPlayer(page, 1);
  await page.goto("/player?lesson=daily-conversation&level=1");
  const chapter = page.getByLabel("현재 챕터", { exact: true });
  await expect(chapter.getByRole("heading")).toBeVisible();
  await chapter.getByRole("heading").evaluate(element => {
    element.textContent = "Section 12 — A conversation about everyday life and learning Japanese";
  });
  for (const viewport of [{ width: 320, height: 568 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(viewport);
    expect(await chapter.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const chapterBox = (await chapter.boundingBox())!;
    const canvasBox = (await page.getByRole("region", { name: "학습 자막" }).boundingBox())!;
    expect(chapterBox.y + chapterBox.height).toBeLessThan(canvasBox.y);
    await expect(page.getByRole("group", { name: "학습 진행", exact: true })).toBeInViewport();
  }
});

test("an audio error keeps the method visible and offers recovery separately", async ({ page }) => {
  await openPlayer(page, 1);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.reload();
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await expect(page.getByRole("alert", { name: "원음 재생 오류" })).toBeVisible();
  await expect(page.getByLabel("학습 방법", { exact: true })).toHaveText("자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.");
  await expect(page.getByRole("alert").getByRole("button", { name: "다시 시도", exact: true })).toBeVisible();
});
