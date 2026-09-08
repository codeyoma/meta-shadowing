import { pauseCloudClock, advanceCloudClock, reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { openSelectedStageSettings, startSelectedStage } from "./fixtures/stage-preview";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";

async function openGroupedPlayer(page: Page, level: 4 | 5, size = 2) {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000002&level=${level}&group=${size}`);
  await page.waitForLoadState("networkidle");
}

test("setup selects a group size and level 4 plays each highlighted phrase before counting one cycle", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await page.route("**/api/lessons/*/audio/*", route => {
    return route.fulfill({ contentType: "audio/webm", body: testRecording });
  });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: /7 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  for (const size of [4, 2, 3]) {
    await page.getByLabel("묶음 크기").selectOption(String(size));
    await expect(page.getByLabel("묶음 크기")).toHaveValue(String(size));
  }
  await page.keyboard.press("Escape");
  await startSelectedStage(page);
  await expect(page).toHaveURL(/group=3/);
  await page.waitForLoadState("networkidle");
  await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  await expect(phrases).toHaveCount(3);
  await expect(phrases.nth(0)).toContainText("I wake up at seven.");
  await expect(phrases.nth(1)).toContainText("나는 세수를 한다.");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  for (const index of [0, 1]) {
    await expect(phrases.nth(index)).toHaveAttribute("aria-current", "true");
    await expect(phrases.nth(index)).toHaveCSS("border-left-width", "2px");
    await expect.poll(() => page.locator("audio").evaluate(element => (element as HTMLAudioElement).ended)).toBe(true);
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
    await advanceCloudClock(page, 500);
  }
  await expect(phrases.nth(2)).toHaveAttribute("aria-current", "true");
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "0");
});

test("level 5 reveals every bilingual phrase with S or touch and resets for the next cycle and group", async ({ page, isMobile }) => {
  await openGroupedPlayer(page, 5);
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  const reveal = page.getByRole("button", { name: "자막 보기", exact: true });
  await expect(phrases).toHaveCount(2);
  await expect(phrases.nth(0).getByText("I", { exact: true })).toBeVisible();
  await expect(phrases.nth(1).getByText("너는", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(phrases.nth(0)).toContainText("나는 창문을 연다.");
  await expect(phrases.nth(1)).toContainText("You make breakfast.");
  await page.keyboard.press("Space");
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  for (let cycle = 1; cycle <= 3; cycle++) {
    await waitForManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle - 1} / 3`);
    if (isMobile) await reveal.tap(); else await reveal.click();
    await expect(reveal).toHaveAttribute("aria-expanded", "true");
    await confirmManualListen(page, "keyboard");
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    if (cycle < 3) await expect(reveal).toHaveAttribute("aria-expanded", "false");
  }
  await page.keyboard.press("Space");
  await expect(phrases).toHaveCount(3);
  await expect(phrases.nth(0).getByText("We", { exact: true })).toBeVisible();
  await expect(phrases.nth(2).getByText("그들은", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(phrases.nth(2)).toContainText("They enjoy the morning.");
  await page.keyboard.press("ArrowLeft");
  await expect(phrases).toHaveCount(3);
  await expect(phrases.nth(2)).toContainText("They enjoy the morning.");
  await expect(reveal).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("dialog", { name: "문장 목록", exact: true }).getByRole("button", { name: /^1번 문장/ }).click();
  await expect(phrases).toHaveCount(2);
  await expect(phrases.nth(0).getByText("I", { exact: true })).toBeVisible();
});

test("group navigation follows the chapter and marks an unnamed section without grouping across it", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await openGroupedPlayer(page, 4, 4);
  await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
  const chapter = page.getByLabel("현재 챕터");
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  await expect(chapter).toContainText("At home");
  await expect(chapter).toContainText("집에서");
  for (const phraseCount of [5, 2]) {
    await expect(phrases).toHaveCount(phraseCount);
    await page.keyboard.press("Space");
    for (let cycle = 1; cycle <= 3; cycle++) {
      for (let index = 1; index < phraseCount; index++) {
        await expect(phrases.nth(index - 1)).toHaveAttribute("aria-current", "true");
        await expect.poll(() => page.locator("audio").evaluate(element => (element as HTMLAudioElement).ended)).toBe(true);
        await advanceCloudClock(page, 500);
      }
      await confirmManualListen(page, "keyboard");
      await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    }
    await page.keyboard.press("Space");
    if (phraseCount === 5) {
      await expect(chapter).toContainText("At home");
      await expect(chapter.getByRole("separator", { name: "구간 경계" })).toBeVisible();
      await expect(phrases.nth(0)).toContainText("He takes the bus.");
    }
  }
  await expect(chapter).toContainText("At work");
  await expect(chapter).toContainText("직장에서");
  await expect(chapter.getByRole("separator")).toHaveCount(0);
  await expect(phrases).toHaveCount(3);
  await expect(phrases.nth(0)).toContainText("I read my messages.");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(page.getByLabel("재생속도")).toBeVisible();
  // Settings overlays the retained lesson and keeps its back action accessible on short screens.
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 });
  const settings = page.getByRole("dialog", { name: "세션 설정", exact: true });
  await expect(settings).toBeInViewport();
  await expect(settings.getByRole("button", { name: "메뉴로 돌아가기", exact: true })).toBeInViewport();
  await expect(page.locator('[aria-label="현재 챕터"]')).toContainText("At work");
  await page.keyboard.press("Escape");
  await expect(chapter).toContainText("At work");
});

test("a long level 5 group keeps the first hint and touch actions accessible in the initial mobile viewport", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile layout check.");
  await openGroupedPlayer(page, 5, 4);
  const canvas = page.getByRole("region", { name: "학습 자막" });
  await expect(canvas.getByRole("listitem")).toHaveCount(5);
  const actions = await canvas.boundingBox();
  const dock = await page.getByRole("group", { name: "학습 진행", exact: true }).boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(dock!.y);
  const firstHint = canvas.getByRole("listitem").first().locator('[lang="en"]');
  expect(await firstHint.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(22);
  expect(await firstHint.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(28);
  // Inline dictionary links retain text sizing; standalone controls are touch targets.
  for (const button of await page.locator("main button:not([data-dictionary-word])").all()) {
    const box = await button.boundingBox();
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
  }
});

test("a failed second recording retries the whole group without counting a partial cycle or hiding subtitles", async ({ page }) => {
  await openGroupedPlayer(page, 5);
  let failSecond = true;
  await page.route("**/api/lessons/*/audio/*", route => {
    const number = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    if (number === 2 && failSecond) return route.fulfill({ status: 503, body: "Audio unavailable" });
    return route.fulfill({ contentType: "audio/webm", body: testRecording });
  });
  await reloadLearnerPage(page);
  await page.waitForLoadState("networkidle");
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "PAUSE · 일시정지", exact: true })).toBeEnabled();
  await page.keyboard.press("s");
  await expect(page.getByRole("button", { name: "RETRY · 다시 시도", exact: true })).toBeInViewport();
  await expect(page.getByRole("alert", { name: "원음 재생 오류" })).toHaveCount(0);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "true");
  failSecond = false;
  await page.getByRole("button", { name: "RETRY · 다시 시도", exact: true }).click();
  await expect(page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem").first()).toHaveAttribute("aria-current", "true");
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "true");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("Japanese grouped hints honor supplied spaces and automatic word boundaries for every phrase", async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000003&level=5&group=2");
  await page.waitForLoadState("networkidle");
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  await expect(phrases).toHaveCount(3);
  await expect(phrases.nth(0).getByText("私は", { exact: true })).toBeVisible();
  await expect(phrases.nth(1).getByText("顔", { exact: true })).toBeVisible();
  await expect(phrases.nth(2).getByText("歯を", { exact: true })).toBeVisible();
  await expect(phrases.nth(2).getByText("나는", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(phrases.nth(0)).toContainText("私は 七時に 起きます。");
  await expect(phrases.nth(1)).toContainText("顔を洗います。");
  await expect(phrases.nth(2)).toContainText("나는 이를 닦는다.");
  await expect(page.getByRole("separator", { name: "구간 경계" })).toHaveCount(0);
});
