import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
});

async function openView(page: Page, view: "menu" | "settings" | "sentences") {
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  if (view !== "menu") await page.getByRole("button", { name: view === "settings" ? "학습 설정" : "문장 목록", exact: true }).click();
  const drawer = page.locator("#player-menu");
  // The footer stays still during resizing; wait on the moving sheet itself.
  await drawer.click({ trial: true });
  await page.mouse.move(0, 0);
  return drawer;
}

for (const viewport of [{ width: 430, height: 932 }, { width: 1280, height: 800 }, { width: 568, height: 320 }]) {
  test(`drawer footer and full-height sentence scrolling at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
    await page.setViewportSize(viewport);
    await page.goto("/player?lesson=daily-conversation&level=1&mode=manual&stage=2");
    await expect(page).toHaveTitle(/Meta Shadowing/i);
    const practice = page.getByRole("button", { name: /^CONTINUE/ });
    const appearance = await practice.evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, shadow: style.boxShadow, radius: style.borderRadius, height: element.getBoundingClientRect().height };
    });
    for (const view of ["menu", "settings", "sentences"] as const) {
      const drawer = await openView(page, view);
      const confirm = drawer.getByRole("button", { name: "확인", exact: true });
      const stages = drawer.getByRole("button", { name: "스테이지 화면으로", exact: true });
      await expect(confirm).toBeInViewport();
      await expect(stages).toBeInViewport();
      await expect(confirm).toHaveCSS("background-color", appearance.background);
      await expect(confirm).toHaveCSS("box-shadow", appearance.shadow);
      await expect(confirm).toHaveCSS("border-radius", appearance.radius);
      expect((await confirm.boundingBox())!.height).toBe(appearance.height);
      await expect(stages).toHaveCSS("color", "rgb(255, 75, 75)");
      await expect(stages.locator("svg.lucide-map")).toHaveCount(1);
      const footer = drawer.locator('[data-slot="drawer-footer"]');
      await expect(footer.getByRole("button")).toHaveCount(2);
      const confirmBox = (await confirm.boundingBox())!;
      expect((await stages.boundingBox())!.y).toBeGreaterThanOrEqual(confirmBox.y + confirmBox.height);
      if (view === "menu") await expect(drawer.getByRole("navigation").getByRole("button")).toHaveCount(2);
      if (view === "settings") {
        const speed = drawer.getByRole("combobox", { name: "재생속도", exact: true });
        await speed.scrollIntoViewIfNeeded();
        const bounds = await speed.evaluate(element => {
          let container = element.parentElement;
          while (container && getComputedStyle(container).overflowY !== "auto") container = container.parentElement;
          return { control: element.getBoundingClientRect().height, available: container?.clientHeight ?? 0 };
        });
        expect(bounds.available).toBeGreaterThanOrEqual(bounds.control);
        await speed.selectOption("2");
        await expect(speed).toHaveValue("2");
      }
      if (view === "sentences") {
        const box = (await drawer.boundingBox())!;
        expect(box.y).toBeCloseTo(0, 0);
        expect(box.height).toBeCloseTo(viewport.height, 0);
        const list = drawer.locator('[data-slot="sentence-list"]');
        const footerBefore = (await footer.boundingBox())!;
        const listBox = (await list.boundingBox())!;
        expect(listBox.height).toBeGreaterThan(32);
        expect(listBox.y + listBox.height).toBeLessThanOrEqual(footerBefore.y + 1);
        await list.getByRole("button", { name: /At work/ }).click();
        await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
        await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
        expect((await footer.boundingBox())!.y).toBeCloseTo(footerBefore.y, 0);
        expect(await drawer.evaluate(element => element.scrollTop)).toBe(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expect(page.locator("nextjs-portal")).not.toContainText(/Runtime Error|Build Error/);
      await page.screenshot({ path: info.outputPath(`${view}-${viewport.width}.png`), animations: "disabled", scale: "css" });
      await confirm.press("Enter");
      await expect(drawer).toHaveCount(0);
      await expect(page.getByRole("button", { name: "학습 메뉴", exact: true })).toBeFocused();
      await expect(page.getByRole("progressbar", { name: "프레이즈 진행", exact: true })).toHaveAttribute("aria-valuenow", "0");
      await expect(page.locator("audio")).toHaveJSProperty("paused", true);
    }
    expect(errors).toEqual([]);
  });
}

test("every drawer view returns to the current lesson and stage through the footer map button", async ({ page }) => {
  for (const view of ["menu", "settings", "sentences"] as const) {
    await page.goto("/player?lesson=daily-conversation&level=1&mode=manual&stage=2");
    const drawer = await openView(page, view);
    await drawer.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
    await expect(page).toHaveURL("/lessons/daily-conversation/stages?stage=2");
  }
});

test("only filled player progress shimmers and reduced motion disables the reflection", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/player?lesson=daily-conversation&level=1&mode=manual");
  const progress = page.getByRole("progressbar", { name: "프레이즈 진행", exact: true });
  const indicator = progress.locator('[data-slot="progress-indicator"]');
  const animation = () => indicator.evaluate(element => getComputedStyle(element, "::after").animationName);
  await expect(progress).toHaveAttribute("aria-valuenow", "0");
  expect(await animation()).toBe("none");
  const drawer = await openView(page, "sentences");
  await drawer.getByRole("button", { name: /^5번 문장/ }).click();
  await expect(progress).toHaveAttribute("aria-valuenow", "4");
  await expect(progress).toHaveAttribute("aria-valuemax", "10");
  await expect.poll(animation).not.toBe("none");
  const transforms = await indicator.evaluate(element => {
    const shine = element.getAnimations({ subtree: true }).find(animation => "animationName" in animation);
    if (!shine) throw new Error("No reflection animation");
    shine.pause();
    shine.currentTime = 100;
    const before = getComputedStyle(element, "::after").transform;
    shine.currentTime = 1500;
    return { before, after: getComputedStyle(element, "::after").transform };
  });
  expect(transforms.before).not.toBe(transforms.after);
  await expect(progress).toHaveCSS("overflow", "hidden");
  await expect(indicator).toHaveCSS("overflow", "hidden");
  await page.screenshot({ path: info.outputPath("player-progress-reflection.png"), scale: "css" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(animation).toBe("none");
  // Seed one completion in this isolated browser fixture so neither zero progress
  // nor reduced-motion preferences can mask an accidentally global shimmer.
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    const journal = JSON.parse(localStorage.getItem("meta-shadowing:learning:v1")!);
    if (!journal.progress) throw new Error("Expected the selected phrase to be saved");
    journal.history = [{ ...journal.progress, completedAt: "2026-09-08T00:00:00Z" }];
    journal.progress = null;
    localStorage.setItem("meta-shadowing:learning:v1", JSON.stringify(journal));
  });
  await page.goto("/lessons/daily-conversation/stages?stage=1");
  const stageProgress = page.getByRole("progressbar");
  await expect(stageProgress).toHaveAttribute("aria-valuenow", "1");
  const generic = stageProgress.locator('[data-slot="progress-indicator"]');
  expect(await generic.evaluate(element => getComputedStyle(element, "::after").animationName)).toBe("none");
  expect(await generic.evaluate(element => getComputedStyle(element, "::after").content)).toBe("none");
});
