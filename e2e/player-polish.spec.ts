import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

async function openPlayer(page: Page, level = 1) {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=morning-routine&level=${level}&mode=manual`);
  await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
}

test("the simplified entry page keeps password entry working", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("엄선된 문장으로,여덟 번 다르게.");
  await expect(page.getByText("헤드폰을 끼고 오늘의 레슨을 시작하세요.", { exact: true })).toHaveCount(0);
  await expect(page.getByText("개인 학습 자료를 위한 비공개 베타", { exact: true })).toHaveCount(0);
  await page.getByLabel("베타 비밀번호", { exact: true }).fill("test-beta-password");
  await page.getByRole("button", { name: "입장하기", exact: true }).click();
  await expect(page).toHaveURL(/\/languages$/);
});

for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) test(`level ${level} settings open inside the drawer without removing the lesson`, async ({ page }) => {
  await openPlayer(page, level);
  const gear = page.getByRole("button", { name: "학습 메뉴", exact: true });
  const canvas = page.getByRole("region", { name: level <= 5 ? "학습 자막" : "속사포 학습", exact: true });
  const copy = await canvas.textContent();
  await gear.click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "세션 설정", exact: true });
  await expect(dialog).toBeVisible();
  // Modal content is accessible; the retained background is deliberately inert.
  await expect(page.locator(level <= 5 ? "#practice-subtitles" : '[aria-label="속사포 학습"]')).toHaveText(copy!);
  await expect(dialog).toHaveAttribute("data-state", "open");
  await expect(dialog.getByRole("radio", { name: "수동", exact: true })).toHaveAttribute("aria-checked", "true");
  const speed = dialog.getByRole("combobox", { name: level <= 5 ? "재생속도" : "단어 속도", exact: true });
  await speed.selectOption(level <= 5 ? "1.5" : "6");
  const back = dialog.getByRole("button", { name: "메뉴로 돌아가기", exact: true });
  await back.focus();
  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Tab");
  await expect(back).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(gear).toBeFocused();
  await expect(canvas).toHaveText(copy!);
  await gear.click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(speed).toHaveValue(level <= 5 ? "1.5" : "6");
  await page.keyboard.press("Escape");
  await expect(gear).toBeFocused();
  if (level <= 5) {
    await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
    await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  }
});

test("settings restore focus to the menu button even when pointer activation does not focus it", async ({ page }) => {
  await openPlayer(page);
  const gear = page.getByRole("button", { name: "학습 메뉴", exact: true });
  await page.getByRole("region", { name: "학습 자막", exact: true }).focus();
  // Reproduce browsers that leave focus on the prior element when clicking a button.
  await gear.evaluate(button => button.addEventListener("mousedown", event => event.preventDefault()));
  await gear.click();
  await page.getByRole("button", { name: "학습 설정", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "세션 설정", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(gear).toBeFocused();
});

for (const reducedMotion of ["no-preference", "reduce"] as const) test(`the extra-cycle reveal respects ${reducedMotion} motion preference`, async ({ page }) => {
  await page.emulateMedia({ reducedMotion });
  await openPlayer(page);
  const cycles = page.getByLabel("완료한 듣기");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page);
    await expect(cycles).toHaveText(`필수 ${cycle} / 3`);
  }
  await page.locator("audio").evaluate(audio => {
    audio.addEventListener("playing", () => (audio as HTMLAudioElement).pause(), { once: true });
  });
  await page.getByRole("button", { name: /^REPEAT/ }).click();
  await expect(cycles.locator("[data-complete]")).toHaveCount(5);
  const motion = await cycles.evaluate(el => {
    const animations = el.getAnimations({ subtree: true });
    animations.forEach(animation => animation.pause());
    const sample = (time: number) => {
      animations.forEach(animation => { animation.currentTime = time; });
      return [...el.querySelectorAll("i")].map(dot => ({ opacity: Number(getComputedStyle(dot).opacity), x: dot.getBoundingClientRect().x }));
    };
    const early = sample(110), late = sample(600);
    const details = animations.map(animation => ({
      property: animation instanceof CSSTransition ? animation.transitionProperty : "animation",
      timing: animation.effect?.getTiming(),
      target: (animation.effect as KeyframeEffect | null)?.target instanceof Element
        ? ((animation.effect as KeyframeEffect).target as Element).outerHTML : null
    }));
    return { count: animations.length, early, late, details };
  });
  if (reducedMotion === "reduce") expect(motion.count, JSON.stringify(motion.details)).toBe(0);
  else {
    expect(motion.count).toBeGreaterThan(0);
    expect(motion.early[3].opacity).toBeGreaterThan(motion.early[4].opacity);
    expect(motion.early[2].x).toBeGreaterThan(motion.late[2].x);
  }
  expect(motion.late.map(dot => dot.opacity)).toEqual([1, 1, 1, 1, 1]);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 0 / 2");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await confirmManualListen(page);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 1 / 2");
});
