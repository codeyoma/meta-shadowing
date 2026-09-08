import { expect, type Page } from "@playwright/test";
import { validSettingOverrides } from "../../src/lib/session-settings";
import { fixtureRunId } from "./cloud-journal";
import type { Request } from "@playwright/test";

const pendingRequests = new WeakMap<Page, Set<Request>>();
export async function pauseCloudClock(page: Page, time: Date | number) {
  await page.clock.pauseAt(time);
  // Virtual time may have invalidated the real ownership lease check.
  await expect(page.getByRole("button", { name: /CONTINUE|PAUSE/ }).first()).toBeEnabled();
}
/** Let real acknowledgments settle between virtual-clock intervals. A single
 * large jump would deliberately stop the new player at its first unsaved unit. */
function trackCloudRequests(page: Page) {
  let pending = pendingRequests.get(page);
  if (!pending) {
    pending = new Set<Request>(); pendingRequests.set(page, pending);
    const requests = pending;
    page.on("request", request => { if (request.url().includes("/api/learner/")) requests.add(request); });
    page.on("requestfinished", request => requests.delete(request));
    page.on("requestfailed", request => requests.delete(request));
  }
  return pending;
}
export async function advanceCloudClock(page: Page, milliseconds: number) {
  const pending = trackCloudRequests(page);
  await expect.poll(() => pending.size, { intervals: [1,10,50,100] }).toBe(0);
  for (let remaining = milliseconds; remaining > 0; remaining -= 250) {
    await page.clock.runFor(Math.min(remaining, 250));
    await expect.poll(() => pending!.size, { intervals: [1,10,50,100] }).toBe(0);
  }
}

/** Presentation tests explicitly acquire ownership; takeover behavior itself is
 * covered by the A/B/C integration tests, not bypassed by this helper. */
export async function enterAccountPractice(page: Page) {
  trackCloudRequests(page);
  const start = page.getByRole("button", { name: "계정 학습 시작", exact: true, disabled: false });
  const completed = page.getByRole("button", { name: "레슨 목록으로", exact: true });
  await expect(start.or(completed)).toBeVisible();
  if (await completed.count()) return;
  await expect(start).toBeEnabled();
  const takeover = page.getByRole("button", { name: "이 기기에서 이어 학습", exact: true });
  if (await takeover.count()) {
    await takeover.click();
    await page.getByRole("button", { name: "이어 학습 확인", exact: true }).click();
  } else await start.click();
  await expect(page.getByRole("button", { name: /CONTINUE/ })).toBeVisible();
}

async function waitForLearnerEntry(page: Page) {
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/player") await enterAccountPractice(page);
  else if (/^\/(languages|lessons|settings)(\/|$)/.test(pathname)) {
    // The first document render is a cloud-read gate, not the browse layout.
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
    // Old presentation URLs encode the test's settings. Prepare the real account
    // through its HTTP API; production intentionally ignores these query values.
    const q = url.searchParams;
    const numeric = (key: string, scale = 1) => q.has(key) ? Number(q.get(key)) * scale : undefined;
    const changes = validSettingOverrides({ mode: q.get("mode"), display: q.get("display"), speed: numeric("speed"), groupSize: numeric("group"),
      wpmLevel: numeric("wpm"), advanceDelayMs: numeric("gap", 1000), groupGapMs: numeric("groupGap", 1000), speakingExtraMs: numeric("speak", 1000),
      lineGapMs: numeric("lineGap", 1000), sectionGapMs: numeric("sectionGap", 1000) });
    if (Object.keys(changes).length) {
      const response = await page.request.get("/api/learner/preferences");
      expect(response.status()).toBe(200);
      const { profile } = await response.json();
      expect((await page.request.patch("/api/learner/preferences", { data: { accountId: profile.accountId, revision: profile.revision, changes } })).status()).toBe(200);
    }
  }
  const response = await page.goto(href);
  await waitForLearnerEntry(page);
  return response;
}

export async function reloadLearnerPage(page: Page) {
  const response = await page.reload();
  await waitForLearnerEntry(page);
  return response;
}

export async function readServerJournal(page: Page) {
  const response = await page.request.get("/api/learner/practice");
  expect(response.status()).toBe(200);
  return response.json();
}
