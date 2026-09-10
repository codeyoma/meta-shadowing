import { pauseCloudClock, advanceCloudClock, enterAccountPractice, reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { openSelectedStageSettings, returnToStages, startSelectedStage } from "./fixtures/stage-preview";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, manualConfirmation, waitForManualListen } from "./fixtures/manual-practice";

async function signIn(page: Page) {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
}

test("device settings persist across lessons and level selections", async ({ page }) => {
  await signIn(page);
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
  await page.getByRole("radio", { name: /7 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  await page.getByLabel("묶음 크기").selectOption("4");
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await page.getByLabel("재생속도").selectOption("2");
  await page.getByLabel("다음 이동 대기 (초)").fill("2");
  await returnToStages(page);
  await page.getByRole("radio", { name: /13 속사포 한영/ }).click();
  await openSelectedStageSettings(page);
  await page.getByLabel("단어 속도").selectOption("6");
  await page.getByRole("radio", { name: "누적 단어", exact: true }).click();
  await page.getByLabel("말하기 추가 시간 (초)").fill("2");
  await startSelectedStage(page);
  await expect(page).toHaveURL(/player/);
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000003");
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("재생속도")).toHaveValue("2");
  await expect(page.getByRole("radio", { name: "자동", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("다음 이동 대기 (초)")).toHaveValue("2");
  await returnToStages(page);
  await page.getByRole("radio", { name: /9 다문장 첫 단어/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("묶음 크기")).toHaveValue("4");
  await returnToStages(page);
  await page.getByRole("radio", { name: /15 속사포 한글/ }).click();
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("단어 속도")).toHaveValue("6");
  await expect(page.getByRole("radio", { name: "누적 단어", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByLabel("말하기 추가 시간 (초)")).toHaveValue("2");
});

test("local audio confirmations survive navigation and manual speaking excludes settings and background pauses", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await signIn(page);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1");
  await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await openLearnerPage(page, "/lessons?language=english");
  await page.getByRole("link", { name: /Morning Routine/ }).click();
  await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).click();
  await enterAccountPractice(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  for (let phrase = 0; phrase < 3; phrase++) {
    await page.getByRole("button", { name: phrase === 0 ? "CONTINUE · 다음 원음 듣기" : "CONTINUE · 첫 원음 듣기", exact: true }).click();
    for (let cycle = phrase === 0 ? 2 : 1; cycle <= 3; cycle++) {
      await confirmManualListen(page);
      await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
      if (phrase === 1 && cycle === 1) {
        await waitForManualListen(page);
        await advanceCloudClock(page, 2000);
        await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
        await page.getByRole("button", { name: "학습 설정", exact: true }).click();
        await page.keyboard.press("Escape");
        await expect(manualConfirmation(page)).toBeVisible();
        await advanceCloudClock(page, 7000);
      }
    }
    if (phrase === 0) {
      await advanceCloudClock(page, 5000);
      await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
      await page.getByRole("button", { name: "학습 설정", exact: true }).click();
      await advanceCloudClock(page, 10000);
      await page.getByLabel("재생속도").selectOption("2");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }).click();
      await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
      await openLearnerPage(page, "/lessons?language=english");
      await page.getByRole("link", { name: /Morning Routine/ }).click();
      await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).click();
  await enterAccountPractice(page);
      await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
    } else if (phrase === 1) {
      await page.evaluate(() => {
        Object.defineProperty(document, "hidden", { configurable: true, value: true });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await advanceCloudClock(page, 20000);
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
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000002&level=5&group=2&groupGap=0");
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
  await reloadLearnerPage(page);
  await expect(page.getByText("묶음 2 / 4", { exact: true })).toBeVisible();
  await expect(page.getByText("3문장", { exact: true })).toBeVisible();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await expect(phrases.nth(0)).toHaveAttribute("aria-current", "true");
});

test("blocked identity storage shows the device gate and never pretends completion was saved", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, "localStorage", { get() { throw new DOMException("Storage blocked", "SecurityError"); } }));
  await signIn(page);
  await page.goto("/player?lesson=10000000-0000-4000-8000-000000000003&level=8&mode=automatic&lineGap=0");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("기기 계정 저장 공간을 확인해 주세요.");
  await expect(page.getByRole("button", { name: /^CONTINUE/ })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "레벨 8 학습 완료" })).toHaveCount(0);
});

test("malformed legacy records cannot replace saved device settings", async ({ page }) => {
  await signIn(page);
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
  await openSelectedStageSettings(page);
  await page.getByLabel("재생속도").selectOption("2");
  await page.keyboard.press("Escape");
  await startSelectedStage(page);
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).waitFor();
  await page.evaluate(() => {
    localStorage.setItem("meta-shadowing:preferences:v1", "not-json");
    localStorage.setItem("meta-shadowing:learning:v1", "not-json");
  });
  await openLearnerPage(page, "/lessons?language=english");
  await expect(page.getByRole("link", { name: /Morning Routine/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "완료 기록" })).toHaveCount(0);
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
  await openSelectedStageSettings(page);
  await expect(page.getByLabel("재생속도")).toHaveValue("2");
  await returnToStages(page);
  await expect(page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio").first()).toBeEnabled();
  await expect(page.getByRole("list", { name: "학습 단계", exact: true }).getByRole("radio", { checked: true })).toHaveCount(0);
});

test("changing an unrelated group-size preference does not restart a completed rapid run", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await signIn(page);
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=6&mode=automatic&lineGap=0");
  await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await advanceCloudClock(page, 8000);
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
  const completedUrl = page.url();
  // Let Next's client navigation timers run while outside timed practice.
  await page.clock.resume();
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000002");
  await page.getByRole("radio", { name: /7 다문장 암기/ }).click();
  await openSelectedStageSettings(page);
  await page.getByLabel("묶음 크기").selectOption("4");
  await openLearnerPage(page, completedUrl);
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
});

test("rapid resume commits complete lines, excludes pauses and background time, and appends each completed run once", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await signIn(page);
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=6");
  await pauseCloudClock(page, new Date("2026-09-06T00:01:00Z"));
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 2700); // 5 English + 4 Korean tokens at 200 WPM.
  await expect(page.getByRole("button", { name: "CONTINUE · 다음 문장", exact: true })).toBeEnabled();
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 300); // Partial second line must not be resumed in the middle.
  await openLearnerPage(page, "/lessons?language=english");
  await page.getByRole("link", { name: /Morning Routine/ }).click();
  await page.getByRole("button", { name: "현재 스테이지 11 시작", exact: true }).click();
  await enterAccountPractice(page);
  await expect(page.getByText("문장 2 / 3", { exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 300);
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 10000);
  await page.keyboard.press("Space");
  await advanceCloudClock(page, 300);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await advanceCloudClock(page, 20000);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByRole("button", { name: /^CONTINUE/ })).toBeEnabled();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^PAUSE/ })).toBeEnabled();
  await advanceCloudClock(page, 1800); // Remaining active time plus the resume frame.
  await expect(page.getByRole("button", { name: "CONTINUE · 다음 문장", exact: true })).toBeEnabled();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /^PAUSE/ })).toBeEnabled();
  await advanceCloudClock(page, 2400); // Third line: 4 English + 3 Korean; include its first frame.
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
  await expect(page.getByLabel("활성 학습시간")).toHaveText("6.9초");
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByLabel("완료 날짜")).toContainText("2026");
  await reloadLearnerPage(page);
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
  await page.getByRole("button", { name: "레슨 목록으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\?/);
  await expect(page.getByRole("region", { name: "완료 기록" })).toHaveCount(0);
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000001/stages");
  await page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "완료 기록", exact: true }).getByRole("button", { name: "설정 보기", exact: true })).toHaveCount(1);
  await page.clock.resume();
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000001");
  await page.getByRole("radio", { name: /11 속사포 영한/ }).click();
  await openSelectedStageSettings(page);
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await page.getByLabel("문장 간격 (초)").fill("0");
  await page.keyboard.press("Escape");
  await startSelectedStage(page);
  await pauseCloudClock(page, await page.evaluate(() => Date.now() + 1000));
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await expect(page.getByRole("region", { name: "속사포 학습" })).toHaveText("I");
  await advanceCloudClock(page, 8000);
  await expect(page.getByLabel("활성 학습시간")).toHaveText("6.9초");
  await page.getByRole("button", { name: "레슨 목록으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\?/);
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000001/stages");
  await page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true }).click();
  const history = page.getByRole("dialog", { name: "완료 기록", exact: true });
  await expect(history.getByRole("button", { name: "설정 보기", exact: true })).toHaveCount(2);
  const settings = history.getByRole("button", { name: "설정 보기", exact: true }).first();
  await settings.click();
  const details = page.locator(`[id="${await settings.getAttribute("aria-controls")}"]`);
  await expect(details).toContainText("200 WPM");
  await expect(details).toContainText("버전 2026-09-01T00:00:00+00:00");
});
