import { enterAccountPractice, openLearnerPage } from "./fixtures/cloud-navigation";
import { expect, test, type Page, type TestInfo } from "./fixtures/cloud-ui";

type Cue = { notes: { frequency: number; at: number; until: number; ended: boolean }[]; peakGains: number[]; closed: boolean };
declare global { interface Window { stageCues: Cue[] } }

test.beforeEach(async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
});

// Observe the real browser audio device; do not replace synthesis or playback.
async function observeCues(page: Page) {
  await page.addInitScript(() => {
    window.stageCues = [];
    const NativeAudioContext = window.AudioContext;
    window.AudioContext = class extends NativeAudioContext {
      private cue: Cue = { notes: [], peakGains: [], closed: false };
      constructor() { super(); window.stageCues.push(this.cue); }
      createGain() {
        const gain = super.createGain();
        const ramp = gain.gain.linearRampToValueAtTime.bind(gain.gain);
        gain.gain.linearRampToValueAtTime = (value, when) => {
          this.cue.peakGains.push(value);
          return ramp(value, when);
        };
        return gain;
      }
      createOscillator() {
        const oscillator = super.createOscillator();
        const note = { frequency: 0, at: 0, until: 0, ended: false };
        const start = oscillator.start.bind(oscillator);
        const stop = oscillator.stop.bind(oscillator);
        const setFrequency = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
        oscillator.frequency.setValueAtTime = (value, when) => {
          note.frequency = value;
          return setFrequency(value, when);
        };
        oscillator.start = (when = 0) => {
          note.at = when;
          this.cue.notes.push(note);
          start(when);
        };
        oscillator.stop = (when = 0) => { note.until = when; stop(when); };
        oscillator.addEventListener("ended", () => { note.ended = true; });
        return oscillator;
      }
      async close() { await super.close(); this.cue.closed = true; }
    };
  });
}

async function openStages(page: Page) {
  await openLearnerPage(page, "/lessons/10000000-0000-4000-8000-000000000001/stages?stage=2");
  await expect(page.getByRole("radio", { name: /^1 자막 쉐도잉/ })).toBeEnabled();
}

for (const viewport of [{ width: 430, height: 932 }, { width: 1280, height: 800 }, { width: 320, height: 740 }]) {
test(`preview uses compact display-ink instructions and a full-width Start without clipping at ${viewport.width}px before download`, async ({ page }, info) => {
  const errors: string[] = [];
  let audioRequests = 0;
  // Preview layout must be inspectable before downloading a lesson. Keep the
  // real-download/start coverage in the activation tests below.
  await page.route("**/api/lessons/*/audio/*", route => {
    audioRequests++;
    return route.abort();
  });
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  await test.step(`stage-preview:viewport:${viewport.width}`, () => page.setViewportSize(viewport));
  await test.step(`stage-preview:open:${viewport.width}`, async () => {
    // openLearnerPage intentionally installs packages for playback tests.
    // The stage preview itself is available before package acquisition.
    await page.goto("/lessons/10000000-0000-4000-8000-000000000001/stages?stage=2", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("radio", { name: /^1 자막 쉐도잉/ })).toBeEnabled();
    await expect(page).toHaveTitle(/Meta Shadowing/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "레슨 다운로드 관리", exact: true })).toBeVisible();
  });
  await test.step(`stage-preview:activate:${viewport.width}`, () => page.getByRole("radio", { name: /^1 자막 쉐도잉/ }).click());
  await assertPreviewLayout(page, info, viewport.width, false);
  expect(errors).toEqual([]);
  expect(audioRequests).toBe(0);
});
}

async function assertPreviewLayout(page: Page, info: TestInfo, width: number, installed: boolean) {
  const preview = page.getByRole("dialog", { name: "자막 쉐도잉", exact: true });
  await test.step(`stage-preview:assert:${width}`, async () => {
    await expect(page).toHaveTitle(/Meta Shadowing/i);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(preview).not.toContainText("스테이지 1 · Lv 1");
    const description = preview.getByText("자막을 보며 듣고, 따라 말한 뒤 원음과 비교하세요.", { exact: true });
    await expect(description).toHaveCSS("color", "rgb(4, 44, 96)");
    await expect(description).toHaveCSS("font-size", "14px");
    await expect(preview).toHaveCSS("opacity", "1");
    await expect(description).toBeInViewport();
    await expect(preview.getByRole("button", { name: "학습 시작", exact: true })).toBeInViewport();
    const start = preview.getByRole("button", { name: "학습 시작", exact: true });
    if (installed) await expect(start).toBeEnabled();
    else await expect(start).toBeDisabled();
    const footer = await start.evaluate(button => {
      const action = button.getBoundingClientRect();
      const row = button.parentElement!.getBoundingClientRect();
      return { left: action.left - row.left, right: row.right - action.right };
    });
    expect(footer.left).toBeCloseTo(0, 0);
    expect(footer.right).toBeCloseTo(0, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator("nextjs-portal").getByText(/Runtime Error|Build Error/)).toHaveCount(0);
  });
  await test.step(`stage-preview:screenshot:${width}`, () => page.screenshot({ path: info.outputPath(`stage-preview-${width}.png`), animations: "disabled", scale: "css" }));
}

test("stage activation makes one short pop, while load, focus, and dismissals stay silent", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (["error", "warning"].includes(message.type())) errors.push(message.text()); });
  await observeCues(page);
  await openStages(page);
  const stage = page.getByRole("radio", { name: /^1 자막 쉐도잉/ });
  await stage.focus();
  expect(await page.evaluate(() => window.stageCues)).toEqual([]);
  // Retain installed/enabled layout coverage after one real download; resizing
  // does not need to repeat navigation or package acquisition.
  for (const { activation, viewport } of [
    { activation: "click", viewport: { width: 430, height: 932 } },
    { activation: "Enter", viewport: { width: 1280, height: 800 } },
    { activation: "Space", viewport: { width: 320, height: 740 } },
  ]) {
    await test.step(`stage-preview:viewport:${viewport.width}`, () => page.setViewportSize(viewport));
    const before = await page.evaluate(() => window.stageCues.length);
    if (activation === "click") await stage.click();
    else await stage.press(activation);
    await expect(page.getByRole("dialog", { name: "자막 쉐도잉", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.stageCues.length)).toBe(before + 1);
    await expect.poll(() => page.evaluate(() => window.stageCues.at(-1)?.closed)).toBe(true);
    const cue = await page.evaluate(() => window.stageCues.at(-1)!);
    expect(cue.notes).toHaveLength(1);
    expect(cue.peakGains).toEqual([0.16]);
    expect(cue.notes[0].ended).toBe(true);
    expect(cue.notes[0].until - cue.notes[0].at).toBeLessThan(0.2);
    await assertPreviewLayout(page, info, viewport.width, true);
    if (activation === "click") await page.getByRole("button", { name: "스테이지 안내 닫기" }).click();
    else await page.keyboard.press("Escape");
    await expect(stage).toBeFocused();
    expect(await page.evaluate(() => window.stageCues.length)).toBe(before + 1);
  }
  expect(errors).toEqual([]);
});

test("preview and account resume buttons play the same ascending cue and retain the started stage", async ({ page }) => {
  await observeCues(page);
  const startNotes: number[][] = [];
  for (const source of ["preview", "current"]) {
    await openStages(page);
    if (source === "preview") {
      await page.getByRole("radio", { name: /^2 자막 쉐도잉/ }).click();
      await expect.poll(() => page.evaluate(() => window.stageCues.at(-1)?.closed)).toBe(true);
      await page.getByRole("button", { name: "학습 시작", exact: true }).press("Enter");
    } else {
      // Starting stage 2 creates account progress; returning must resume it,
      // not reset the header action to the first uncompleted stage.
      await page.getByRole("button", { name: "현재 스테이지 2 시작", exact: true }).click();
    }
    await enterAccountPractice(page);
    await expect(page).toHaveURL(/\/player\?.*stage=2(?:&|$)/);
    await expect.poll(() => page.evaluate(() => window.stageCues.find(cue => cue.notes.length === 2)?.closed)).toBe(true);
    const cues = await page.evaluate(() => window.stageCues.filter(cue => cue.notes.length === 2));
    expect(cues).toHaveLength(1);
    expect(cues[0].peakGains).toEqual([0.16, 0.16]);
    expect(cues[0].notes.every(note => note.ended)).toBe(true);
    expect(cues[0].notes[1].frequency).toBeGreaterThan(cues[0].notes[0].frequency);
    expect(cues[0].notes[1].at).toBeGreaterThan(cues[0].notes[0].at);
    expect(cues[0].notes[1].until - cues[0].notes[0].at).toBeLessThan(0.4);
    startNotes.push(cues[0].notes.map(note => note.frequency));
  }
  expect(startNotes[0]).toEqual(startNotes[1]);
});

for (const failure of ["unavailable", "rejected", "pending"] as const) {
  test(`audio ${failure} never blocks stage selection or either Start action`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(failure => {
      if (failure === "unavailable") {
        Object.defineProperty(window, "AudioContext", { value: undefined });
      } else {
        Object.defineProperty(AudioContext.prototype, "state", { get: () => "suspended" });
        AudioContext.prototype.resume = () => failure === "rejected"
          ? Promise.reject(new Error("Audio blocked")) : new Promise<void>(() => {});
      }
    }, failure);
    await openStages(page);
    await page.getByRole("radio", { name: /^2 자막 쉐도잉/ }).click();
    await expect(page.getByRole("dialog", { name: "자막 쉐도잉", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "학습 시작", exact: true }).click();
  await enterAccountPractice(page);
    await expect(page).toHaveURL(/\/player\?.*stage=2(?:&|$)/);
    await openStages(page);
    await page.getByRole("button", { name: "현재 스테이지 2 시작", exact: true }).click();
  await enterAccountPractice(page);
    await expect(page).toHaveURL(/\/player\?.*stage=2(?:&|$)/);
    expect(errors).toEqual([]);
  });
}
