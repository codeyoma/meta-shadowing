import { expect, type Page } from "@playwright/test";
import { validSettingOverrides } from "../../src/lib/session-settings";
import { fixtureRunId } from "./cloud-journal";
import type { Request } from "@playwright/test";
import { loadPackageModules } from "./package-store";

const pendingRequests = new WeakMap<Page, Set<Request>>();
export async function pauseCloudClock(page: Page, time: Date | number) {
  await page.clock.pauseAt(time);
  // Entry must be ready before advancing a timed session.
  await expect(page.getByRole("button", { name: /CONTINUE|PAUSE/ }).first()).toBeEnabled();
}
/** Yield between virtual-clock intervals so durable writes can settle before
 * the player's next timed transition. */
function trackCloudRequests(page: Page) {
  let pending = pendingRequests.get(page);
  if (!pending) {
    pending = new Set<Request>(); pendingRequests.set(page, pending);
    const requests = pending;
    // Read readiness is asserted through the entry/settings UI. Only writes
    // (including renew/release) acknowledge a timed player's next transition;
    // canceled reads from a departed route must not deadlock virtual time.
    page.on("request", request => {
      if (request.method() !== "GET" && request.url().includes("/api/learner/")) requests.add(request);
    });
    page.on("requestfinished", request => requests.delete(request));
    page.on("requestfailed", request => requests.delete(request));
  }
  return pending;
}
export async function advanceCloudClock(page: Page, milliseconds: number) {
  const pending = trackCloudRequests(page);
  const requests = () => [...pending].map(request => `${request.method()} ${new URL(request.url()).pathname}`);
  await expect.poll(requests, { intervals: [1,10,50,100] }).toEqual([]);
  for (let remaining = milliseconds; remaining > 0; remaining -= 250) {
    await page.clock.runFor(Math.min(remaining, 250));
    await expect.poll(requests, { intervals: [1,10,50,100] }).toEqual([]);
  }
}

/** Install the package visibly and await the device player or completion view. */
export async function enterAccountPractice(page: Page) {
  trackCloudRequests(page);
  const start = page.getByRole("button", { name: /CONTINUE/ });
  const completed = page.getByRole("button", { name: "레슨 목록으로", exact: true });
  const packageGate = page.getByText("이 레슨 전체를 다운로드해 주세요.", { exact: true });
  // Rapid completion retains its paused control row below the completion card.
  await expect(start.or(completed).or(packageGate).first()).toBeVisible();
  if (await packageGate.isVisible()) {
    await page.getByRole("group", { name: / 다운로드$/ }).getByRole("button", { name: / 다운로드$/ }).click();
    await expect(start.or(completed).first()).toBeVisible();
  }
  if (await completed.count()) return;
  await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeVisible();
}

/** Acquire bytes only; ownership/takeover assertions stay under the test's control. */
export async function installPlayerPackage(page: Page) {
  const gate = page.getByText("이 레슨 전체를 다운로드해 주세요.", { exact: true });
  await expect(gate.or(page.getByRole("button", { name: /CONTINUE/ })).or(page.getByRole("button", { name: "이 기기에서 이어 학습", exact: true }))).toBeVisible();
  if (await gate.isVisible()) {
    await page.getByRole("group", { name: / 다운로드$/ }).getByRole("button", { name: / 다운로드$/ }).click();
    await expect(gate).toHaveCount(0);
  }
}

/** Visible explicit package installation is a prerequisite of stage/player tests. */
export async function installStagePackage(page: Page) {
  const manage = page.getByRole("button", { name: "레슨 다운로드 관리", exact: true });
  if (!(await manage.count())) return;
  const title = await page.getByRole("heading", { level: 1 }).innerText();
  await manage.click();
  const row = page.getByRole("group", { name: `${title} 다운로드`, exact: true });
  const download = row.getByRole("button", { name: `${title} 다운로드`, exact: true });
  if (await download.count()) await download.click();
  await expect(row.getByText("다운로드 완료", { exact: true })).toBeVisible();
  await page.getByRole("dialog", { name: "설정", exact: true }).getByRole("button", { name: "닫기", exact: true }).click();
}

async function waitForLearnerEntry(page: Page) {
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/player") await enterAccountPractice(page);
  else if (/^\/settings(\/|$)/.test(pathname)) {
    await expect(page.getByRole("dialog", { name: "설정", exact: true })).toBeVisible();
    await expect(page.getByLabel("학습 레벨")).toBeEnabled();
  }
  else if (/^\/(languages|lessons)(\/|$)/.test(pathname)) {
    // Both identity verification and the legacy cloud read may render a gate.
    // Wait for the actual shell before inspecting stage download controls.
    await expect(page.getByRole("navigation", { name: "상단 탐색" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  }
}

export async function openLearnerPage(page: Page, href: string) {
  const url = new URL(href, "http://fixture.invalid");
  if (url.searchParams.has("run")) {
    url.searchParams.set("run", fixtureRunId(url.searchParams.get("run")!));
    href = url.pathname + url.search;
  }
  if (url.pathname === "/player") {
    // Presentation URLs encode test settings. Seed the real device store;
    // production intentionally ignores untrusted settings query values.
    const q = url.searchParams;
    const numeric = (key: string, scale = 1) => q.has(key) ? Number(q.get(key)) * scale : undefined;
    const changes = validSettingOverrides({ mode: q.get("mode"), display: q.get("display"), speed: numeric("speed"), groupSize: numeric("group"),
      wpmLevel: numeric("wpm"), advanceDelayMs: numeric("gap", 1000), groupGapMs: numeric("groupGap", 1000), speakingExtraMs: numeric("speak", 1000),
      lineGapMs: numeric("lineGap", 1000), sectionGapMs: numeric("sectionGap", 1000) });
    if (Object.keys(changes).length) {
      const response = await page.request.get("/api/learner/preferences");
      expect(response.status()).toBe(200);
      const { profile } = await response.json();
      await page.goto("/languages", { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await loadPackageModules(page);
      await expect.poll(() => page.evaluate(accountId =>
        window.deviceAccess.readDeviceAccess()?.accountId === accountId, profile.accountId)).toBe(true);
      await page.evaluate(async ({ accountId, changes, level }) => {
        const { writer } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
        await window.deviceStore.writeDeviceLearningSettings(accountId, level, changes, writer);
      }, { accountId: profile.accountId, changes, level: Number(q.get("level") ?? 1) });
    }
  }
  // Full `load` waits for every image/subresource, even when the app is usable.
  // Readiness is defined by the real entry UI (and explicit package gate) below.
  const response = await page.goto(href, { waitUntil: "domcontentloaded" });
  await waitForLearnerEntry(page);
  if (new URL(page.url()).pathname.endsWith("/stages")) await installStagePackage(page);
  return response;
}

export async function reloadLearnerPage(page: Page) {
  const response = await page.reload({ waitUntil: "domcontentloaded" });
  await waitForLearnerEntry(page);
  return response;
}

export async function readServerJournal(page: Page) {
  const response = await page.request.get("/api/learner/practice");
  expect(response.status()).toBe(200);
  return response.json();
}

/** Public account-scoped local record read for learner presentation assertions. */
export async function readDeviceJournal(page: Page) {
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  return page.evaluate(async () => {
    const access = window.deviceAccess.readDeviceAccess();
    if (!access) throw new Error("Expected a verified local account");
    return window.deviceStore.readDeviceLearningRecord(access.accountId);
  });
}
