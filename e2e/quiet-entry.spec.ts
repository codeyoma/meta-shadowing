import { expect, test } from "./fixtures/cloud-ui";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
});

test("history refresh keeps the stage screen and dialog visible", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages");
  const history = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
  await expect(history).toBeEnabled();
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  let requested!: () => void;
  const started = new Promise<void>(resolve => { requested = resolve; });
  await page.route("**/api/learner/practice", async route => {
    requested();
    await held;
    await route.continue();
  });
  try {
    await history.click();
    await started;
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("heading", { name: "완료 기록", exact: true })).toBeVisible();
    await expect(page.locator("ol")).toBeVisible();
    await page.screenshot({ path: `/tmp/flicker-${testInfo.project.name}-history.png`, animations: "disabled" });
  } finally { release(); }
  await expect(page.getByRole("dialog").locator('[aria-busy="true"]')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("account reads stay quiet while pending and still show real errors", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/learner/preferences?*", async route => {
    await held;
    await route.fulfill({ status: 503, json: { error: "preferences-unavailable" } });
  });
  await page.goto("/languages");
  await expect(page.locator('[aria-busy="true"]').first()).toBeAttached();
  await expect(page.locator('[data-slot="skeleton"]').first()).toBeVisible();
  await expect(page.getByRole("navigation", { name: "하단 탐색", includeHidden: true })).toBeVisible();
  await expect(page.getByText("계정 설정을 불러오는 중…", { exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole("alert", { name: "계정 설정 알림" })).toBeVisible();
  await expect(page.getByRole("button", { name: "다시 불러오기", exact: true })).toBeVisible();
});

test("practice opens directly without account-storage instructions", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
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
  await page.route("**/api/learner/preferences?*", async route => {
    requests++;
    await held;
    await route.continue();
  });
  try {
    await page.getByRole("link", { name: "설정", exact: true }).click();
    await expect.poll(() => requests).toBe(1);
    await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await page.getByRole("link", { name: "언어", exact: true }).click();
    await expect(page.getByRole("heading", { name: "언어 선택", exact: true })).toBeVisible();
    expect(requests).toBe(1);
    await page.screenshot({ path: `/tmp/flicker-${testInfo.project.name}-navigation.png`, animations: "disabled" });
  } finally { release(); }
  await expect(page).toHaveTitle("Meta Shadowing");
});

test("history errors stay in the dialog and retry without clearing the stage map", async ({ page }) => {
  await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages");
  const history = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
  await expect(history).toBeEnabled();
  await page.route("**/api/learner/practice", route => route.fulfill({ status: 503, json: { error: "unavailable" } }));
  await history.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert", { name: "완료 기록 알림" })).toBeVisible();
  await expect(page.locator("ol")).toBeVisible();
  await page.unroute("**/api/learner/practice");
  await dialog.getByRole("button", { name: "다시 불러오기", exact: true }).click();
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog.locator('[aria-busy="true"]')).toHaveCount(0);
  await expect(dialog).toBeVisible();
});

test("settings logout matches the settings row with cardinal text", async ({ page }, testInfo) => {
  await page.goto("/settings");
  const logout = page.getByRole("button", { name: "로그아웃", exact: true });
  await expect(logout).toHaveAttribute("data-variant", "choice");
  await expect(logout).toHaveAttribute("data-size", "row");
  await expect(logout).toHaveCSS("color", "rgb(255, 75, 75)");
  await page.screenshot({ path: `/tmp/quiet-entry-${testInfo.project.name}-settings.png` });
});
