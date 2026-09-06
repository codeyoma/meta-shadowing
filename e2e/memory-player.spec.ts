import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

async function openPlayer(page: Page, level: number, lesson = "morning-routine", query = "") {
  await page.route("**/api/lessons/*/audio/*", (route) => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=${lesson}&level=${level}${query}`);
}

test("level 3 reveals both subtitles with S or touch and resets them on the next cycle and phrase", async ({ page, isMobile }) => {
  await openPlayer(page, 3);
  const subtitles = page.getByRole("region", { name: "학습 자막" });
  const cycles = page.getByLabel("완료한 듣기");
  await expect(subtitles.getByText("I", { exact: true })).toBeVisible();
  await expect(subtitles.getByText("나는", { exact: true })).toBeVisible();
  const reveal = page.getByRole("button", { name: "자막 보기", exact: true });
  await page.keyboard.press("s");
  await expect(subtitles.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await expect(subtitles.getByText("나는 일곱 시에 일어난다.", { exact: true })).toBeVisible();
  await expect(reveal).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("s");
  await expect(reveal).toHaveAttribute("aria-expanded", "true");

  await page.keyboard.press("Space");
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  await expect(cycles).toHaveText("필수 1 / 3");
  if (isMobile) await reveal.tap(); else await reveal.click();
  await expect(subtitles.getByText("나는 일곱 시에 일어난다.", { exact: true })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  await expect(cycles).toHaveText("필수 2 / 3");
  await page.keyboard.press("r");
  await expect(cycles).toHaveText("필수 3 / 3");
  await page.keyboard.press("s");
  await page.keyboard.press("Space");
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행" })).toHaveAttribute("aria-valuenow", "1");
  await expect(subtitles.getByText("나는", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(subtitles.getByText("I wash my face.", { exact: true })).toBeVisible();
});

test("level 2 keeps full bilingual subtitles and allows two speaking turns without hiding the text", async ({ page }) => {
  await openPlayer(page, 2, "morning-routine", "&mode=automatic&speed=0.5");
  const subtitles = page.getByRole("region", { name: "학습 자막" });
  await expect(subtitles.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await expect(subtitles.getByText("나는 일곱 시에 일어난다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "첫 원음 듣기", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("자막을 보며 말하고, 눈을 감고 한 번 더 말해 보세요.");
  await page.getByRole("button", { name: "재생 또는 일시정지" }).click();
  const remainingSeconds = Number.parseFloat((await page.getByRole("timer").textContent())!);
  // The 0.357-second recording at 0.5x allows about 2.36s for Level 2, versus 1.39s for Level 1.
  expect(remainingSeconds).toBeGreaterThan(1.6);
  expect(remainingSeconds).toBeLessThanOrEqual(2.4);
  await expect(subtitles.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(subtitles.getByText("나는 일곱 시에 일어난다.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("Japanese hints preserve supplied spaces and segment an unspaced phrase after advancing", async ({ page, isMobile }) => {
  await openPlayer(page, 3, "tokyo-walk");
  const subtitles = page.getByRole("region", { name: "학습 자막" });
  await expect(subtitles.getByText("私は", { exact: true })).toBeVisible();
  await expect(subtitles.getByText("나는", { exact: true })).toBeVisible();
  const activate = async (button: ReturnType<Page["getByRole"]>) => isMobile ? button.tap() : button.click();
  for (let cycle = 1; cycle <= 3; cycle++) {
    await activate(page.getByRole("button", { name: cycle === 1 ? "첫 원음 듣기" : "다음 원음 듣기", exact: true }));
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await activate(page.getByRole("button", { name: "다음 프레이즈", exact: true }));
  await expect(subtitles.getByText("顔", { exact: true })).toBeVisible();
  await activate(page.getByRole("button", { name: "자막 보기", exact: true }));
  await expect(subtitles.getByText("顔を洗います。", { exact: true })).toBeVisible();
  await expect(subtitles.getByText("나는 세수를 한다.", { exact: true })).toBeVisible();
  await activate(page.getByRole("button", { name: "이전 ←", exact: true }));
  await expect(subtitles.getByText("私は", { exact: true })).toBeVisible();
});

test("short mobile screens expose subtitle and practice actions above the dock without scrolling", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Short-screen layout uses the mobile viewport.");
  await openPlayer(page, 3);
  await expect(page.getByRole("region", { name: "학습 자막" }).getByText("I", { exact: true })).toBeVisible();
  const actions = await page.locator(".player-actions").boundingBox();
  const dock = await page.getByRole("navigation", { name: "재생 제어" }).boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(dock!.y);
  for (const button of await page.locator(".player-actions button").all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(48);
    expect(box!.width).toBeGreaterThanOrEqual(48);
  }
});
