import { expect, test } from "./fixtures/cloud-ui";
import { openLearnerPage } from "./fixtures/cloud-navigation";
import { seedLearningJournal, fixtureVersion } from "./fixtures/cloud-journal";
import { DEFAULT_SESSION_SETTINGS } from "../src/lib/session-settings";

const stages = "/lessons/10000000-0000-4000-8000-000000000001/stages";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
});

test("history opens from local records without waiting for the legacy server journal", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(stages);
  const history = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
  await expect(history).toBeEnabled();
  await seedLearningJournal(page, { history: [{
    runId: "quiet-local-history", lessonId: "10000000-0000-4000-8000-000000000001", lessonVersion: fixtureVersion,
    lessonName: "Morning Routine", language: "english", level: 1, stage: 1,
    nextUnit: 3, nextPhrase: 3, activeMs: 2000, settings: DEFAULT_SESSION_SETTINGS, completedAt: "2026-09-08T01:00:00Z",
  }] });
  let requests = 0;
  await page.route("**/api/learner/practice", route => {
    requests++;
    return route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  await history.click();
  const dialog = page.getByRole("dialog", { name: "완료 기록", exact: true });
  await expect(dialog.getByLabel("활성 학습시간")).toHaveText("2.0초");
  await expect(dialog.getByLabel("완료 날짜")).toHaveAttribute("datetime", "2026-09-08T01:00:00Z");
  await expect(page.locator("ol")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.screenshot({ path: `/tmp/flicker-${testInfo.project.name}-history.png`, animations: "disabled" });
  expect(requests).toBe(0);
  expect(errors).toEqual([]);
});

test("remembered account access stays quiet through network failure but explicit rejection blocks access", async ({ page }) => {
  await page.goto("/languages");
  const heading = page.getByRole("heading", { name: "언어 선택", exact: true });
  await expect(heading).toBeVisible();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route("**/api/learner/local-access", async route => {
    requests++;
    await held;
    await route.fulfill({ status: 503, json: { error: "unavailable" } });
  });
  try {
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(heading).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
  } finally { release(); }
  await page.waitForLoadState("networkidle");
  await expect(heading).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("alert", { name: "계정 설정 알림" })).toHaveCount(0);
  await page.unroute("**/api/learner/local-access");
  await page.route("**/api/learner/local-access", route => route.fulfill({ status: 401, json: { error: "unauthorized" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  const failure = page.getByRole("alertdialog", { name: "온라인 로그인이 필요합니다.", exact: true });
  await expect(failure).toBeVisible();
  await expect(failure.getByRole("button", { name: "로그인", exact: true })).toBeEnabled();
  await expect(heading).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("meta-shadowing:device-access:v1"))).toBeNull();
});

test("downloaded practice opens without account-storage instructions", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
  await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeVisible();
  await expect(page.getByText("계정 학습 시작", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/마지막 서버 확인 지점에서 이어 학습합니다/)).toHaveCount(0);
  await expect(page.getByText("서버 확인 중…", { exact: true })).not.toBeVisible();
  await expect(page).toHaveTitle("Meta Shadowing");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await expect(page.getByRole("button", { name: "스테이지 화면으로", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: `/tmp/quiet-entry-${testInfo.project.name}-player.png` });
});

test("navigation and overlapping refreshes keep confirmed content visible", async ({ page }, testInfo) => {
  await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages");
  await expect(page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true })).toBeEnabled();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route("**/api/learner/local-access", async route => {
    requests++;
    await held;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "설정", exact: true }).click();
    expect(requests).toBe(0);
    await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
    await page.getByRole("dialog", { name: "설정", exact: true }).getByRole("button", { name: "닫기", exact: true }).click();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.getByRole("link", { name: "언어", exact: true }).click();
    await expect(page.getByRole("heading", { name: "언어 선택", exact: true })).toBeVisible();
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await page.screenshot({ path: `/tmp/flicker-${testInfo.project.name}-navigation.png`, animations: "disabled" });
  } finally { release(); }
  await expect(page).toHaveTitle("Meta Shadowing");
});

test("local history read failures show an actionable dialog and recover without losing the stage map", async ({ page }) => {
  await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages");
  const history = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
  await expect(history).toBeEnabled();
  await history.click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function (...args) {
      if (this.name === "accounts" && this.transaction.mode === "readonly" && this.transaction.objectStoreNames.length === 1) {
        throw new DOMException("Fixture local history read failure", "NotReadableError");
      }
      return original.apply(this, args);
    };
    window.dispatchEvent(new Event("device-learning-changed"));
  });
  const failure = page.getByRole("alertdialog", { name: "기기 완료 기록을 읽지 못했습니다.", exact: true });
  await expect(failure).toBeVisible();
  await expect(page.locator("ol")).toBeVisible();
  // A real reload removes this document's injected storage failure.
  await failure.getByRole("button", { name: "새로고침", exact: true }).click();
  await expect(history).toBeEnabled();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await history.click();
  await expect(page.getByRole("dialog", { name: "완료 기록", exact: true })).toContainText("아직 완료한 학습이 없습니다.");
  await expect(page.locator("ol")).toBeVisible();
});

test("settings logout matches the settings row with cardinal text", async ({ page }, testInfo) => {
  await page.goto("/settings");
  const logout = page.getByRole("button", { name: "로그아웃", exact: true });
  await expect(logout).toHaveAttribute("data-variant", "choice");
  await expect(logout).toHaveAttribute("data-size", "row");
  await expect(logout).toHaveCSS("color", "rgb(255, 75, 75)");
  await page.screenshot({ path: `/tmp/quiet-entry-${testInfo.project.name}-settings.png` });
});

test("settings save locally without legacy preference writes and survive reload", async ({ page }) => {
  await page.goto("/settings/session");
  const speed = page.getByRole("combobox", { name: "재생속도", exact: true });
  await expect(speed).toBeEnabled();
  const patches: string[] = [];
  page.on("request", request => { if (request.method() === "PATCH" && new URL(request.url()).pathname === "/api/learner/preferences") patches.push(request.url()); });
  await speed.selectOption("2");
  await expect(speed).toBeEnabled();
  await page.reload();
  await expect(speed).toHaveValue("2");
  await expect(page.getByRole("alert", { name: "계정 설정 알림" })).toHaveCount(0);
  expect(patches).toEqual([]);
});
