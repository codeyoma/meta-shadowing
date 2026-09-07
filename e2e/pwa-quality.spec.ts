import { openSelectedStageSettings } from "./fixtures/stage-preview";
import { expect, test } from "@playwright/test";
import { testRecording } from "./fixtures/audio";
import { confirmManualListen } from "./fixtures/manual-practice";

test("empty form fields have a clearly distinguishable boundary on the white canvas", async ({ page }) => {
  async function expectFieldBoundary(selector: string) {
    const contrast = await page.locator(selector).evaluate(element => {
      const style = getComputedStyle(element);
      const luminance = (color: string) => color.match(/[\d.]+/g)!.slice(0, 3)
        .map(Number).map(value => value / 255)
        .map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4)
        .reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
      const border = luminance(style.borderTopColor);
      const canvas = luminance(style.backgroundColor);
      return (Math.max(border, canvas) + .05) / (Math.min(border, canvas) + .05);
    });
    expect(contrast).toBeGreaterThanOrEqual(3);
  }
  await page.goto("/");
  await expectFieldBoundary("#beta-password");
  await page.goto("/admin");
  await expectFieldBoundary("#admin-email");
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/setup?lesson=morning-routine");
  await openSelectedStageSettings(page);
  await expectFieldBoundary('#session-options [data-slot="native-select"]');
});

test("the online-only install manifest and all home-screen icons work without learner access", async ({ page, request }) => {
  const manifestResponse = await request.get("/manifest.webmanifest");
  expect(manifestResponse.ok()).toBe(true);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({ id: "/", scope: "/", start_url: "/", display: "standalone", background_color: "#ffffff" });
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
  await page.getByRole("radio", { name: /1 자막 쉐도잉/ }).waitFor();
  for (const button of await page.getByRole("main").getByRole("button").or(page.getByRole("main").getByRole("radio")).all()) {
    const box = await button.boundingBox();
    if (box) expect(Math.min(box.width, box.height), await button.innerText()).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true }).focus();
  await expect(page.getByRole("button", { name: "현재 스테이지 1 시작", exact: true })).toHaveCSS("box-shadow", /rgb\(4, 44, 96\)/);
  await expect(page.getByRole("radio", { name: /1 자막 쉐도잉/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: /5 첫 단어 힌트/ }).click();
  await expect(page.getByRole("radio", { name: /1 자막 쉐도잉/ })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("radio", { name: /5 첫 단어 힌트/ })).toHaveAttribute("aria-checked", "true");
  // The user explicitly chose white-on-primary numbers. Keep the method label's
  // AA contrast check; its transparent row inherits the page's white canvas.
  const contrast = await page.getByRole("radio", { name: /5 첫 단어 힌트/ }).locator("strong").evaluate(element => {
    const luminance = (color: string) => {
      const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(value => {
        const channel = Number(value) / 255;
        return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const fg = luminance(getComputedStyle(element).color);
    const bg = luminance(getComputedStyle(document.body).backgroundColor);
    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "하단 탐색" }).getByRole("link", { name: "레슨", exact: true }).click();
  await expect(page.getByRole("radio", { name: /English 영어/ })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: /日本語 일본어/ }).click();
  await expect(page.getByRole("radio", { name: /日本語 일본어/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /English 영어/ })).toHaveAttribute("aria-checked", "false");
});

for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 844 }]) test(`a ${viewport.width} by ${viewport.height} phone never covers practice actions with its playback dock`, async ({ page }) => {
  await page.setViewportSize(viewport);
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto("/player?lesson=morning-routine&level=3");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await confirmManualListen(page);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 1 / 3");
  await page.evaluate(() => window.scrollTo(0, 0));
  const actions = await page.getByRole("button", { name: "자막 보기", exact: true }).boundingBox();
  const dock = await page.getByRole("group", { name: "학습 진행", exact: true }).boundingBox();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(dock!.y);
  await confirmManualListen(page);
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
    await expect(link).toHaveCSS("box-shadow", /rgb\(4, 44, 96\)/);
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
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 5", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^재생 모드 및 속도/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(canvas).toBeFocused();
  await expect(canvas).toHaveCSS("outline-style", "solid");
  expect(await canvas.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.keyboard.press("PageDown");
  await expect.poll(() => canvas.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  await expect(page.getByLabel("완료한 듣기")).toHaveText("필수 0 / 3");
  await expect(page.getByRole("progressbar", { name: "묶음 진행" })).toHaveAttribute("aria-valuenow", "0");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Tab");
  await expect(canvas.getByRole("button", { name: /뜻 보기$/ }).first()).toBeFocused();
  await canvas.getByRole("button", { name: /뜻 보기$/ }).last().focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "재생 또는 일시정지", exact: true })).toBeFocused();

  await page.goto("/player?lesson=morning-routine&level=8&display=cumulative");
  const rapid = page.getByRole("region", { name: "속사포 학습" });
  await expect(rapid).toHaveAttribute("tabindex", "0");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "메타쉐도잉 레벨 8", exact: true })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: /^재생 모드 및 속도/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(rapid).toBeFocused();
  await expect(rapid).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true })).toBeVisible();
});

test("a tall player keeps a compact canvas and a bottom-aligned action", async ({ page }) => {
  await page.setViewportSize({ width: 853, height: 1844 });
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/webm", body: testRecording }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  for (const level of [3, 8]) {
    await page.goto(`/player?lesson=morning-routine&level=${level}`);
    const canvas = page.getByRole("region", { name: level === 3 ? "학습 자막" : "속사포 학습" });
    await expect(canvas).toBeVisible();
    const box = (await canvas.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(104);
    expect(box.height).toBeLessThanOrEqual(280);
    const actions = (await page.getByRole("group", { name: "학습 진행", exact: true }).boundingBox())!;
    expect(box.y + box.height).toBeLessThan(actions.y);
    expect(1844 - actions.y - actions.height).toBeLessThanOrEqual(32);
    expect(actions.y + actions.height).toBeLessThanOrEqual(1844);
  }
});
