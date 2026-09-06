import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

async function openPlayer(page: Page, query = "") {
  await page.route("**/api/lessons/*/audio/*", (route) => route.fulfill({
    contentType: "audio/webm", body: testRecording
  }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=morning-routine&level=1${query}`);
  // Keyboard input does not auto-wait for the streamed page's client listeners.
  await page.waitForLoadState("networkidle");
}

test("keyboard practice counts three required and two extra listens before R advances", async ({ page }) => {
  await openPlayer(page);
  const cycles = page.getByLabel("완료한 듣기");
  await expect(cycles).toHaveText("필수 0 / 3");
  for (const [index, key] of ["Space", "r", "Space"].entries()) {
    await page.keyboard.press(key);
    await expect(cycles).toHaveText(`필수 ${index + 1} / 3`);
  }
  for (const extra of [1, 2]) {
    await page.keyboard.press("r");
    await expect(cycles).toHaveText(`필수 3 / 3 · 추가 ${extra} / 2`);
  }
  await page.keyboard.press("r");
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible();
  await expect(cycles).toHaveText("필수 0 / 3");
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
});

test("setup applies automatic mode and speed, and R cancels advancement for an extra listen", async ({ page }) => {
  await openPlayer(page);
  await page.goto("/setup?lesson=morning-routine");
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByLabel("재생속도").selectOption("0.5");
  await page.getByLabel("다음 이동 대기 (초)").fill("3");
  await page.getByRole("button", { name: "학습 시작" }).click();
  await expect(page.getByText("자동 · 0.5×")).toBeVisible();
  await page.getByRole("button", { name: "첫 원음 듣기", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("들은 문장을 말해 보세요.");
  await expect(page.getByRole("status")).toHaveText("곧 다음 프레이즈로 이동합니다.", { timeout: 15000 });
  await page.keyboard.press("r");
  await expect(page.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await expect(page.getByText("I wash my face.", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("Space pauses live audio and R restarts the unfinished listen without increasing the count", async ({ page }) => {
  await openPlayer(page, "&speed=0.5");
  await page.keyboard.press("Space");
  await expect.poll(() => page.locator("audio").evaluate((element) => {
    const audio = element as HTMLAudioElement;
    return audio.currentTime > 0 && !audio.paused;
  })).toBe(true);
  await page.keyboard.press("Space");
  await expect(page.getByRole("status")).toHaveText("일시정지됨");
  const pausedTime = await page.locator("audio").evaluate((audio) => (audio as HTMLAudioElement).currentTime);
  await page.waitForTimeout(900);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  expect(await page.locator("audio").evaluate((audio) => (audio as HTMLAudioElement).currentTime)).toBe(pausedTime);
  await page.keyboard.press("r");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("touch controls recover a failed recording and complete every phrase without keyboard input", async ({ page, isMobile }) => {
  await openPlayer(page);
  let failPlayback = true;
  await page.route("**/api/lessons/*/audio/*", (route) => failPlayback
    ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"audio-unavailable"}' })
    : route.fulfill({ contentType: "audio/webm", body: testRecording }));
  // Fail before the new player's current/next preload starts.
  await page.reload();
  await page.waitForLoadState("networkidle");
  const activate = async (locator: ReturnType<Page["getByRole"]>) => isMobile ? locator.tap() : locator.click();
  await activate(page.getByRole("button", { name: "첫 원음 듣기", exact: true }));
  const playbackError = page.getByRole("alert", { name: "원음 재생 오류" });
  await expect(playbackError).toContainText("원음을 재생할 수 없습니다.");
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  failPlayback = false;
  await activate(playbackError.getByRole("button", { name: "다시 시도", exact: true }));
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  for (let phrase = 0; phrase < 3; phrase++) {
    for (let cycle = phrase === 0 ? 2 : 1; cycle <= 3; cycle++) {
      await activate(page.getByRole("button", { name: cycle === 1 ? "첫 원음 듣기" : "다음 원음 듣기", exact: true }));
      await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
    }
    await activate(page.getByRole("button", { name: "다음 프레이즈", exact: true }));
  }
  await expect(page.getByRole("heading", { name: "레벨 1 학습 완료" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "3");
});

test("keyboard focus keeps settings operable and speed choices reach the actual audio element", async ({ page }) => {
  await openPlayer(page);
  await page.getByRole("button", { name: "학습 설정", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(page.getByLabel("재생속도")).toBeVisible();
  await page.getByLabel("재생속도").selectOption("3");
  await page.getByRole("button", { name: "설정 닫기" }).click();
  await expect(page.getByText("수동 · 3×")).toBeVisible();
  await page.getByRole("button", { name: "첫 원음 듣기", exact: true }).click();
  expect(await page.locator("audio").evaluate((element) => (element as HTMLAudioElement).playbackRate)).toBe(3);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});
