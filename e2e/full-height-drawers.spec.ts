import { expect, test, type Page } from "./fixtures/cloud-ui";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
});

test("player help, analysis, and dictionary use full-height drawers", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
  await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeVisible();
  for (const trigger of [page.locator("#practice-help-trigger"), page.getByRole("button", { name: "문장 분석", exact: true }), page.getByRole("button", { name: "wake 뜻 보기", exact: true })]) {
    await trigger.click();
    await expectFullDrawer(page);
    await page.getByRole("dialog").getByRole("button", { name: /^(닫기|확인)$/ }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(trigger).toBeFocused();
  }
  await page.locator("#practice-help-trigger").click();
  await expectFullDrawer(page);
  await page.getByRole("tab", { name: "Lv 8", exact: true }).click();
  await expect(page.getByRole("tabpanel")).toBeVisible();
  await page.screenshot({ path: `/tmp/drawers-${info.project.name}-help.png`, animations: "disabled" });
  await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
  await page.locator("#player-menu-trigger").click();
  const menu = page.getByRole("navigation", { name: "학습 메뉴 항목" });
  await expect(menu.getByRole("button")).toHaveText(["학습 설정", "문장 목록", "스테이지 화면으로"]);
  await expect(page.locator('#player-menu [data-slot="drawer-footer"] button')).toHaveText(["확인"]);
  await page.screenshot({ path: `/tmp/drawers-${info.project.name}-menu.png`, animations: "disabled" });
  await menu.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000001\/stages/);
  expect(errors).toEqual([]);
});

async function expectFullDrawer(page: Page) {
  const drawer = page.locator('[data-slot="drawer-content"]');
  await expect(drawer).toBeVisible();
  await expect.poll(async () => Math.round((await drawer.boundingBox())!.y)).toBe(0);
  const box = (await drawer.boundingBox())!;
  expect(Math.round(box.height)).toBe(page.viewportSize()!.height);
  expect(box.width).toBeLessThanOrEqual(430);
  const help = await drawer.getByRole("heading", { name: "학습 방법", exact: true }).count();
  const action = drawer.getByRole("button", { name: help ? "닫기" : "확인", exact: true });
  await expect(action).toBeVisible();
  await expect(action).toHaveCSS("background-color", "rgb(28, 176, 246)");
  if (!help) {
    await expect(action.locator("svg.lucide-check")).toBeVisible();
  }
}

test("current-stage arc keeps the same visible length for a complete lap", async ({ page }) => {
  await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages");
  const arc = page.locator("[data-stage-arc]");
  await expect(arc).toBeVisible();
  await page.addStyleTag({ content: '[data-stage-ring] ~ * { visibility: hidden; }' });
  const sharp = (await import("sharp")).default;
  const counts: number[] = [];
  for (let frame = 0; frame < 12; frame++) {
    await arc.evaluate((element, time) => {
      (element as SVGElement).style.stroke = "rgb(255, 0, 255)";
      for (const animation of element.getAnimations()) { animation.pause(); animation.currentTime = time; }
    }, frame * 200);
    const bytes = await page.locator("[data-stage-ring] svg").screenshot();
    const { data, info } = await sharp(bytes).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    let count = 0;
    for (let i = 0; i < data.length; i += info.channels) if (data[i] > 220 && data[i + 1] < 100 && data[i + 2] > 220) count++;
    counts.push(count);
  }
  expect(Math.min(...counts), `painted arc pixels: ${counts.join(", ")}`).toBeGreaterThan(Math.max(...counts) * .85);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(arc).toHaveCSS("animation-name", "none");
});

test("completion history opens a full-height drawer and restores its trigger", async ({ page }, info) => {
  await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages");
  const trigger = page.getByRole("button", { name: "이 레슨의 완료 기록", exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expectFullDrawer(page);
  await page.screenshot({ path: `/tmp/drawers-${info.project.name}-history.png`, animations: "disabled" });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expectFullDrawer(page);
  const handle = (await page.locator('[data-slot="drawer-handle"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle.x + handle.width / 2, page.viewportSize()!.height * .9, { steps: 15 });
  await page.mouse.up();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
