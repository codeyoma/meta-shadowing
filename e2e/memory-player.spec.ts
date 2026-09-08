import { expect, test, type Page } from "@playwright/test";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen, waitForManualListen } from "./fixtures/manual-practice";

async function openPlayer(page: Page, level: number, lesson = "morning-routine", query = "") {
  await page.route("**/api/lessons/*/audio/*", (route) => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=${lesson}&level=${level}${query}`);
  await page.waitForLoadState("networkidle");
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
  await waitForManualListen(page);
  await expect(cycles).toHaveText("필수 0 / 3");
  if (isMobile) await reveal.tap(); else await reveal.click();
  await expect(subtitles.getByText("나는 일곱 시에 일어난다.", { exact: true })).toBeVisible();
  await confirmManualListen(page, "keyboard");
  await expect(reveal).toHaveAttribute("aria-expanded", "false");
  await expect(cycles).toHaveText("필수 1 / 3");
  await waitForManualListen(page);
  await page.keyboard.press("r");
  await page.keyboard.press("R");
  await waitForManualListen(page);
  await expect(cycles).toHaveText("필수 1 / 3");
  await expect(page.locator("audio")).toHaveJSProperty("ended", true);
  await confirmManualListen(page, "keyboard");
  await expect(cycles).toHaveText("필수 2 / 3");
  await confirmManualListen(page, "keyboard");
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
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await openPlayer(page, 2, "morning-routine", "&mode=automatic&speed=0.5");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  const subtitles = page.getByRole("region", { name: "학습 자막" });
  await expect(subtitles.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await expect(subtitles.getByText("나는 일곱 시에 일어난다.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "메타쉐도잉 레벨 2", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "학습 방법", exact: true }).getByRole("tabpanel")).toContainText("자막을 보며 따라 말하고, 눈을 감고 한 번 더 말하세요.");
  await page.getByRole("dialog").getByRole("button", { name: "닫기", exact: true }).click();
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  // The 0.357-second recording at 0.5x allows about 2.36s for Level 2, versus 1.39s for Level 1.
  await expect(page.getByRole("timer")).toHaveText("2.4초");
  await page.clock.runFor(2000);
  await expect(page.getByRole("timer")).toHaveText("0.4초");
  await expect(subtitles.getByText("I wake up at seven.", { exact: true })).toBeVisible();
  await page.keyboard.press("s");
  await expect(subtitles.getByText("나는 일곱 시에 일어난다.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await page.clock.runFor(400);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
});

test("Japanese hints preserve supplied spaces and segment an unspaced phrase after advancing", async ({ page, isMobile }) => {
  await openPlayer(page, 3, "tokyo-walk");
  const subtitles = page.getByRole("region", { name: "학습 자막" });
  await expect(subtitles.getByText("私は", { exact: true })).toBeVisible();
  await expect(subtitles.getByText("나는", { exact: true })).toBeVisible();
  const activate = async (button: ReturnType<Page["getByRole"]>) => isMobile ? button.tap() : button.click();
  await activate(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }));
  for (let cycle = 1; cycle <= 3; cycle++) {
    await confirmManualListen(page, isMobile ? "touch" : "click");
    await expect(page.getByLabel("완료한 듣기")).toHaveText(`필수 ${cycle} / 3`);
  }
  await activate(page.getByRole("button", { name: "NEXT · 다음 프레이즈", exact: true }));
  await expect(subtitles.getByText("顔", { exact: true })).toBeVisible();
  await activate(page.getByRole("button", { name: "자막 보기", exact: true }));
  await expect(subtitles.getByText("顔を洗います。", { exact: true })).toBeVisible();
  await expect(subtitles.getByText("나는 세수를 한다.", { exact: true })).toBeVisible();
  await activate(page.getByRole("button", { name: "학습 메뉴", exact: true }));
  await activate(page.getByRole("button", { name: "문장 목록", exact: true }));
  await activate(page.getByRole("dialog", { name: "문장 목록", exact: true }).getByRole("button", { name: /^1번 문장/ }));
  await expect(subtitles.getByText("私は", { exact: true })).toBeVisible();
});

test("short mobile screens expose subtitle and practice actions above the dock without scrolling", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Short-screen layout uses the mobile viewport.");
  await openPlayer(page, 3);
  await expect(page.getByRole("region", { name: "학습 자막" }).getByText("I", { exact: true })).toBeVisible();
  const actions = await page.getByRole("button", { name: "자막 보기", exact: true }).boundingBox();
  const dock = await page.getByRole("group", { name: "학습 진행", exact: true }).boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(dock!.y);
  // Inline dictionary words inherit subtitle typography; the full touch-target
  // contract applies to the standalone player controls around the subtitle.
  for (const button of await page.locator("main button:not([data-dictionary-word])").all()) {
    const box = await button.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(44);
  }
});
