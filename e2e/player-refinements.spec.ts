import { expect, test, type Page } from "@playwright/test";
import { startSelectedStage } from "./fixtures/stage-preview";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";

// Real PCM audio with known duration, so progress assertions exercise browser media.
const wav = Buffer.alloc(44 + 8_000 * 2 * 2);
wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(16_000, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
wav.write("data", 36); wav.writeUInt32LE(wav.length - 44, 40);

async function login(page: Page) {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
}

for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) test(`level ${level} keeps top-bar progress above the title and help trigger`, async ({ page }) => {
  await login(page);
  await page.goto(`/player?lesson=morning-routine&level=${level}`);
  const context = page.getByLabel("레슨 안내", { exact: true });
  const book = context.getByText("Morning Routine", { exact: true });
  const guidance = context.getByRole("button", { name: `메타쉐도잉 레벨 ${level}`, exact: true });
  const progress = page.locator("main > header").getByRole("progressbar");
  await expect(progress).toHaveCount(1);
  for (const width of [320, 583, 1066]) {
    await page.setViewportSize({ width, height: 788 });
    const titleBox = (await book.boundingBox())!;
    await expect(guidance).toBeVisible();
    const progressBox = (await progress.boundingBox())!;
    expect(progressBox.y + progressBox.height).toBeLessThanOrEqual(titleBox.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("the speaker outline and border appear only during real playback while keyboard focus stays visible", async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/wav", body: wav }));
  await login(page);
  await page.goto("/player?lesson=morning-routine&level=1");
  const ring = page.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  await expect(ring).toHaveCount(0);
  const speaker = page.getByRole("button", { name: "재생 또는 일시정지", exact: true });
  await expect(speaker).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await page.keyboard.press("Tab");
  await speaker.focus();
  expect(await speaker.evaluate(element => element.matches(":focus-visible"))).toBe(true);
  await expect(speaker).not.toHaveCSS("box-shadow", "none");
  await speaker.click();
  await expect.poll(async () => Number(await ring.getAttribute("aria-valuenow"))).toBeGreaterThan(10);
  const ringBox = (await ring.boundingBox())!;
  const buttonBox = (await speaker.boundingBox())!;
  expect(Math.abs(ringBox.width - buttonBox.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(ringBox.height - buttonBox.height)).toBeLessThanOrEqual(2);
  await speaker.click();
  await expect(ring).toHaveCount(0);
  await expect(speaker).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  const paused = await page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).currentTime);
  expect(paused).toBeGreaterThan(0);
  expect(paused).toBeLessThan(2);
  // Native media time stays still while the hidden outline is paused.
  await page.waitForTimeout(300);
  expect(await page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).currentTime)).toBeCloseTo(paused, 2);
  await speaker.click();
  await expect(ring).toBeVisible();
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(ring).toHaveCount(0);
  await expect(speaker).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await speaker.click();
  await expect.poll(async () => Number(await ring.getAttribute("aria-valuenow"))).toBeLessThan(30);
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 2 / 3");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3");
  await page.keyboard.press("r");
  await expect.poll(async () => Number(await ring.getAttribute("aria-valuenow"))).toBeLessThan(30);
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 2 / 2");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("region", { name: "학습 자막" })).toContainText("I wash my face.");
  await expect(ring).toHaveCount(0);
  await expect(speaker).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
});

test("unknown-duration audio never invents a percentage and still reaches completion", async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await login(page);
  await page.goto("/player?lesson=morning-routine&level=1&speed=0.5");
  const ring = page.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  await expect(ring).toHaveCount(0);
  // Chrome can discover this WebM's duration during preload. Control only the
  // metadata boundary; native decoding, playback, and ended events remain real.
  await page.locator("audio").evaluate(audio => {
    Object.defineProperty(audio, "duration", { configurable: true, get: () => Infinity });
    audio.dispatchEvent(new Event("durationchange"));
  });
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await expect(ring).toBeVisible();
  await expect(ring).not.toHaveAttribute("aria-valuenow");
  await waitForManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(ring).toHaveCount(0);
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("grouped listening hides the outline in each gap and resets it for the next recording", async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/wav", body: wav }));
  await login(page);
  await page.goto("/player?lesson=morning-routine&level=4&group=3&groupGap=0.5");
  const ring = page.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  for (const index of [0, 1, 2]) {
    await expect(phrases.nth(index)).toHaveAttribute("aria-current", "true");
    await expect.poll(async () => Number(await ring.getAttribute("aria-valuenow"))).toBeLessThan(35);
    await expect.poll(() => page.locator("audio").evaluate(audio => (audio as HTMLAudioElement).ended), { intervals: [50] }).toBe(true);
    await expect(ring).toHaveCount(0);
  }
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("session preferences page preserves grouped and rapid options before starting through the stage preview", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page);
  await page.goto("/setup?lesson=morning-routine");
  const options = page.locator('[data-slot="popover-content"][data-state="open"]').getByRole("button", { name: "세션 설정", exact: true });
  await expect(options).toHaveCount(0);
  await expect(page.getByRole("combobox")).toHaveCount(0);
  const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  const metadata = (await page.getByText("3개 프레이즈", { exact: true }).boundingBox())!;
  const nav = (await page.getByRole("navigation", { name: "상단 탐색", exact: true }).boundingBox())!;
  expect(title.y).toBeGreaterThan(nav.y + nav.height);
  expect(metadata.y).toBeGreaterThanOrEqual(title.y + title.height);
  await page.getByRole("radio", { name: /7 다문장 암기/ }).click();
  await options.click();
  await expect(page.getByRole("heading", { name: "세션 설정", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("묶음 크기").selectOption("4");
  await page.getByRole("combobox", { name: "재생속도", exact: true }).selectOption("1.5");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await page.getByRole("radio", { name: /7 다문장 암기/, checked: true }).click();
  await options.click();
  await expect(page.getByLabel("묶음 크기")).toHaveValue("4");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await page.getByRole("radio", { name: /13 속사포 한영/ }).click();
  await options.click();
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await page.getByLabel("말하기 추가 시간 (초)").fill("1.5");
  await page.getByRole("combobox", { name: "단어 속도", exact: true }).selectOption("6");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/lessons\/morning-routine\/stages/);
  await page.reload();
  await page.getByRole("radio", { name: /13 속사포 한영/ }).click();
  await options.click();
  await expect(page.getByLabel("말하기 추가 시간 (초)")).toHaveValue("1.5");
  await expect(page.getByRole("combobox", { name: "단어 속도", exact: true })).toHaveValue("6");
  await page.getByRole("link", { name: "스테이지로 돌아가기" }).click();
  await expect(page).toHaveURL(/\/lessons\/morning-routine\/stages/);
  await startSelectedStage(page);
  await expect(page).toHaveURL(/level=7/);
  await expect(page).toHaveURL(/wpm=6/);
});

test("drawer views have no Close actions and Home returns home through the menu", async ({ page }) => {
  await login(page);
  await page.goto("/player?lesson=morning-routine&level=1");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  const home = page.getByRole("button", { name: "첫 화면으로", exact: true });
  await expect(page.getByRole("dialog").getByRole("button", { name: /닫기/ })).toHaveCount(0);
  await page.getByRole("button", { name: "메뉴로 돌아가기", exact: true }).click();
  await home.click();
  await expect(page).toHaveURL(/\/languages$/);
});
