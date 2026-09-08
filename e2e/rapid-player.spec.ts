import { pauseCloudClock, advanceCloudClock, readServerJournal, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { openSelectedStageSettings, startSelectedStage } from "./fixtures/stage-preview";

async function openPlayer(page: Page, level: number, lesson = "10000000-0000-4000-8000-000000000001", query = "") {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, `/player?lesson=${lesson}&level=${level}${query}`);
  await page.waitForLoadState("networkidle");
  await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
  // The clock jump expires the ownership verification; let its real HTTP
  // acknowledgment settle before sending keyboard input (which does not wait).
  await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeEnabled();
}

test("level 6 plays target then Korean words and stops at each manual line without requesting audio", async ({ page }) => {
  const audioRequests: string[] = [];
  page.on("request", request => { if (request.url().includes("/audio/")) audioRequests.push(request.url()); });
  await openPlayer(page, 6);
  const canvas = page.getByRole("region", { name: "속사포 학습" });
  await expect(page.locator("audio")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(canvas).toHaveText("I");
  await advanceCloudClock(page, 300);
  await expect(canvas).toHaveText("wake");
  await advanceCloudClock(page, 1200);
  await expect(canvas).toHaveText("나는");
  await advanceCloudClock(page, 1200);
  await expect(page.getByRole("button", { name: "CONTINUE · 다음 문장", exact: true })).toBeVisible();
  const journal = await readServerJournal(page);
  expect(journal.studyDays).toHaveLength(1);
  expect(journal.progress.nextPhrase).toBe(1);
  await advanceCloudClock(page, 10000);
  await expect(page.getByRole("progressbar", { name: "문장 진행" })).toHaveAttribute("aria-valuenow", "1");
  await page.keyboard.press("Space");
  await expect(canvas).toHaveText("I");
  await advanceCloudClock(page, 300);
  await expect(canvas).toHaveText("wash");
  expect(audioRequests).toEqual([]);
});

test("setup offers four WPM speeds, display modes, and separate speaking and boundary timings", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: /13 속사포 한영/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("단어 속도")).toBeVisible();
  await expect(page.getByLabel("단어 속도").locator("option")).toHaveText(["3 · 200 WPM", "4 · 267 WPM", "5 · 333 WPM", "6 · 400 WPM"]);
  await expect(page.getByLabel("재생속도", { exact: true })).toHaveCount(0);
  await page.getByLabel("단어 속도").selectOption("5");
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await page.getByRole("radio", { name: "누적 단어", exact: true }).click();
  const speakingTime = page.getByLabel("말하기 추가 시간 (초)");
  await speakingTime.fill("1.5");
  await expect(speakingTime).toHaveValue("1.5");
  await page.getByLabel("문장 간격 (초)").fill("0.5");
  await page.getByLabel("구간 간격 (초)").fill("3");
  await page.keyboard.press("Escape");
  await startSelectedStage(page);
  await expect(page).toHaveURL(/wpm=5/);
  await expect(page).toHaveURL(/display=cumulative/);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await expect(page.getByText("자동 · 333 WPM", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(page.getByLabel("말하기 추가 시간 (초)")).toHaveValue("1.5");
  await expect(page.getByLabel("문장 간격 (초)")).toHaveValue("0.5");
  await expect(page.getByLabel("구간 간격 (초)")).toHaveValue("3");
});

for (const level of [7, 8]) test(`level ${level} times speaking from the target line and ${level === 7 ? "reveals" : "never reveals"} the target answer`, async ({ page }) => {
  await openPlayer(page, level);
  const canvas = page.getByRole("region", { name: "속사포 학습" });
  await expect(page.locator("audio")).toHaveCount(0);
  await page.keyboard.press("Space");
  await expect(canvas).toHaveText("나는");
  await advanceCloudClock(page, 1200);
  await expect(canvas).toHaveText("말해 보세요");
  // Five target tokens at 200 WPM, plus the default 0.5-second extra pause.
  await expect(page.getByRole("timer")).toHaveText("2.0초");
  await advanceCloudClock(page, 1900);
  await expect(canvas).toHaveText("말해 보세요");
  await advanceCloudClock(page, 100);
  if (level === 7) {
    await expect(canvas).toHaveText("I");
    await advanceCloudClock(page, 1500);
  }
  await expect(canvas).toHaveText("한 문장 완료");
  await advanceCloudClock(page, 10000);
  await expect(canvas).toHaveText("한 문장 완료");
  await page.keyboard.press("r");
  await page.keyboard.press("R");
  await expect(canvas).toHaveText("한 문장 완료");
  await page.getByRole("button", { name: "CONTINUE · 다음 문장", exact: true }).click();
  await expect(canvas).toHaveText("나는");
  await expect(page.getByRole("progressbar", { name: "문장 진행", exact: true })).toHaveAttribute("aria-valuenow", "1");
});

test("pause and Right Arrow work while r, R and Left Arrow preserve word progress", async ({ page, isMobile }) => {
  await openPlayer(page, 6, "10000000-0000-4000-8000-000000000001", "&display=cumulative");
  const canvas = page.getByRole("region", { name: "속사포 학습" });
  const start = page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true });
  if (isMobile) await start.tap(); else await start.click();
  expect(await canvas.locator("[lang]").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(28);
  await advanceCloudClock(page, 200);
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  await advanceCloudClock(page, 5000);
  await expect(canvas).toHaveText("I");
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 100);
  await expect(canvas).toHaveText("I wake");
  await page.keyboard.press("r");
  await page.keyboard.press("R");
  await expect(canvas).toHaveText("I wake");
  await page.keyboard.press("ArrowRight");
  await advanceCloudClock(page, 300);
  await expect(canvas).toHaveText("I wash");
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowLeft");
  await advanceCloudClock(page, 10000);
  await expect(canvas).toHaveText("I wash");
  await expect(page.getByRole("progressbar", { name: "문장 진행", exact: true })).toHaveAttribute("aria-valuenow", "1");
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  const menu = page.getByRole("button", { name: "문장 목록", exact: true });
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  if (isMobile) await menu.tap(); else await menu.click();
  await page.getByRole("dialog", { name: "문장 목록", exact: true }).getByRole("button", { name: /^1번 문장/ }).click();
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await advanceCloudClock(page, 300);
  await expect(canvas).toHaveText("I wake");
});

test("settings pause the timer, preserve partial-token progress, and do not consume form keys", async ({ page }) => {
  await openPlayer(page, 6);
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 200);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await page.getByLabel("단어 속도").selectOption("6");
  await page.getByRole("radio", { name: "누적 단어", exact: true }).click();
  await page.getByRole("heading", { name: "세션 설정", exact: true }).click();
  await page.keyboard.press("r");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 5000);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  const canvas = page.getByRole("region", { name: "속사포 학습" });
  await expect(canvas).toHaveText("I");
  await page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true }).click();
  await advanceCloudClock(page, 50);
  await expect(canvas).toHaveText("I wake");
});

test("automatic playback respects ordinary and blank/chapter gaps and completes without an extra line", async ({ page }) => {
  await openPlayer(page, 6, "10000000-0000-4000-8000-000000000002", "&mode=automatic&lineGap=0.5&sectionGap=2");
  const canvas = page.getByRole("region", { name: "속사포 학습" });
  await page.keyboard.press("Space");
  await expect(page.getByLabel("현재 챕터")).toHaveText("At home집에서");
  await advanceCloudClock(page, 2100);
  await expect(page.getByRole("timer")).toHaveText("0.5초");
  await advanceCloudClock(page, 500);
  await expect(canvas).toHaveText("You");
  for (let index = 0; index < 3; index++) {
    await page.keyboard.press("ArrowRight");
    await advanceCloudClock(page, 0);
  }
  await expect(canvas).toHaveText("They");
  await advanceCloudClock(page, 2100);
  await expect(page.getByRole("timer")).toHaveText("2.0초");
  await advanceCloudClock(page, 1900);
  await expect(canvas).toHaveText("잠시 쉬어 가세요");
  await advanceCloudClock(page, 100);
  await expect(canvas).toHaveText("He");
  await expect(page.getByRole("separator", { name: "구간 경계" })).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await advanceCloudClock(page, 2100);
  await expect(page.getByRole("timer")).toHaveText("2.0초");
  await advanceCloudClock(page, 2000);
  await expect(page.getByLabel("현재 챕터")).toHaveText("At work직장에서");
  await expect(page.getByRole("separator", { name: "구간 경계" })).toHaveCount(0);
  await advanceCloudClock(page, 100000);
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "문장 진행" })).toHaveAttribute("aria-valuenow", "10");
});

test("Japanese words respect provided spaces and use server segmentation on an unspaced line", async ({ page }) => {
  await openPlayer(page, 6, "10000000-0000-4000-8000-000000000003");
  const canvas = page.getByRole("region", { name: "속사포 학습" });
  await page.keyboard.press("Space");
  await expect(canvas).toHaveText("私は");
  await advanceCloudClock(page, 300);
  await expect(canvas).toHaveText("七時に");
  await advanceCloudClock(page, 300);
  await expect(canvas).toHaveText("起きます。");
  await page.keyboard.press("ArrowRight");
  await expect(canvas).toHaveText("顔");
  await advanceCloudClock(page, 900);
  await expect(canvas).toHaveText("ます。");
});

test("invalid rapid query settings fall back safely and keep audio speed controls absent", async ({ page }) => {
  await openPlayer(page, 8, "10000000-0000-4000-8000-000000000001", "&wpm=9&speak=-1&lineGap=NaN&sectionGap=99&display=invalid&mode=automatic");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(page.getByLabel("단어 속도")).toHaveValue("3");
  await expect(page.getByLabel("말하기 추가 시간 (초)")).toHaveValue("0.5");
  await expect(page.getByLabel("문장 간격 (초)")).toHaveValue("1");
  await expect(page.getByLabel("구간 간격 (초)")).toHaveValue("2");
  await expect(page.getByRole("radio", { name: "현재 단어", exact: true })).toHaveAttribute("aria-checked", "true");
});

test("a hidden-document event pauses the speaking window until the learner explicitly resumes", async ({ page }) => {
  await openPlayer(page, 8);
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 1300);
  // Simulate the browser visibility boundary, not the session engine or its timer.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  await expect(page.getByRole("timer")).toHaveText("1.9초");
  await advanceCloudClock(page, 10000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("timer")).toHaveText("1.9초");
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeEnabled();
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 1900);
  await expect(page.getByRole("region", { name: "속사포 학습" })).toHaveText("한 문장 완료");
});

test("mobile rapid controls remain above the dock and have touch-sized targets", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Mobile layout assertion.");
  await openPlayer(page, 6, "10000000-0000-4000-8000-000000000002");
  await expect(page.getByRole("heading", { name: "메타쉐도잉 레벨 6", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 6", exact: true })).toHaveCSS("font-size", "15px");
  await page.keyboard.press("Space");
  const actions = await page.getByRole("region", { name: "속사포 학습" }).boundingBox();
  const dock = await page.getByRole("group", { name: "학습 진행", exact: true }).boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(dock!.y);
  // Inline definitions use token typography; standalone player controls keep
  // the full touch-target requirement.
  for (const button of await page.locator("main button:not([data-dictionary-word])").all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
  expect(await page.getByRole("region", { name: "속사포 학습" }).locator("[lang]").evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBeLessThanOrEqual(28);
});
