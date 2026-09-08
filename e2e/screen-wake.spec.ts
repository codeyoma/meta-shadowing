import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";

async function supportedWakeLock(page: Page) {
  await page.addInitScript(() => {
    const locks = new Set<EventTarget & { released: boolean; release: () => Promise<void> }>();
    Object.defineProperty(window, "testScreenWake", { value: {
      active: () => locks.size,
      release: () => Promise.all([...locks].map(lock => lock.release()))
    } });
    Object.defineProperty(navigator, "wakeLock", { configurable: true, value: {
      request: async () => {
        const lock = Object.assign(new EventTarget(), {
          released: false,
          async release() {
            if (lock.released) return;
            lock.released = true;
            locks.delete(lock);
            lock.dispatchEvent(new Event("release"));
          }
        });
        locks.add(lock);
        return lock;
      }
    } });
  });
}

async function activeLocks(page: Page) {
  return page.evaluate(() => (window as typeof window & { testScreenWake: { active: () => number } }).testScreenWake.active());
}

test("screen wake covers manual speaking and releases on pause, settings, background and leaving practice", async ({ page }) => {
  await supportedWakeLock(page);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=1");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).waitFor();
  expect(await activeLocks(page)).toBe(0);
  await page.keyboard.press("Space");
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect.poll(() => activeLocks(page)).toBe(1);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await expect.poll(() => activeLocks(page)).toBe(0);
  await page.keyboard.press("Escape");
  await confirmManualListen(page);
  await expect.poll(() => activeLocks(page)).toBe(1);
  await waitForManualListen(page);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect.poll(() => activeLocks(page)).toBe(0);
  await page.keyboard.press("Escape");
  await confirmManualListen(page);
  await expect.poll(() => activeLocks(page)).toBe(1);
  await waitForManualListen(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect.poll(() => activeLocks(page)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { configurable: true, value: false });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await activeLocks(page)).toBe(0);
  await confirmManualListen(page);
  await expect.poll(() => activeLocks(page)).toBe(1);
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await expect.poll(() => activeLocks(page)).toBe(0);
  await page.getByRole("button", { name: "메뉴로 돌아가기", exact: true }).click();
  await page.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/morning-routine\/stages/);
  await expect.poll(() => activeLocks(page)).toBe(0);
});

test("rapid practice keeps the screen awake while running and releases it on completion", async ({ page }) => {
  await supportedWakeLock(page);
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=6&mode=automatic&lineGap=0");
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await expect.poll(() => activeLocks(page)).toBe(1);
  await page.clock.runFor(6900);
  await expect(page.getByRole("heading", { name: "레벨 6 학습 완료" })).toBeVisible();
  await expect.poll(() => activeLocks(page)).toBe(0);
});

for (const support of ["unsupported", "denied"] as const) {
  test(`screen wake ${support} stays silent without blocking practice`, async ({ page }) => {
    await page.addInitScript(support => {
      Object.defineProperty(navigator, "wakeLock", { configurable: true, value: support === "unsupported" ? undefined : {
        request: async () => { throw new DOMException("Power saving", "NotAllowedError"); }
      } });
    }, support);
    await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
    await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
    await page.goto("/player?lesson=morning-routine&level=1");
    await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
    await confirmManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
    await expect(page.getByLabel("화면 유지 안내")).toHaveCount(0);
    await confirmManualListen(page);
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 2 / 3");
  });
}

test("a system-released screen wake stays silent and an explicit resume requests it again", async ({ page }) => {
  await supportedWakeLock(page);
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=6");
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await expect.poll(() => activeLocks(page)).toBe(1);
  await page.evaluate(() => (window as typeof window & { testScreenWake: { release: () => Promise<void> } }).testScreenWake.release());
  await expect.poll(() => activeLocks(page)).toBe(0);
  await expect(page.getByLabel("화면 유지 안내")).toHaveCount(0);
  await page.getByRole("button", { name: "PAUSE · 일시정지", exact: true }).click();
  await page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true }).click();
  await expect.poll(() => activeLocks(page)).toBe(1);
  await expect(page.getByLabel("화면 유지 안내")).toHaveCount(0);
});
