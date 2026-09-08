import { pauseCloudClock, advanceCloudClock, reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";

async function openPlayer(page: Page, level: number) {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}`);
  await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
}

async function expectGuidancePopup(page: Page, level: number, instruction?: string, clockPaused = false) {
  const heading = page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true });
  // The modal dialog hides its background from assistive tech.
  const trigger = page.locator("#practice-help-trigger");
  const guidance = page.getByRole("dialog", { name: "학습 방법", exact: true });
  await expect(heading).toHaveCount(1);
  await expect(guidance).toHaveCount(0);
  await trigger.click();
  await expect(guidance).toBeVisible();
  if (instruction) await expect(guidance.getByRole("tabpanel")).toContainText(instruction);
  await expect(guidance.getByRole("tab", { name: `Lv ${level}`, exact: true })).toHaveAttribute("aria-selected", "true");
  const guidanceBox = (await guidance.boundingBox())!;
  expect(guidanceBox.x).toBeGreaterThanOrEqual(0);
  expect(guidanceBox.x + guidanceBox.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await guidance.getByRole("button", { name: "닫기", exact: true }).click();
  await expect(guidance).toHaveCount(0);
  // Radix FocusScope restores focus from a zero-delay unmount timer.
  if (clockPaused) await advanceCloudClock(page, 1);
  await expect(trigger).toBeFocused();
}

for (let level = 1; level <= 8; level++) test(`level ${level} reveals its method from the stage heading`, async ({ page }) => {
  await page.setViewportSize({ width: 583, height: 701 });
  await openPlayer(page, level);
  const context = page.getByLabel("레슨 안내", { exact: true });
  await expect(context.getByRole("button")).toHaveCount(3);
  const analysis = context.getByRole("button", { name: "문장 분석", exact: true });
  await expect(analysis).toBeVisible();
  await expect(analysis).toHaveText("문장 분석");
  await expect(analysis.locator("svg")).toHaveCount(0);
  await expect(page.locator("#player-book-label")).toHaveCount(0);
  await expect(context).not.toContainText("Morning Routine");
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
  await expectGuidancePopup(page, level, instructions[level - 1]);
});

test("the narrow header keeps all three actions visible without covering guidance or the bottom action", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openPlayer(page, 5);
  await expectGuidancePopup(page, 5);
  const context = page.getByLabel("레슨 안내", { exact: true });
  await expect(context.getByRole("button")).toHaveCount(3);
  for (const button of await context.getByRole("button").all()) await expect(button).toBeInViewport();
  expect(await context.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("group", { name: "학습 진행", exact: true })).toBeInViewport();
});

test("audio learning instructions remain available through playback, repeat, and settings", async ({ page }) => {
  await openPlayer(page, 1);
  const instruction = "자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.";
  await expectGuidancePopup(page, 1, instruction);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    if (cycle < 3) await waitForManualListen(page);
    await expectGuidancePopup(page, 1, instruction);
  }
  await expect(page.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await waitForManualListen(page);
  await expectGuidancePopup(page, 1, instruction);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "학습 방법", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expectGuidancePopup(page, 1, instruction);
});

test("rapid learning help pauses word progress and remains available after settings", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await openPlayer(page, 6);
  await page.waitForLoadState("networkidle");
  await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
  const context = page.getByLabel("레슨 안내", { exact: true });
  const instruction = "목표어를 따라 말하고, 이어지는 한국어 뜻을 확인하세요.";
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await advanceCloudClock(page, 1500);
  await expectGuidancePopup(page, 6, instruction, true);
  const display = page.getByRole("region", { name: "속사포 학습", exact: true });
  const pausedText = await display.innerText();
  await advanceCloudClock(page, 5000);
  await expect(display).toHaveText(pausedText);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(context.locator("h1")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "학습 방법", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expectGuidancePopup(page, 6, instruction, true);
  await expect(context).not.toContainText("일시정지됨");
});

for (let level = 1; level <= 8; level++) test(`level ${level} follows the script chapter above the speech bubble`, async ({ page }) => {
  await openPlayer(page, level);
  await expect(page.getByLabel("현재 챕터", { exact: true }).getByRole("heading")).toHaveCount(0);
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000002&level=${level}&group=2`);
  const chapter = page.getByLabel("현재 챕터", { exact: true });
  await expect(chapter.getByRole("heading", { name: "At home", exact: true })).toBeVisible();
  await expect(page.getByLabel("레슨 안내", { exact: true }).getByLabel("현재 챕터")).toHaveCount(0);
  for (const [number, title] of [[8, "At work"], [1, "At home"]] as const) {
    await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
    await page.getByRole("button", { name: "문장 목록", exact: true }).click();
    const drawer = page.getByRole("dialog", { name: "문장 목록", exact: true });
    const section = drawer.getByRole("button", { name: new RegExp(`^${title} `) });
    if (await section.getAttribute("aria-expanded") === "false") await section.click();
    await drawer.getByRole("button", { name: new RegExp(`^${number}번 문장`) }).click();
    await expect(chapter.getByRole("heading", { name: title, exact: true })).toBeVisible();
    const headingBox = (await chapter.boundingBox())!;
    const canvasBox = (await page.getByRole("region", { name: level <= 5 ? "학습 자막" : "속사포 학습" }).boundingBox())!;
    expect(headingBox.y + headingBox.height).toBeLessThan(canvasBox.y);
    expect(await chapter.evaluate(element => Boolean(element.nextElementSibling?.querySelector('[role="region"]')))).toBe(true);
  }
});

test("section headings wrap long script titles without clipping or displacing the bottom action", async ({ page }) => {
  await openPlayer(page, 1);
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000002&level=1");
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

test("an audio error keeps the method available with recovery only in the bottom action", async ({ page }) => {
  await openPlayer(page, 1);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await reloadLearnerPage(page);
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await expect(page.getByRole("button", { name: "RETRY · 다시 시도", exact: true })).toBeInViewport();
  await expect(page.getByRole("alert", { name: "원음 재생 오류" })).toHaveCount(0);
  await expectGuidancePopup(page, 1, "자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.");
  await expect(page.getByRole("button", { name: "RETRY · 다시 시도", exact: true })).toBeInViewport();
});
