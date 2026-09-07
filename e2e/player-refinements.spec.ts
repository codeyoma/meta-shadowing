import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

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

for (const level of [1, 2, 3, 4, 5, 6, 7, 8]) test(`level ${level} keeps title, instruction, and lesson progress in reading order`, async ({ page }) => {
  await login(page);
  await page.goto(`/player?lesson=morning-routine&level=${level}`);
  const context = page.getByLabel("레슨 안내", { exact: true });
  const book = context.getByText("Morning Routine", { exact: true });
  const guidance = context.getByLabel("학습 방법", { exact: true });
  const progress = context.getByRole("progressbar");
  await expect(progress).toHaveCount(1);
  for (const width of [320, 583, 1066]) {
    await page.setViewportSize({ width, height: 788 });
    const titleBox = (await book.boundingBox())!;
    const instructionBox = (await guidance.boundingBox())!;
    const progressBox = (await progress.boundingBox())!;
    expect(Math.abs(titleBox.x - instructionBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(titleBox.x - progressBox.x)).toBeLessThanOrEqual(1);
    expect(progressBox.y).toBeGreaterThanOrEqual(instructionBox.y + instructionBox.height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test("the speaker outline follows real audio and freezes on pause before resetting for another listen", async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/wav", body: wav }));
  await login(page);
  await page.goto("/player?lesson=morning-routine&level=1");
  const ring = page.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  await expect(ring).toBeVisible();
  const speaker = page.getByRole("button", { name: "재생 또는 일시정지", exact: true });
  await speaker.click();
  await expect.poll(async () => Number(await ring.getAttribute("aria-valuenow"))).toBeGreaterThan(10);
  await speaker.click();
  const paused = Number(await ring.getAttribute("aria-valuenow"));
  expect(paused).toBeGreaterThan(0);
  expect(paused).toBeLessThan(100);
  // Let native media time pass; a visual clock must not advance while paused.
  await page.waitForTimeout(300);
  expect(Number(await ring.getAttribute("aria-valuenow"))).toBeCloseTo(paused, 0);
  await speaker.click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await expect(ring).toHaveAttribute("aria-valuenow", "100");
  await speaker.click();
  await expect.poll(async () => Number(await ring.getAttribute("aria-valuenow"))).toBeLessThan(30);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 2 / 3");
  await speaker.click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3");
  await page.keyboard.press("r");
  await expect.poll(async () => Number(await ring.getAttribute("aria-valuenow"))).toBeLessThan(30);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 1 / 2");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 3 / 3 · 추가 2 / 2");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("region", { name: "학습 자막" })).toContainText("I wash my face.");
  await expect(ring).toHaveAttribute("aria-valuenow", "0");
  const ringBox = (await ring.boundingBox())!;
  const buttonBox = (await speaker.boundingBox())!;
  expect(Math.abs(ringBox.width - buttonBox.width)).toBeLessThanOrEqual(2);
  expect(Math.abs(ringBox.height - buttonBox.height)).toBeLessThanOrEqual(2);
});

test("unknown-duration audio never invents a percentage and still reaches completion", async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await login(page);
  await page.goto("/player?lesson=morning-routine&level=1");
  const ring = page.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  await expect(ring).toBeVisible();
  // Chrome can discover this WebM's duration during preload. Control only the
  // metadata boundary; native decoding, playback, and ended events remain real.
  await page.locator("audio").evaluate(audio => {
    Object.defineProperty(audio, "duration", { configurable: true, get: () => Infinity });
    audio.dispatchEvent(new Event("durationchange"));
  });
  await expect(ring).not.toHaveAttribute("aria-valuenow");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await expect(ring).toHaveAttribute("aria-valuenow", "100");
});

test("grouped listening resets the outline for each recording, not just for the whole cycle", async ({ page }) => {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/wav", body: wav }));
  await login(page);
  await page.goto("/player?lesson=morning-routine&level=4&group=3&groupGap=0.5");
  const ring = page.getByRole("progressbar", { name: "원음 재생 진행", exact: true });
  const phrases = page.getByRole("list", { name: "묶음 프레이즈" }).getByRole("listitem");
  await page.getByRole("button", { name: /^CONTINUE/ }).click();
  for (const index of [0, 1, 2]) {
    await expect(phrases.nth(index)).toHaveAttribute("aria-current", "true");
    await expect.poll(async () => Number(await ring.getAttribute("aria-valuenow"))).toBeLessThan(35);
    // The completed outline is visible only during the 500ms inter-recording gap.
    await expect.poll(() => ring.getAttribute("aria-valuenow"), { intervals: [50] }).toBe("100");
  }
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("setup options protect focus and preserve preferences while leaving only Start below the path", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await login(page);
  await page.goto("/setup?lesson=morning-routine");
  const options = page.getByRole("button", { name: "세션 설정", exact: true });
  await expect(options).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  const title = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
  const metadata = (await page.getByText("3개 프레이즈", { exact: true }).boundingBox())!;
  const back = (await page.getByRole("button", { name: "레슨", exact: true }).boundingBox())!;
  expect(Math.abs(back.y + back.height / 2 - (title.y + metadata.y + metadata.height) / 2)).toBeLessThanOrEqual(2);
  await page.getByRole("button", { name: /4 다문장 암기/ }).click();
  await options.click();
  const dialog = page.getByRole("dialog", { name: "세션 설정", exact: true });
  await expect(dialog).toBeVisible();
  await page.getByLabel("묶음 크기").selectOption("4");
  await page.getByRole("combobox", { name: "재생속도", exact: true }).selectOption("1.5");
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(options).toBeFocused();
  await options.click();
  await expect(page.getByLabel("묶음 크기")).toHaveValue("4");
  await page.getByRole("button", { name: "설정 닫기", exact: true }).click();
  await page.getByRole("button", { name: /7 속사포 한영/ }).click();
  await options.click();
  await page.getByRole("button", { name: "자동", exact: true }).click();
  await page.getByLabel("말하기 추가 시간 (초)").fill("1.5");
  await page.getByRole("combobox", { name: "단어 속도", exact: true }).selectOption("6");
  expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "설정 닫기", exact: true }).focus();
  await page.keyboard.press("Tab");
  expect(await dialog.evaluate(element => element.contains(document.activeElement))).toBe(true);
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "설정 닫기", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await page.reload();
  await page.getByRole("button", { name: /7 속사포 한영/ }).click();
  await options.click();
  await expect(page.getByLabel("말하기 추가 시간 (초)")).toHaveValue("1.5");
  await expect(page.getByRole("combobox", { name: "단어 속도", exact: true })).toHaveValue("6");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await expect(page).toHaveURL(/level=7/);
  await expect(page).toHaveURL(/wpm=6/);
});

test("the bottom Close matches the main primary button and the top Home still returns home", async ({ page }) => {
  await login(page);
  await page.goto("/player?lesson=morning-routine&level=1");
  const primary = await page.getByRole("button", { name: /^CONTINUE/ }).evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, foreground: style.color, border: style.borderTopWidth, radius: style.borderRadius, weight: style.fontWeight, shadow: style.boxShadow };
  });
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  const home = page.getByRole("button", { name: "첫 화면으로", exact: true });
  const close = page.getByRole("button", { name: "문장 목록 닫기", exact: true });
  const colors = await close.evaluate(element => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, foreground: style.color, border: style.borderTopWidth, radius: style.borderRadius, weight: style.fontWeight, shadow: style.boxShadow };
  });
  expect(colors).toEqual(primary);
  await expect(close.locator("svg")).toHaveCSS("color", primary.foreground);
  await home.click();
  await expect(page).toHaveURL(/\/home$/);
});
