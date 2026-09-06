import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

async function openGroupedPlayer(page: Page, level: 4 | 5, size = 2) {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=daily-conversation&level=${level}&group=${size}`);
  await page.waitForLoadState("networkidle");
}

test("setup selects a group size and level 4 plays each highlighted phrase before counting one cycle", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  const played: number[] = [];
  await page.route("**/api/lessons/*/audio/*", route => {
    played.push(Number(new URL(route.request().url()).pathname.split("/").at(-1)));
    return route.fulfill({ contentType: "audio/webm", body: testRecording });
  });
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/setup?lesson=morning-routine");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /4 다문장 암기/ }).click();
  for (const size of [4, 2, 3]) {
    await page.getByLabel("묶음 크기").selectOption(String(size));
    await expect(page.getByLabel("묶음 크기")).toHaveValue(String(size));
  }
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page).toHaveURL(/group=3/);
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  await expect(phrases).toHaveCount(3);
  await expect(phrases.nth(0)).toContainText("I wake up at seven.");
  await expect(phrases.nth(1)).toContainText("나는 세수를 한다.");
  await page.getByRole("button", { name: "첫 원음 듣기", exact: true }).click();
  for (const index of [0, 1]) {
    await expect(phrases.nth(index)).toHaveAttribute("aria-current", "true");
    await expect(phrases.nth(index)).toHaveCSS("border-left-width", "2px");
    await expect(page.getByRole("status")).toHaveText("다음 문장까지 잠시 기다립니다.");
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
    await page.clock.runFor(500);
  }
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  expect(played).toEqual([1, 2, 3]);
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
  for (let cycle = 1; cycle <= 3; cycle++) {
    await page.keyboard.press("Space");
    await expect(reveal).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    if (isMobile) await reveal.tap(); else await reveal.click();
    await expect(reveal).toHaveAttribute("aria-expanded", "true");
  }
  await page.keyboard.press("Space");
  await expect(phrases).toHaveCount(3);
  await expect(phrases.nth(0).getByText("We", { exact: true })).toBeVisible();
  await expect(phrases.nth(2).getByText("그들은", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(phrases.nth(2)).toContainText("They enjoy the morning.");
  await page.keyboard.press("ArrowLeft");
  await expect(phrases).toHaveCount(2);
  await expect(phrases.nth(0).getByText("I", { exact: true })).toBeVisible();
});

test("group navigation preserves the pinned chapter and marks an unnamed section without grouping across it", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await openGroupedPlayer(page, 4, 4);
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  const chapter = page.getByLabel("현재 챕터");
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  await expect(chapter).toContainText("At home");
  await expect(chapter).toContainText("집에서");
  for (const phraseCount of [5, 2]) {
    await expect(phrases).toHaveCount(phraseCount);
    for (let cycle = 1; cycle <= 3; cycle++) {
      await page.keyboard.press("Space");
      for (let index = 1; index < phraseCount; index++) {
        await expect(phrases.nth(index - 1)).toHaveAttribute("aria-current", "true");
        await expect(page.getByRole("status")).toHaveText("다음 문장까지 잠시 기다립니다.");
        await page.clock.runFor(500);
      }
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
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(page.getByLabel("재생속도")).toBeVisible();
  // Settings replaces the canvas; a short viewport makes this page scroll far enough to pin the chapter.
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 480 });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect((await chapter.boundingBox())!.y).toBe(0);
});

test("a long level 5 group keeps the first hint and touch actions accessible in the initial mobile viewport", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile layout check.");
  await openGroupedPlayer(page, 5, 4);
  const canvas = page.getByRole("region", { name: "학습 자막" });
  await expect(canvas.getByRole("listitem")).toHaveCount(5);
  const actions = await page.locator(".player-actions").boundingBox();
  const dock = await page.getByRole("navigation", { name: "재생 제어" }).boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(dock!.y);
  const firstHint = canvas.getByRole("listitem").first().locator("span");
  expect(await firstHint.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeGreaterThanOrEqual(64);
  for (const button of await page.locator(".player-actions button").all()) {
    const box = await button.boundingBox();
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(48);
  }
});

test("a failed second recording retries the whole group without counting a partial cycle or hiding subtitles", async ({ page }) => {
  await openGroupedPlayer(page, 5);
  let failSecond = true;
  const played: number[] = [];
  await page.route("**/api/lessons/*/audio/*", route => {
    const number = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    played.push(number);
    if (number === 2 && failSecond) return route.fulfill({ status: 503, body: "Audio unavailable" });
    return route.fulfill({ contentType: "audio/webm", body: testRecording });
  });
  await page.keyboard.press("Space");
  await page.keyboard.press("s");
  await expect(page.getByRole("alert", { name: "원음 재생 오류" })).toBeVisible();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "true");
  failSecond = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).first().click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "true");
  expect(played).toEqual([1, 2, 1, 2]);
});

test("Japanese grouped hints honor supplied spaces and automatic word boundaries for every phrase", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=tokyo-walk&level=5&group=2");
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
