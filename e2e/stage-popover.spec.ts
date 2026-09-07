import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/setup?lesson=morning-routine");
});

test("a stage opens a contextual preview and starts only on its explicit Start action", async ({ page }) => {
  const stage = page.getByRole("radio", { name: /5 첫 단어 힌트/ });
  await stage.click();
  const popup = page.getByRole("dialog", { name: "첫 단어 힌트", exact: true });
  await expect(popup).toBeVisible();
  await expect(page.getByRole("main").getByRole("button", { name: "학습 시작", exact: true })).toHaveCount(0);
  await expect(popup).toContainText("스테이지 5 · Lv 3");
  await expect(popup).toContainText("첫 단어를 힌트로 듣고, 자막 없이 두 번 말하세요.");
  await expect(page).toHaveURL(/\/lessons\/[^/]+\/stages/);
  expect(await page.evaluate(() => localStorage.getItem("meta-shadowing:last-selection"))).toBeNull();
  await page.keyboard.press("Escape");
  await expect(stage).toBeFocused();
  await stage.click();
  await popup.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page).toHaveURL(/level=3(?:&|$)/);
  await expect(page).toHaveURL(/stage=5(?:&|$)/);
});

test("popup settings sit beside Start and return to the chosen stage without starting a session", async ({ page }) => {
  await expect(page.getByRole("main").getByRole("button", { name: "세션 설정", exact: true })).toHaveCount(0);
  const first = page.getByRole("radio", { name: /1 자막 쉐도잉/ });
  await first.click();
  await page.getByRole("button", { name: "스테이지 안내 닫기", exact: true }).click();
  await expect(first).toBeFocused();
  await page.getByRole("radio", { name: /8 다문장 암기/ }).click();
  const popup = page.getByRole("dialog", { name: "다문장 암기", exact: true });
  await expect(popup).toContainText("스테이지 8 · Lv 4");
  const settings = popup.getByRole("button", { name: "세션 설정", exact: true });
  const start = popup.getByRole("button", { name: "학습 시작", exact: true });
  await settings.click({ trial: true });
  const settingsBox = (await settings.boundingBox())!;
  const startBox = (await start.boundingBox())!;
  expect(settingsBox.x + settingsBox.width).toBeLessThan(startBox.x);
  expect(Math.abs(settingsBox.y - startBox.y)).toBeLessThanOrEqual(1);
  expect(Math.min(settingsBox.width, settingsBox.height)).toBeGreaterThanOrEqual(44);
  await settings.click();
  await expect(page.getByRole("heading", { name: "세션 설정", exact: true })).toBeVisible();
  await page.getByLabel("묶음 크기").selectOption("4");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await page.getByRole("radio", { name: /8 다문장 암기/, checked: true }).click();
  await expect(popup).toContainText("스테이지 8 · Lv 4");
  await expect(page).toHaveURL(/\/lessons\/[^/]+\/stages/);
  await settings.click();
  await expect(page.getByLabel("묶음 크기")).toHaveValue("4");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await page.getByRole("radio", { name: /8 다문장 암기/, checked: true }).click();
  await start.click();
  await expect(page).toHaveURL(/level=4(?:&|$)/);
  await expect(page).toHaveURL(/stage=8(?:&|$)/);
  await expect(page).toHaveURL(/group=4(?:&|$)/);
});

test("a short landscape popup keeps its description from covering settings or Start", async ({ page }) => {
  await page.setViewportSize({ width: 932, height: 430 });
  await page.getByRole("radio", { name: /^2 자막 쉐도잉/ }).click();
  const popup = page.getByRole("dialog", { name: "자막 쉐도잉", exact: true });
  const settings = popup.getByRole("button", { name: "세션 설정", exact: true });
  const description = popup.getByRole("region", { name: "스테이지 안내", exact: true });
  await description.hover();
  await page.mouse.wheel(0, 300);
  await expect(popup.getByText("자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.", { exact: true })).toBeInViewport();
  await settings.click();
  await expect(page.getByRole("heading", { name: "세션 설정", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await page.getByRole("radio", { name: /^2 자막 쉐도잉/, checked: true }).click();
  await popup.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page).toHaveURL(/level=1(?:&|$)/);
  await expect(page).toHaveURL(/stage=2(?:&|$)/);
});
