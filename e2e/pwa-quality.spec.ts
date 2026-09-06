import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";

test("the online-only install manifest and all home-screen icons work without learner access", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ id: "/", scope: "/", start_url: "/", display: "standalone", background_color: "#0d1216" });
  expect(manifest.description).toContain("온라인");
  for (const size of [192, 512]) {
    const icon = manifest.icons.find((icon: { sizes: string }) => icon.sizes === `${size}x${size}`);
    expect(icon.type).toBe("image/png");
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    const png = await response.body();
    expect(png.subarray(1, 4).toString()).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(size);
    expect(png.readUInt32BE(20)).toBe(size);
  }
  await page.goto("/");
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  const applePng = await (await request.get(appleIcon!)).body();
  expect(applePng.readUInt32BE(16)).toBe(180);
  await page.getByText("설치 및 온라인 이용 안내", { exact: true }).click();
  await expect(page.getByText("학습에는 인터넷 연결이 필요합니다. 레슨과 음성은 오프라인 저장하지 않습니다.", { exact: true })).toBeVisible();
  await expect(page.getByText(/iPhone.*Safari/)).toBeVisible();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

test("setup exposes large touch targets, visible keyboard focus and a legible selected level", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/setup?lesson=morning-routine");
  await page.getByRole("button", { name: /1 자막 쉐도잉/ }).waitFor();
  for (const button of await page.getByRole("main").getByRole("button").all()) {
    const box = await button.boundingBox();
    if (box) expect(Math.min(box.width, box.height), await button.innerText()).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "레슨", exact: true }).focus();
  await expect(page.getByRole("button", { name: "레슨", exact: true })).toHaveCSS("outline-style", "solid");
  await expect(page.getByRole("button", { name: /1 자막 쉐도잉/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /3 첫 단어 힌트/ }).click();
  await expect(page.getByRole("button", { name: /1 자막 쉐도잉/ })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("button", { name: /3 첫 단어 힌트/ })).toHaveAttribute("aria-pressed", "true");
  const contrast = await page.locator(".level-row.selected > span").evaluate(element => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const fg = luminance(getComputedStyle(element).color);
    const bg = luminance(getComputedStyle(element.parentElement!).backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.getByRole("button", { name: "레슨", exact: true }).click();
  await expect(page.getByRole("button", { name: /English 영어/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /日本語 일본어/ }).click();
  await expect(page.getByRole("button", { name: /日本語 일본어/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: /English 영어/ })).toHaveAttribute("aria-pressed", "false");
});

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) test(`a ${viewport.width} by ${viewport.height} phone never covers practice actions with its playback dock`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=3");
  await page.getByRole("button", { name: "첫 원음 듣기", exact: true }).click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await page.evaluate(() => window.scrollTo(0, 0));
  const actions = await page.locator(".player-actions").boundingBox();
  const dock = await page.getByRole("navigation", { name: "재생 제어" }).boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(dock!.y);
  await page.getByRole("button", { name: "다음 원음 듣기", exact: true }).click();
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 2 / 3");
});

test("administrator header navigation has touch-sized targets and visible keyboard focus", async ({ page }) => {
  await page.goto("/admin");
  await page.getByLabel("이메일").fill("admin@example.com");
  await page.getByRole("button", { name: "로그인 코드 받기" }).click();
  await page.getByLabel("인증 코드").fill("123456");
  await page.getByRole("button", { name: "확인하고 계속" }).click();
  for (const name of ["레슨 관리", "전역 학습 기본값"]) {
    const link = page.getByRole("link", { name, exact: true });
    await expect(link).toBeVisible();
    const box = await link.boundingBox();
    expect(Math.min(box!.width, box!.height)).toBeGreaterThanOrEqual(44);
    await link.focus();
    await expect(link).toHaveCSS("outline-style", "solid");
  }
  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page.getByRole("heading", { name: "관리자 로그인" })).toBeVisible();
});

test("overflowing bilingual subtitles are an explicit keyboard stop and scroll without advancing practice", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=daily-conversation&level=5&group=4");
  await page.getByRole("button", { name: "자막 보기", exact: true }).click();
  const canvas = page.getByRole("region", { name: "학습 자막", exact: true });
  await expect(canvas).toHaveAttribute("tabindex", "0");
  await page.getByRole("button", { name: "학습 설정", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveCSS("outline-style", "solid");
  expect(await canvas.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.keyboard.press("PageDown");
  await expect.poll(() => canvas.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "true");

  await page.goto("/player?lesson=morning-routine&level=8&display=cumulative");
  const rapid = page.getByRole("region", { name: "속사포 학습" });
  await expect(rapid).toHaveAttribute("tabindex", "0");
  await page.getByRole("button", { name: "학습 설정", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(rapid).toBeFocused();
  await expect(rapid).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "문장 시작", exact: true })).toBeVisible();
});

test("the native tall player keeps the reference canvas proportions and actions near the dock", async ({ page }) => {
  await page.setViewportSize({ width: 853, height: 1844 });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  for (const level of [3, 8]) {
    await page.goto(`/player?lesson=morning-routine&level=${level}`);
    const canvas = page.locator(".practice-canvas");
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(340);
    expect(box.height).toBeLessThanOrEqual(450);
    const actions = (await page.locator(".player-actions").boundingBox())!;
    const dock = (await page.getByRole("navigation", { name: "재생 제어" }).boundingBox())!;
    expect(dock.y - actions.y - actions.height).toBeGreaterThanOrEqual(16);
    expect(dock.y - actions.y - actions.height).toBeLessThanOrEqual(200);
    expect(actions.y + actions.height).toBeLessThanOrEqual(1844);
  }
});
