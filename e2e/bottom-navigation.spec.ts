import { readServerJournal, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test } from "./fixtures/cloud-ui";

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/home");
});

test("four colored destinations stay fixed and identify the selected section", async ({ page }) => {
  await page.setViewportSize({ width: 430, height: 600 });
  const nav = page.getByRole("navigation", { name: "하단 탐색" });
  await expect(nav.getByRole("link")).toHaveText(["언어", "레슨", "스테이지", "설정"]);
  await expect(nav.getByRole("link", { name: "언어", exact: true })).toHaveAttribute("aria-current", "location");
  await expect(nav.getByRole("link", { name: "언어", exact: true })).toHaveCSS("background-color", "rgb(215, 255, 184)");
  const colors = await nav.locator("a svg").evaluateAll(icons => icons.map(icon => getComputedStyle(icon).color));
  expect(new Set(colors).size).toBe(4);
  const before = await nav.boundingBox();
  await nav.getByRole("link", { name: "레슨", exact: true }).click();
  await expect(nav.getByRole("link", { name: "레슨", exact: true })).toHaveAttribute("aria-current", "location");
  await page.mouse.move(0, 0);
  await expect(nav.getByRole("link", { name: "언어", exact: true })).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(nav.getByRole("link", { name: "레슨", exact: true })).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.getByRole("heading", { name: "영어 레슨", exact: true })).toBeInViewport();
  await page.getByRole("region", { name: "레슨 목록" }).evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await nav.boundingBox()).toEqual(before);
  expect(await page.evaluate(() => scrollY === 0 && document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  const widths = await nav.getByRole("link").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().width));
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  expect(await nav.getByRole("link").first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
});

test("settings opens a list and detail page without starting practice", async ({ page }) => {
  const nav = page.getByRole("navigation", { name: "하단 탐색" });
  await nav.getByRole("link", { name: "스테이지", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000001\/stages/);
  await nav.getByRole("link", { name: "설정", exact: true }).click();
  await expect(page.getByRole("heading", { name: "설정", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "세션 설정", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("재생속도", { exact: true }).selectOption("1.5");
  await page.getByRole("link", { name: "설정 목록으로 돌아가기" }).click();
  await expect(nav.getByRole("link", { name: "설정", exact: true })).toHaveAttribute("aria-current", "location");
  await page.getByRole("link", { name: "세션 설정", exact: true }).click();
  await expect(page.getByLabel("재생속도", { exact: true })).toHaveValue("1.5");
  expect((await readServerJournal(page)).progress).toBeNull();
});

test("each tap dips the whole button then returns, with no independent icon bounce", async ({ page }) => {
  const tab = page.getByRole("navigation", { name: "하단 탐색" }).getByRole("link", { name: "레슨", exact: true });
  const icon = tab.locator("[data-nav-icon]");
  // Capture the real animation's timing at creation. A 220 ms animation can finish
  // between browser round trips under parallel load, so don't inspect it later.
  await tab.evaluate(element => {
    const el = element as HTMLElement;
    const animate = el.animate.bind(el);
    el.animate = (frames, options) => {
      const animation = animate(frames, options);
      el.dataset.animationCalls = String(Number(el.dataset.animationCalls ?? 0) + 1);
      el.dataset.animationTiming = JSON.stringify(animation.effect!.getTiming());
      el.dataset.animationFrames = JSON.stringify((animation.effect as KeyframeEffect).getKeyframes());
      return animation;
    };
  });
  await tab.click();
  await expect(tab).toHaveAttribute("data-animation-calls", "1");
  const timing = JSON.parse((await tab.getAttribute("data-animation-timing"))!);
  expect(timing.duration).toBe(220);
  expect(timing.iterations).toBe(1);
  const frames = JSON.parse((await tab.getAttribute("data-animation-frames"))!) as { transform: string }[];
  expect(frames.map(frame => frame.transform)).toEqual(["translateY(0px)", "translateY(4px)", "translateY(0px)"]);
  expect(await icon.evaluate(el => el.getAnimations().length)).toBe(0);
  await expect.poll(() => tab.evaluate(el => el.getAnimations().length)).toBe(0);
  await tab.click();
  await expect(tab).toHaveAttribute("data-animation-calls", "2");
  await expect.poll(() => tab.evaluate(el => el.getAnimations().length)).toBe(0);
  const rapid = await tab.evaluate(element => {
    const button = element as HTMLElement;
    button.click();
    const previous = button.getAnimations().find(animation => animation.id === "navigation-press")!;
    previous.pause();
    button.click();
    return { previous: previous.playState, active: button.getAnimations().filter(animation => animation.id === "navigation-press").length };
  });
  expect(rapid).toEqual({ previous: "idle", active: 1 });
});

test("reduced motion preserves selection without the spatial bounce", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  const tab = page.getByRole("navigation", { name: "하단 탐색" }).getByRole("link", { name: "레슨", exact: true });
  await tab.focus();
  await page.keyboard.press("Enter");
  await expect(tab).toHaveAttribute("aria-current", "location");
  // Chromium may briefly report an inherited scrollbar-color transition even
  // with reduced motion. The contract is no spatial icon animation.
  expect(await tab.evaluate(el => el.getAnimations({ subtree: true }).filter(animation =>
    (animation.effect as KeyframeEffect).getKeyframes().some(frame => "transform" in frame)
  ).length)).toBe(0);
});

test("practice keeps its existing footer rather than the browsing navigation", async ({ page }) => {
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&mode=manual");
  await expect(page.getByRole("button", { name: /^CONTINUE/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "하단 탐색" })).toHaveCount(0);
});

test("returning to lessons preserves the Japanese lesson context", async ({ page }) => {
  await openLearnerPage(page, "/setup?lesson=10000000-0000-4000-8000-000000000003");
  const nav = page.getByRole("navigation", { name: "하단 탐색" });
  await nav.getByRole("link", { name: "레슨", exact: true }).click();
  await expect(page.getByRole("heading", { name: "일본어 레슨", exact: true })).toBeInViewport();
  await nav.getByRole("link", { name: "스테이지", exact: true }).click();
  await expect(page).toHaveURL(/\/lessons\/10000000-0000-4000-8000-000000000003\/stages/);
});
