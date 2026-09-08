import { expect, test, type Page } from "@playwright/test";
import type { PhraseSyntax, SyntaxToken } from "../src/lib/phrase-syntax";

// Explicit stored-response fixture; live Google parsing is not run by this test.
const token = (content: string, offset: number, lemma: string, tag: string, head: number, label: string, tense?: string): SyntaxToken => ({
  text: { content, beginOffset: offset }, lemma, partOfSpeech: { tag, ...(tense ? { tense } : {}) }, dependencyEdge: { headTokenIndex: head, label }
});
const analysis: PhraseSyntax = { phraseNumber: 1, sentences: [
  { sentenceNumber: 1, beginOffset: 0, text: "I wake up at seven.", language: "en", status: "complete", tokens: [
    token("I", 0, "I", "PRON", 1, "NSUBJ"), token("wake", 2, "wake", "VERB", 1, "ROOT", "PRESENT"),
    token("up", 7, "up", "PRT", 1, "PRT"), token("at", 10, "at", "ADP", 1, "PREP"), token("seven", 13, "seven", "NUM", 3, "POBJ"), token(".", 18, ".", "PUNCT", 1, "P")
  ] },
  { sentenceNumber: 2, beginOffset: 20, text: "I passed.", language: "en", status: "complete", tokens: [
    token("I", 0, "I", "PRON", 1, "NSUBJ"), token("passed", 2, "pass", "VERB", 1, "ROOT", "PAST"), token(".", 8, ".", "PUNCT", 1, "P")
  ] }
] };

function recording() {
  const bytes = 8 * 8000 * 2;
  const wav = Buffer.alloc(44 + bytes);
  wav.write("RIFF", 0); wav.writeUInt32LE(36 + bytes, 4); wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(bytes, 40);
  return wav;
}
async function openPlayer(page: Page, level = 1, lesson = "daily-conversation") {
  await page.route("**/api/lessons/*/audio/*", route => route.fulfill({ contentType: "audio/wav", body: recording() }));
  await page.request.post("/api/auth", { data: { password: "test-beta-password" } });
  await page.goto(`/player?lesson=${lesson}&level=${level}&mode=manual`);
  await expect(page.getByRole("button", { name: "문장 분석", exact: true })).toBeVisible();
}

test("header action reads multiple sentences, pauses audio, explains words, and restores focus", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  let resolve!: () => void;
  const ready = new Promise<void>(done => { resolve = done; });
  await page.route("**/syntax/*?**", async route => { await ready; await route.fulfill({ json: analysis }); });
  await openPlayer(page);
  const trigger = page.getByRole("button", { name: "문장 분석", exact: true });
  const heading = page.getByRole("heading", { name: "At home", exact: true });
  const [buttonBox, headingBox] = await Promise.all([trigger.boundingBox(), heading.boundingBox()]);
  expect(buttonBox!.y + buttonBox!.height).toBeLessThan(headingBox!.y);
  await expect(page.getByLabel("레슨 안내", { exact: true }).getByRole("button", { name: "문장 분석", exact: true })).toBeVisible();
  await expect(trigger).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true }).click();
  await expect.poll(() => page.locator("audio").evaluate(el => !(el as HTMLAudioElement).paused)).toBe(true);
  await trigger.click();
  const popup = page.getByRole("dialog", { name: "문장 분석", exact: true });
  await expect(popup.getByRole("status")).toContainText("저장된 분석을 불러오고 있어요");
  await expect.poll(() => page.locator("audio").evaluate(el => (el as HTMLAudioElement).paused)).toBe(true);
  resolve();
  await expect(popup.getByRole("article")).toHaveCount(2);
  await popup.getByRole("article", { name: "문장 1", exact: true }).getByRole("button", { name: "I 분석 보기", exact: true }).click();
  await expect(popup).toContainText("‘wake’에 ‘주어’ 관계로 연결돼요.");
  const second = popup.getByRole("article", { name: "문장 2", exact: true });
  await second.getByRole("button", { name: "passed 분석 보기", exact: true }).click();
  await expect(second.locator("dd").first()).toHaveText("pass");
  await expect(second).toContainText("과거");
  const box = await popup.boundingBox();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await popup.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const time = await page.locator("audio").evaluate(el => (el as HTMLAudioElement).currentTime);
  await popup.focus();
  for (const key of ["r", "s", "ArrowRight", "Space"]) await page.keyboard.press(key);
  expect(await page.locator("audio").evaluate(el => (el as HTMLAudioElement).currentTime)).toBe(time);
  await page.keyboard.press("Escape");
  await expect(popup).toHaveCount(0); await expect(trigger).toBeFocused();
  await expect(page.getByRole("button", { name: "CONTINUE · 계속 재생", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("missing analysis and failed reads are distinguishable, and retry reloads the stored result", async ({ page }) => {
  let fail = true;
  await page.route("**/syntax/*?**", route => route.fulfill(fail ? { status: 503, json: { error: "syntax-unavailable" } } : { json: { phraseNumber: 1, sentences: [] } }));
  await openPlayer(page);
  await page.getByRole("button", { name: "문장 분석", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "문장 분석", exact: true });
  await expect(popup.getByRole("alert")).toContainText("분석을 불러오지 못했어요");
  fail = false;
  await popup.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(popup.getByRole("status")).toContainText("저장된 분석이 없어요");
  await popup.getByRole("button", { name: "문장 분석 닫기", exact: true }).click();
  await expect(popup).toHaveCount(0);
});

test("hint levels require revealing subtitles before showing full analysis", async ({ page }) => {
  let calls = 0;
  await page.route("**/syntax/*?**", route => { calls++; return route.fulfill({ json: analysis }); });
  await openPlayer(page, 3, "morning-routine");
  const trigger = page.getByRole("button", { name: "문장 분석", exact: true });
  await expect(trigger).toBeDisabled();
  await expect(page.locator('#practice-subtitles [lang="en"]')).toHaveText("I");
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "자막 보기", exact: true }).click();
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "문장 분석", exact: true })).toContainText("I wake up at seven.");
});

test("changing the practice phrase requests its own analysis, including when there is no section heading", async ({ page }) => {
  const phrases: number[] = [];
  await page.route("**/syntax/*?**", route => {
    const phraseNumber = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    phrases.push(phraseNumber);
    return route.fulfill({ json: { phraseNumber, sentences: [] } });
  });
  await openPlayer(page, 1, "morning-routine");
  await page.getByRole("button", { name: "학습 메뉴", exact: true }).click();
  await page.getByRole("button", { name: "문장 목록", exact: true }).click();
  await page.getByRole("button", { name: /^2번 문장 ·/ }).click();
  await expect(page.locator('#practice-subtitles [lang="en"]')).toHaveText("I wash my face.");
  await page.getByRole("button", { name: "문장 분석", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "문장 분석", exact: true });
  await expect(popup).toContainText("2번 프레이즈");
  await expect(popup.getByRole("status")).toContainText("저장된 분석이 없어요");
  expect(phrases.length).toBeGreaterThan(0); expect(phrases.every(number => number === 2)).toBe(true);
});

test("rapid playback freezes while analysis is open", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-06T00:00:00Z") });
  await page.route("**/syntax/*?**", route => route.fulfill({ json: analysis }));
  await openPlayer(page, 6, "morning-routine");
  await page.clock.pauseAt(new Date("2026-09-06T00:01:00Z"));
  const canvas = page.getByRole("region", { name: "속사포 학습", exact: true });
  await page.getByRole("button", { name: "CONTINUE · 문장 시작", exact: true }).click();
  await page.clock.runFor(300); await expect(canvas).toHaveText("wake");
  await page.getByRole("button", { name: "문장 분석", exact: true }).click();
  const popup = page.getByRole("dialog", { name: "문장 분석", exact: true });
  await expect(popup.getByRole("article")).toHaveCount(2);
  await popup.focus(); await page.keyboard.press("Space"); await page.clock.runFor(5000);
  await expect(page.locator('[aria-label="속사포 학습"]')).toHaveText("wake");
  await page.keyboard.press("Escape"); await page.clock.runFor(1);
  await expect(page.getByRole("button", { name: "문장 분석", exact: true })).toBeFocused();
});
