import { expect, test, type Page } from "@playwright/test";
import type { DictionaryResponse } from "../src/lib/dictionary";

// Explicit mocked API response. Browser tests verify rendering/interaction,
// not live Kaikki availability or the installed dictionary's word coverage.
const sourceFixture: DictionaryResponse = { word: "wake", entries: [{
  headword: "wake", language: "en", pos: "verb", senses: [{ glosses: ["잠에서 깨다."] }],
  pronunciations: [{ ipa: "/weɪk/" }], sourceUrl: "https://ko.wiktionary.org/wiki/wake", license: "CC BY-SA 4.0"
}] };

// Eight seconds of valid silent PCM keeps a real browser media element playing
// long enough to exercise click-to-pause without replacing the session engine.
function recording() {
  const dataBytes = 8 * 8_000 * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + dataBytes, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8_000, 24); wav.writeUInt32LE(16_000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(dataBytes, 40);
  return wav;
}

async function openPlayer(page: Page, level = 1, lesson = "morning-routine") {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/wav", body: recording() }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=${lesson}&level=${level}`);
  await page.waitForLoadState("networkidle");
}

test("a word pauses media, displays the source fixture, blocks shortcuts, and restores focus", async ({ page }) => {
  let respond!: () => void;
  const responseReady = new Promise<void>(resolve => { respond = resolve; });
  await page.route("**/api/dictionary?**", async route => {
    expect(new URL(route.request().url()).searchParams.get("word")).toBe("wake");
    await responseReady;
    await route.fulfill({ json: sourceFixture });
  });
  await openPlayer(page);
  const subtitles = page.locator("#practice-subtitles");
  const target = subtitles.locator('[lang="en"]');
  await expect(target).toHaveText("I wake up at seven.");
  await expect(subtitles.locator('[lang="ko"] button')).toHaveCount(0);
  const word = page.getByRole("button", { name: "wake 뜻 보기", exact: true });
  await expect(word).toHaveCSS("font-size", await target.evaluate(element => getComputedStyle(element).fontSize));
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate(element => {
    const audio = element as HTMLAudioElement;
    return audio.currentTime > 0 && !audio.paused;
  })).toBe(true);
  await word.click();
  const popup = page.getByRole("dialog", { name: "wake 뜻", exact: true });
  await expect(popup).toBeVisible();
  await expect(popup.getByRole("status")).toHaveText("뜻을 찾고 있어요…");
  await expect.poll(() => page.locator("audio").evaluate(element => (element as HTMLAudioElement).paused)).toBe(true);
  respond();
  await expect(popup).toContainText("잠에서 깨다.");
  await expect(popup.getByRole("link", { name: "위키낱말사전 원문", exact: true })).toHaveAttribute("href", sourceFixture.entries[0].sourceUrl);
  await expect(popup.getByRole("link", { name: "wake 원문 보기 (새 탭)", exact: true })).toHaveAttribute("href", "https://ko.wiktionary.org/wiki/wake");
  await expect(popup.locator('[data-slot="badge"]')).toHaveText(["verb"]);
  await popup.getByRole("button", { name: "출처 및 라이선스", exact: true }).click();
  await expect(popup.getByRole("link", { name: "Kaikki", exact: true })).toBeVisible();
  await expect(popup.getByRole("link", { name: "CC BY-SA 4.0", exact: true })).toBeVisible();
  const pausedTime = await page.locator("audio").evaluate(element => (element as HTMLAudioElement).currentTime);
  await popup.focus();
  for (const key of ["r", "s", "ArrowRight", "Space"]) await page.keyboard.press(key);
  await expect(target).toHaveText("I wake up at seven.");
  expect(await page.locator("audio").evaluate(element => (element as HTMLAudioElement).currentTime)).toBe(pausedTime);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
  await expect(word).toBeFocused();
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  await word.press("Enter");
  await expect(popup).toBeVisible();
  await page.locator('[data-slot="dialog-overlay"]').click({ position: { x: 3, y: 3 } });
  await expect(popup).toHaveCount(0);
  await expect(word).toBeFocused();
});

test("sentence analysis has no background while keeping the dialog action", async ({ page }) => {
  await openPlayer(page);
  const trigger = page.getByRole("button", { name: "문장 분석", exact: true });
  await expect(trigger).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "문장 분석", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
});

test("headword icons open each entry's own source in a new tab without leaving practice", async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  const entries = [sourceFixture.entries[0],
    { ...sourceFixture.entries[0], headword: "waken", matchType: "lemma", sourceUrl: "https://ko.wiktionary.org/w/index.php?title=waken&oldid=12345" },
    { ...sourceFixture.entries[0], pos: "noun", senses: [{ glosses: ["배가 지나간 자국."] }] },
  ];
  await page.route("**/api/dictionary?**", route => route.fulfill({ json: { word: "wake", entries } }));
  // Verify native new-tab navigation without depending on the external site's uptime.
  await context.route("https://ko.wiktionary.org/**", route => route.fulfill({
    contentType: "text/html", body: "<!doctype html><title>Dictionary source fixture</title><p>Source destination test</p>"
  }));
  await openPlayer(page);
  await expect(page).toHaveTitle("Meta Shadowing");
  const playerUrl = page.url();
  const word = page.getByRole("button", { name: "wake 뜻 보기", exact: true });
  await word.click();
  const dialog = page.getByRole("dialog", { name: "wake 뜻", exact: true });
  const headings = dialog.locator("article h3");
  const links = headings.getByRole("link");
  await expect(links).toHaveCount(3);
  await expect(links.nth(0)).toHaveAccessibleName("wake 원문 보기 (새 탭)");
  await expect(links.nth(1)).toHaveAccessibleName("waken 원문 보기 (새 탭)");
  for (const width of [320, 430, 1280]) {
    await page.setViewportSize({ width, height: 932 });
    for (let index = 0; index < 3; index++) {
      // A resize can recenter the dialog between separate browser calls.
      // Compare the word and icon from the same layout frame.
      const { headword, icon } = await headings.nth(index).evaluate(heading => ({
        headword: heading.querySelector('[lang="en"]')!.getBoundingClientRect().toJSON(),
        icon: heading.querySelector("a")!.getBoundingClientRect().toJSON(),
      }));
      expect(icon.x).toBeGreaterThanOrEqual(headword.x + headword.width);
      expect(Math.abs(icon.y + icon.height / 2 - headword.y - headword.height / 2)).toBeLessThan(2);
      expect(icon.width).toBeGreaterThanOrEqual(44);
      expect(icon.height).toBeGreaterThanOrEqual(44);
      await expect(links.nth(index)).toBeInViewport();
    }
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath(`headword-links-${width}.png`), animations: "disabled", scale: "css" });
  }
  const destinations = ["https://ko.wiktionary.org/wiki/wake", "https://ko.wiktionary.org/w/index.php?title=waken&oldid=12345", "https://ko.wiktionary.org/wiki/wake"];
  for (let index = 0; index < destinations.length; index++) {
    await expect(links.nth(index)).toHaveAttribute("rel", "noopener noreferrer");
    const opened = page.waitForEvent("popup");
    if (index === 0) {
      await page.keyboard.press("Tab");
      await links.nth(index).focus();
      expect(await links.nth(index).evaluate(element => element.matches(":focus-visible"))).toBe(true);
      await links.nth(index).press("Enter");
    } else await links.nth(index).click();
    const source = await opened;
    await expect(source).toHaveURL(destinations[index]);
    expect(await source.evaluate(() => window.opener === null)).toBe(true);
    await source.close();
    await page.bringToFront();
    await expect(page).toHaveURL(playerUrl);
    await expect(dialog).toBeVisible();
    await expect(page.locator("audio")).toHaveJSProperty("paused", true);
  }
  await expect(dialog.getByRole("link", { name: "위키낱말사전 원문", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(word).toBeFocused();
  expect(errors).toEqual([]);
});

test("hint-only subtitles stay hidden while the dictionary reports missing entries", async ({ page }) => {
  await page.route("**/api/dictionary?**", route => route.fulfill({ json: { word: "I", entries: [] } }));
  await openPlayer(page, 3);
  const target = page.locator('#practice-subtitles [lang="en"]');
  await expect(target).toHaveText("I");
  await expect(page.locator("#practice-subtitles [data-dictionary-word]")).toHaveCount(1);
  await page.getByRole("button", { name: "I 뜻 보기", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "I 뜻", exact: true });
  await expect(popup.getByRole("status")).toContainText("등록된 한국어 뜻이 없어요.");
  await popup.focus();
  await page.keyboard.press("s");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");
  await expect(target).toHaveText("I");
  await expect(page.getByRole("button", { name: "자막 보기", exact: true })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("progressbar", { name: "프레이즈 진행", exact: true })).toHaveAttribute("aria-valuenow", "0");
});

test("a failed Japanese lookup can retry, with only segmented foreign words interactive", async ({ page }) => {
  const browserErrors: string[] = [];
  page.on("pageerror", error => browserErrors.push(error.message));
  let requests = 0;
  let unavailable = true;
  await page.route("**/api/dictionary?**", route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get("language")).toBe("japanese");
    expect(query.get("word")).toBe("私");
    requests++;
    return route.fulfill(unavailable ? { status: 503, json: { error: "dictionary-unavailable" } } : { json: { word: "私", entries: [] } });
  });
  await openPlayer(page, 1, "tokyo-walk");
  const target = page.locator('#practice-subtitles [lang="ja"]');
  const visibleText = await target.textContent();
  await expect(page.locator('#practice-subtitles [lang="ko"] button')).toHaveCount(0);
  await page.getByRole("button", { name: "私 뜻 보기", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "私 뜻", exact: true });
  await expect(popup.getByRole("alert")).toContainText("뜻을 불러오지 못했어요.");
  unavailable = false;
  await popup.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(popup.getByRole("status")).toContainText("등록된 한국어 뜻이 없어요.");
  await popup.getByRole("button", { name: "사전 닫기", exact: true }).click();
  await expect(target).toHaveText(visibleText!);
  // React development Strict Mode may start and abort an initial request twice.
  expect(requests).toBeGreaterThanOrEqual(2);
  expect(browserErrors).toEqual([]);
});

test("long source entries scroll inside a bounded dialog with contained keyboard focus", async ({ page }) => {
  const fixture = { ...sourceFixture, entries: sourceFixture.entries.map(entry => ({ ...entry,
    senses: Array.from({ length: 32 }, (_, index) => ({ glosses: [`${index + 1}. ${"길이가 긴 사전 정의입니다. ".repeat(8)}`] }))
  })) };
  await page.route("**/api/dictionary?**", route => route.fulfill({ json: fixture }));
  await openPlayer(page);
  await page.getByRole("button", { name: "wake 뜻 보기", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "wake 뜻", exact: true });
  await expect(popup.locator("li")).toHaveCount(32);
  const bounds = await popup.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const body = popup.locator('[aria-busy="false"]');
  expect(await body.evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
  await popup.getByRole("button", { name: "사전 닫기", exact: true }).focus();
  for (let index = 0; index < 8; index++) {
    await page.keyboard.press("Tab");
    expect(await popup.evaluate(element => element.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0);
});

test("rapid foreign words open the dictionary and freeze token timing; Korean stays ordinary text", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await page.route("**/api/dictionary?**", route => route.fulfill({ json: sourceFixture }));
  await openPlayer(page, 6);
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  const canvas = page.getByRole("region", { name: "속사포 학습", exact: true });
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await page.clock.runFor(300);
  await expect(canvas).toHaveText("wake");
  await canvas.getByRole("button", { name: "wake 뜻 보기", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "wake 뜻", exact: true });
  await expect(popup).toContainText("잠에서 깨다.");
  await popup.focus();
  for (const key of ["r", "ArrowRight", "Space"]) await page.keyboard.press(key);
  await page.clock.runFor(5000);
  await expect(page.locator('[aria-label="속사포 학습"]')).toHaveText("wake");
  await page.keyboard.press("Escape");
  // Radix restores focus in its deferred focus-scope cleanup.
  await page.clock.runFor(1);
  await expect(canvas.getByRole("button", { name: "wake 뜻 보기", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true }).click();
  await page.clock.runFor(1200);
  await expect(canvas).toHaveText("나는");
  await expect(canvas.getByRole("button")).toHaveCount(0);
});
