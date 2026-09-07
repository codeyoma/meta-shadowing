import { expect, test, type Page } from "@playwright/test";
import { openSelectedStageSettings, startSelectedStage } from "./fixtures/stage-preview";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, manualConfirmation, waitForManualListen } from "./fixtures/manual-practice";

async function signIn(page: Page) {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
}

test("learner overrides become the next browser session defaults across lessons and levels", async ({ page }) => {
  await signIn(page);
  await page.goto("/setup?lesson=morning-routine");
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: /7 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  await page.getByLabel("묶음 크기").selectOption("4");
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await page.getByLabel("재생속도").selectOption("2");
  await page.getByLabel("다음 이동 대기 (초)").fill("2");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await page.getByRole("radio", { name: /13 속사포 한영/ }).click();
  await openSelectedStageSettings(page);
  await page.getByLabel("단어 속도").selectOption("6");
  await page.getByRole("radio", { name: "누적 단어", exact: true }).click();
  await page.getByLabel("말하기 추가 시간 (초)").fill("2");
  await startSelectedStage(page);
  await expect(page).toHaveURL(/player/);
  await page.goto("/setup?lesson=tokyo-walk");
  await page.waitForLoadState("networkidle");
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("재생속도")).toHaveValue("2");
  await expect(page.getByRole("radio", { name: "자동", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("다음 이동 대기 (초)")).toHaveValue("2");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await page.getByRole("radio", { name: /9 다문장 첫 단어/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("묶음 크기")).toHaveValue("4");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await page.getByRole("radio", { name: /15 속사포 한글/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("단어 속도")).toHaveValue("6");
  await expect(page.getByRole("radio", { name: "누적 단어", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("말하기 추가 시간 (초)")).toHaveValue("2");
});

test("audio progress saves only after phrase advancement and manual speaking excludes settings and background pauses", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await signIn(page);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.goto("/player?lesson=morning-routine&level=1");
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await page.goto("/lessons?language=english");
  await page.getByRole("link", { name: /Morning Routine/ }).click();
  await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  for (let phrase = 0; phrase < 3; phrase++) {
    await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
    for (let cycle = 1; cycle <= 3; cycle++) {
      await confirmManualListen(page);
      await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
      if (phrase === 1 && cycle === 1) {
        await waitForManualListen(page);
        await page.clock.runFor(2000);
        await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
        await page.getByRole("button", { name: "학습 설정", exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(manualConfirmation(page)).toBeVisible();
        await page.clock.runFor(7000);
      }
    }
    if (phrase === 0) {
      await page.clock.runFor(5000);
      await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
      await page.getByRole("button", { name: "학습 설정", exact: true }).click();
      await page.clock.runFor(10000);
      await page.getByLabel("재생속도").selectOption("2");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
      await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
      await page.goto("/lessons?language=english");
      await page.getByRole("link", { name: /Morning Routine/ }).click();
      await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).click();
      await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
    } else if (phrase === 1) {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.clock.runFor(20000);
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: false });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
    } else await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
  }
  await expect(page.getByRole("heading", { name: "레벨 1 학습 완료" })).toBeVisible();
  await expect(page.getByLabel("활성 학습시간")).toHaveText("7.0초");
  await page.getByRole("button", { name: "설정 보기", exact: true }).click();
  await expect(page.getByRole("region", { name: "설정 보기", exact: true }).getByText("수동 · 2×", { exact: true })).toBeVisible();
});

test("grouped progress resumes the whole next group, not a recording inside an unfinished group", async ({ page }) => {
  test.setTimeout(60000);
  await signIn(page);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.goto("/player?lesson=daily-conversation&level=5&group=2&groupGap=0");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.getByRole("button", { name: "NEXT · 다음 묶음", exact: true }).click();
  await expect(page.getByText("묶음 2 / 4", { exact: true })).toBeVisible();
  await expect(page.getByText("3문장", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  await expect(phrases.nth(1)).toHaveAttribute("aria-current", "true");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("묶음 2 / 4", { exact: true })).toBeVisible();
  await expect(page.getByText("3문장", { exact: true })).toBeVisible();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await expect(phrases.nth(0)).toHaveAttribute("aria-current", "true");
});

test("blocked browser storage does not block practice and reports an unsaved completion honestly", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } }));
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await signIn(page);
  await page.goto("/player?lesson=tokyo-walk&level=8&mode=automatic&lineGap=0");
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await page.clock.runFor(20000);
  await expect(page.getByRole("heading", { name: "레벨 8 학습 완료" })).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("브라우저에 기록을 저장하지 못했습니다.");
});

test("malformed browser records fall back to usable defaults without inventing progress or history", async ({ page }) => {
  await signIn(page);
  await page.goto("/setup?lesson=morning-routine");
  await page.waitForLoadState("networkidle");
  await openSelectedStageSettings(page);
  await page.getByLabel("재생속도").selectOption("2");
  await page.keyboard.press("Escape");
  await startSelectedStage(page);
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).waitFor();
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) localStorage.setItem(key, "not-json");
  });
  await page.goto("/lessons?language=english");
  await expect(page.getByRole("link", { name: /Morning Routine/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "완료 기록" })).toHaveCount(0);
  await page.goto("/setup?lesson=morning-routine");
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("재생속도")).toHaveValue("1");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await expect(page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio", { checked: true })).toBeEnabled();
});

test("changing an unrelated group-size preference does not restart a completed rapid run", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await signIn(page);
  await page.goto("/player?lesson=morning-routine&level=6&mode=automatic&lineGap=0");
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await page.clock.runFor(6900);
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
  const completedUrl = page.url();
  await page.goto("/setup?lesson=daily-conversation");
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: /7 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  await page.getByLabel("묶음 크기").selectOption("4");
  await page.goto(completedUrl);
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
});

test("rapid resume commits complete lines, excludes pauses and background time, and appends each completed run once", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await signIn(page);
  await page.goto("/player?lesson=morning-routine&level=6");
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  await page.keyboard.press("Space");
  await page.clock.runFor(2700); // 5 English + 4 Korean tokens at 200 WPM.
  await page.keyboard.press("Space");
  await page.clock.runFor(300); // Partial second line must not be resumed in the middle.
  await page.goto("/lessons?language=english");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: /Morning Routine/ }).click();
  await page.getByRole("button", { name: "현재 스테이지 11 시작", exact: true }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("문장 2 / 3", { exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await page.clock.runFor(300);
  await page.keyboard.press("Space");
  await page.clock.runFor(10000);
  await page.keyboard.press("Space");
  await page.clock.runFor(300);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.clock.runFor(20000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.keyboard.press("Space");
  await page.clock.runFor(1500); // Remaining 2.1-second second line.
  await page.keyboard.press("Space");
  await page.clock.runFor(2100); // Third line: 4 English + 3 Korean.
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
  await expect(page.getByLabel("활성 학습시간")).toHaveText("6.9초");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByLabel("완료 날짜")).toContainText("2026");
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
  await page.getByRole("button", { name: "레슨 목록으로", exact: true }).click();
  await expect(page.getByRole("region", { name: "완료 기록" }).getByRole("listitem")).toHaveCount(1);
  await page.goto("/setup?lesson=morning-routine");
  await page.waitForLoadState("networkidle");
  await page.getByRole("radio", { name: /11 속사포 영한/ }).click();
  await openSelectedStageSettings(page);
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await page.getByLabel("문장 간격 (초)").fill("0");
  await page.keyboard.press("Escape");
  await startSelectedStage(page);
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await expect(page.getByRole("region", { name: "속사포 학습" })).toHaveText("I");
  await page.clock.runFor(6900);
  await expect(page.getByLabel("활성 학습시간")).toHaveText("6.9초");
  await page.getByRole("button", { name: "레슨 목록으로", exact: true }).click();
  const history = page.getByRole("region", { name: "완료 기록" });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await history.getByText("설정 보기").first().click();
  await expect(history.getByRole("listitem").first()).toContainText("200 WPM");
  await expect(history.getByRole("listitem").first()).toContainText("버전 fixture-v1");
});
