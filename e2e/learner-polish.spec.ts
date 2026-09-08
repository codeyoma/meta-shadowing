import { reloadLearnerPage, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page } from "./fixtures/cloud-ui";
import { timedRecording } from "./fixtures/timed-audio";
import { confirmManualListen } from "./fixtures/manual-practice";

async function openPlayer(page: Page, level = 1) {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/wav", body: timedRecording }));
  await openLearnerPage(page, `/player?lesson=10000000-0000-4000-8000-000000000001&level=${level}&stage=${level * 2}&speed=2`);
  await expect(page.getByRole("heading", { name: `메타쉐도잉 레벨 ${level}`, exact: true })).toBeVisible();
}

test("header controls share raised borderless styling and sizes without a chevron", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  await openPlayer(page);
  await expect(page).toHaveTitle("Meta Shadowing");
  for (const width of [320, 430, 1280]) {
    await page.setViewportSize({ width, height: 932 });
    const controls = page.getByLabel("레슨 안내", { exact: true }).getByRole("button");
    await expect(controls).toHaveCount(3);
    const styles = await controls.evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, font: style.fontSize, shadow: style.boxShadow, border: style.borderColor, clipped: element.scrollWidth > element.clientWidth };
    }));
    expect(new Set(styles.map(style => style.height)).size).toBe(1);
    expect(new Set(styles.map(style => style.font)).size).toBe(1);
    for (const style of styles) {
      expect(style.height).toBeGreaterThanOrEqual(56);
      expect(style.shadow).not.toBe("none");
      expect(style.border).toBe("rgba(0, 0, 0, 0)");
      expect(style.clipped).toBe(false);
    }
    await expect(page.locator("#practice-help-trigger svg")).toHaveCount(0);
    await expect(page.locator("#player-menu-trigger")).not.toHaveCSS("box-shadow", "none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`header-${width}.png`), animations: "disabled", scale: "css" });
  }
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("large learning help previews all eight levels and closes at the viewport bottom", async ({ page }, info) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await openPlayer(page, 3);
  await page.keyboard.press("Space");
  await page.locator("#practice-help-trigger").click();
  const dialog = page.getByRole("dialog", { name: "학습 방법", exact: true });
  await expect(dialog.getByRole("tab")).toHaveCount(8);
  await expect(dialog.getByRole("tab", { name: "Lv 3", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  for (let level = 1; level <= 8; level++) {
    await dialog.getByRole("tab", { name: `Lv ${level}`, exact: true }).click();
    await expect(dialog.getByRole("tabpanel")).toContainText("상세 학습 방법은 준비 중입니다.");
  }
  const panel = dialog.locator('[data-slot="dialog-panel"]');
  expect((await panel.boundingBox())!.height).toBeGreaterThan(450);
  const close = dialog.getByRole("button", { name: "닫기", exact: true });
  expect((await close.boundingBox())!.y).toBeGreaterThan(840);
  await page.screenshot({ path: info.outputPath("learning-help.png"), animations: "disabled", scale: "css" });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#practice-help-trigger")).toBeFocused();
  await expect(page.locator("#practice-help-trigger")).toHaveText("메타쉐도잉 레벨 3");
  await page.locator("#practice-help-trigger").click();
  await expect(dialog.getByRole("tab", { name: "Lv 3", exact: true })).toHaveAttribute("aria-selected", "true");
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(close).toBeInViewport();
  await dialog.getByRole("tab", { name: "Lv 8", exact: true }).click();
  await close.click();
  await expect(dialog).toHaveCount(0);
});

test("R activates only an available REPEAT, never an initial, paused, overlaid, or extra listen", async ({ page }) => {
  await openPlayer(page);
  const audio = page.locator("audio");
  const repeat = page.getByRole("button", { name: "REPEAT · 다시 듣기", exact: true });
  const cycles = page.getByRole("group", { name: "완료한 듣기", exact: true });
  await page.keyboard.press("r");
  await expect(audio).toHaveJSProperty("paused", true);
  await page.keyboard.press("Space");
  await expect.poll(() => audio.evaluate(element => (element as HTMLAudioElement).currentTime)).toBeGreaterThan(.2);
  await page.keyboard.press("Space");
  const pausedTime = await audio.evaluate(element => (element as HTMLAudioElement).currentTime);
  await page.keyboard.press("r");
  await expect(audio).toHaveJSProperty("paused", true);
  await expect(audio).toHaveJSProperty("currentTime", pausedTime);
  await page.keyboard.press("Space");
  for (let cycle = 0; cycle < 3; cycle++) await confirmManualListen(page, "keyboard");
  await expect(repeat).toBeVisible();
  await page.locator("#practice-help-trigger").click();
  await page.keyboard.press("r");
  await expect(audio).toHaveJSProperty("paused", true);
  await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
  await expect(page.locator("#practice-help-trigger")).toBeFocused();
  await page.keyboard.press("Control+r");
  await expect(repeat).toBeVisible();
  await page.keyboard.press("Shift+R");
  await expect(repeat).toHaveCount(0);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 0 / 2");
  await expect(page.getByRole("button", { name: /^PAUSE/ })).toBeVisible();
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("Space");
  await page.keyboard.press("r");
  await expect(audio).toHaveJSProperty("paused", true);
  await page.keyboard.press("Space");
  for (let cycle = 0; cycle < 2; cycle++) await confirmManualListen(page, "keyboard");
  await expect(page.getByRole("button", { name: /^NEXT/ })).toBeVisible();
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/stage=2/);
  await expect(cycles).toHaveText("필수 3 / 3 · 추가 2 / 2");
});

for (const level of [1, 6]) test(`drawer returns level ${level} to its current lesson and stage`, async ({ page }) => {
  await openPlayer(page, level);
  await page.locator("#player-menu-trigger").click();
  await page.getByRole("button", { name: "스테이지 화면으로", exact: true }).click();
  await expect(page).toHaveURL(`/lessons/10000000-0000-4000-8000-000000000001/stages?stage=${level * 2}`);
  await expect(page.getByRole("radio", { name: new RegExp(`^${level * 2} `) })).toBeEnabled();
  await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
});

test("the entire scrolling stage path has one continuous gradient with transparent rows", async ({ page }, info) => {
  await page.setViewportSize({ width: 430, height: 932 });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000001/stages");
  const path = page.getByRole("list", { name: "학습 단계", exact: true });
  await expect(path.getByRole("radio")).toHaveCount(16);
  await expect(path).toHaveCSS("background-image", /linear-gradient/);
  const rows = await path.locator(":scope > li").evaluateAll(elements => elements.map(element => getComputedStyle(element).backgroundColor));
  expect(rows.every(color => color === "rgba(0, 0, 0, 0)")).toBe(true);
  await path.getByRole("radio").nth(4).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("stage-gradient.png"), animations: "disabled", scale: "css" });
});

test("five language choices show country flags and new languages retain truthful empty states", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/languages");
  await expect(page.getByRole("heading", { name: "언어 선택", exact: true })).toBeVisible();
  const list = page.getByRole("region", { name: "언어 목록", exact: true });
  await expect(list.getByRole("link")).toHaveCount(5);
  const languages = [["english", "영어", "🇬🇧"], ["japanese", "일본어", "🇯🇵"], ["chinese", "중국어", "🇨🇳"], ["german", "독일어", "🇩🇪"], ["french", "프랑스어", "🇫🇷"]];
  for (const [id, label, flag] of languages) {
    const link = list.getByRole("link", { name: new RegExp(`^${label} `) });
    await expect(link).toHaveAttribute("href", `/lessons?language=${id}`);
    await expect(link).toContainText(flag);
  }
  for (const width of [320, 430, 1280]) {
    await page.setViewportSize({ width, height: 932 });
    await expect(list.getByRole("link", { name: /^프랑스어 / })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`languages-${width}.png`), animations: "disabled", scale: "css" });
  }
  for (const [id, label] of languages.slice(2)) {
    await list.getByRole("link", { name: new RegExp(`^${label} `) }).click();
    await expect(page.getByRole("heading", { name: `${label} 레슨`, exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "레슨 목록", exact: true }).getByRole("status")).toContainText("아직 게시된 레슨이 없습니다.");
    const navigation = page.getByRole("navigation", { name: "하단 탐색", exact: true });
    await navigation.getByRole("link", { name: "설정", exact: true }).click();
    await reloadLearnerPage(page);
    await navigation.getByRole("link", { name: "레슨", exact: true }).click();
    await expect(page).toHaveURL(`/lessons?language=${id}`);
    await expect(page.getByRole("heading", { name: `${label} 레슨`, exact: true })).toBeVisible();
    await page.getByRole("link", { name: "다른 언어 선택", exact: true }).click();
  }
  expect(errors).toEqual([]);
});
