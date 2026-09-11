// @vitest-environment node
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { buildSync } from "esbuild";
import type * as Sync from "./device-learning-sync";
import type * as Merge from "./learning-merge";
import type * as Store from "./device-learning-store";
import type * as Access from "./device-access";
import type { AccountSnapshot } from "./account-snapshot";
import type { DeviceRun, DeviceWriter } from "./device-learning-store";

declare global { interface Window {
  deviceStore: typeof Store; deviceAccess: typeof Access;
  syncModule: typeof Sync; mergeModule: typeof Merge;
  sync: Sync.DeviceLearningSync; testWriter: DeviceWriter; testRun: DeviceRun;
  transport: { requests: Merge.LearningMerge[]; snapshot: AccountSnapshot | null; mode: "ok" | "lost" | "hold" | "error"; status: number; code: string; retryAfter: string | null; release?: () => void; active: number; maxActive: number; aborts: number };
  problems: (Sync.LearningSyncProblemCode | null)[];
  explicit: Promise<string>;
  renderVerifiedProvider: (accountId?: string, offline?: boolean) => void;
  unmountVerifiedProvider: () => void;
} }
let browser: Browser, context: BrowserContext, page: Page, bundle: string;
const enabled = process.env.LEARNING_SYNC_BROWSER_TEST === "1";
beforeAll(async () => {
  if (!enabled) return;
  bundle = buildSync({ stdin: { contents: `
    import * as store from "./src/lib/device-learning-store";
    import * as access from "./src/lib/device-access";
    import * as sync from "./src/lib/device-learning-sync";
    import * as merge from "./src/lib/learning-merge";
    import { createElement } from "react";
    import { createRoot } from "react-dom/client";
    import { DeviceAccessProvider } from "./src/app/device-access-provider";
    import { useDeviceLearningSync } from "./src/app/device-learning-sync-provider";
    Object.assign(window, { deviceStore: store, deviceAccess: access, syncModule: sync, mergeModule: merge });
    let root;
    function Probe() {
      const control = useDeviceLearningSync();
      return createElement("button", { id: "explicit-sync", "data-problem": control.problem ?? "", onClick: () => {
        window.explicit = control.flush().then(() => "ok", error => error.code);
      } }, "Sync now");
    }
    window.renderVerifiedProvider = (accountId, offline = false) => {
      root ??= createRoot(document.body.appendChild(document.createElement("div")));
      root.render(createElement(DeviceAccessProvider, { accountId, offline }, createElement(Probe)));
    };
    window.unmountVerifiedProvider = () => { root?.unmount(); root = undefined; };
  `, resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", loader: { ".css": "empty", ".module.css": "empty" } }).outputFiles[0].text;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  context = await browser.newContext(); page = await context.newPage();
  await page.route("http://localhost:4179/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Learning sync test</title>" }));
  await page.goto("http://localhost:4179/"); await page.clock.install({ time: new Date("2026-09-11T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-11T00:00:01Z"));
  await page.addScriptTag({ content: bundle });
  await page.evaluate(async () => {
    Math.random = () => 0;
    const access = { accountId: "fictional-a", epoch: "epoch-a" };
    localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(access));
    window.testWriter = (await window.deviceStore.readDeviceLearningState(access)).writer;
    window.testRun = await window.deviceStore.startDeviceRun(window.testWriter, { id: "lesson-a", version: "2026-09-10T00:00:00Z", name: "Fictional lesson", localizedName: "Lesson", language: "english", phraseCount: 10, sectionCount: 0, entries: [], phrases: [] }, 1);
    window.problems = [];
    window.transport = { requests: [], snapshot: null, mode: "ok", status: 503, code: "save-failed", retryAfter: null, active: 0, maxActive: 0, aborts: 0 };
    // Only transport is fake. Storage, projection, coordinator and merge remain real.
    window.fetch = async (input, init) => {
      if (input === "/api/learner/local-access") return Response.json({ accountId: "fictional-a" });
      if (input !== "/api/learner/snapshot" || init?.method !== "PUT") throw new Error("Unexpected transport request");
      const t = window.transport;
      const request = window.mergeModule.parseLearningMerge(JSON.parse(String(init.body)), "fictional-a");
      if ("options" in request) throw new Error("Automatic options mutation");
      t.requests.push(request); t.active++; t.maxActive = Math.max(t.maxActive, t.active);
      try {
        if (t.mode === "hold") await new Promise<void>((resolve, reject) => {
          t.release = resolve;
          init.signal?.addEventListener("abort", () => { t.aborts++; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
        });
        if (t.mode === "error") return Response.json({ error: t.code }, { status: t.status, headers: t.retryAfter ? { "Retry-After": t.retryAfter } : {} });
        t.snapshot = window.mergeModule.mergeLearning(t.snapshot, request);
        if (t.mode === "lost") throw new TypeError("Fictional lost response after commit");
        return Response.json({ updated: true, optionsRevision: 0 });
      } finally { t.active--; }
    };
  });
});
afterEach(async () => { await context?.close(); });
const start = () => page.evaluate(() => { window.sync = window.syncModule.createDeviceLearningSync(window.testWriter, code => window.problems.push(code)); });
const requests = () => page.evaluate(() => window.transport.requests.length);
const pending = () => page.evaluate(() => window.deviceStore.captureLearningSyncBatch(window.testWriter));
const settleUploaded = () => expect.poll(pending, { timeout: 1500 }).toBeNull();
const advance = (ms: number) => page.clock.runFor(ms);
const change = () => page.evaluate(async () => {
  window.testRun = await window.deviceStore.saveDeviceRun(window.testWriter, { ...window.testRun, nextPhrase: window.testRun.nextPhrase + 1, nextUnit: window.testRun.nextUnit + 1 }, window.testRun.revision);
});

describe.skipIf(!enabled)("silent learning sync with controlled transport and real IndexedDB", () => {
  it("the verified access provider owns one coordinator across rerenders and exposes a shared explicit flush", async () => {
    await page.evaluate(() => window.renderVerifiedProvider("fictional-a"));
    await expect.poll(() => page.evaluate(() => !!document.querySelector("#explicit-sync"))).toBe(true);
    await page.evaluate(() => window.renderVerifiedProvider("fictional-a"));
    await page.evaluate(() => (document.querySelector("#explicit-sync") as HTMLButtonElement).click());
    await settleUploaded();
    expect(await page.evaluate(() => window.explicit)).toBe("ok");
    await advance(60000);
    expect(await requests()).toBe(1);
    expect(await page.evaluate(() => document.querySelectorAll('[role="alert"], [role="dialog"], [aria-live]').length)).toBe(0);
  });
  it("unmounting the access provider aborts transport and keeps local pending work", async () => {
    await page.evaluate(() => { window.transport.mode = "hold"; window.renderVerifiedProvider("fictional-a"); });
    await expect.poll(() => page.evaluate(() => !!document.querySelector("#explicit-sync"))).toBe(true);
    await advance(5000); await expect.poll(requests).toBe(1);
    await page.evaluate(() => window.unmountVerifiedProvider());
    expect(await page.evaluate(() => window.transport.aborts)).toBe(1);
    expect((await pending())?.request.runs).toHaveLength(1);
    await advance(60000); expect(await requests()).toBe(1);
  });
  it("stays silent offline and uploads durable work on reconnect", async () => {
    await context.setOffline(true); await start(); await advance(60000);
    expect(await requests()).toBe(0);
    expect(await page.evaluate(() => window.problems)).toEqual([]);
    await context.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event("online"))); await advance(1);
    await settleUploaded();
    expect(await page.evaluate(() => window.transport.snapshot?.runs[0].runId)).toBe((await page.evaluate(() => window.testRun.runId)));
    expect(await page.evaluate(() => window.problems)).toEqual([]);
  });
  it("debounces edits for five seconds but flushes continuous edits within thirty seconds", async () => {
    await start();
    for (let i = 0; i < 7; i++) { await advance(4000); await change(); }
    expect(await requests()).toBe(0);
    await advance(2000); await settleUploaded();
    expect(await page.evaluate(() => window.transport.snapshot?.runs[0].nextPhrase)).toBe(7);
  });
  it("uploads after five idle seconds and never uploads preferences", async () => {
    await start(); await advance(4999); expect(await requests()).toBe(0);
    await advance(1); await settleUploaded();
    await page.evaluate(() => window.deviceStore.writeDeviceLearningSettings(window.testWriter.accountId, 8, { speed: 0.75 }, window.testWriter));
    await advance(60000);
    expect(await requests()).toBe(1);
    expect(await page.evaluate(() => window.transport.snapshot?.preferredLevel)).toBe(1);
  });
  it("retries a lost response idempotently while keeping the durable queue until acknowledgement", async () => {
    await page.evaluate(() => { window.transport.mode = "lost"; }); await start(); await advance(5000);
    await expect.poll(requests).toBe(1);
    expect((await pending())?.request.runs).toHaveLength(1);
    await page.evaluate(() => { window.transport.mode = "ok"; }); await advance(1999); expect(await requests()).toBe(1);
    await advance(1); await settleUploaded();
    expect(await requests()).toBe(2);
    expect(await page.evaluate(() => window.transport.snapshot?.runs)).toHaveLength(1);
    expect(await page.evaluate(() => window.problems)).toEqual([]);
  });
  it("keeps learning local during a held request and coalesces explicit flushes without overlap", async () => {
    await page.evaluate(() => { window.transport.mode = "hold"; }); await start(); await advance(5000);
    await expect.poll(requests).toBe(1); await change();
    await page.evaluate(() => { window.explicit = window.sync.flush().then(() => "ok"); void window.sync.flush(); });
    expect((await pending())?.request.runs[0].nextPhrase).toBe(1);
    expect(await requests()).toBe(1);
    await page.evaluate(() => { window.transport.mode = "ok"; window.transport.release!(); });
    await settleUploaded();
    expect(await page.evaluate(() => window.explicit)).toBe("ok");
    expect(await page.evaluate(() => window.transport.maxActive)).toBe(1);
    expect(await page.evaluate(() => window.transport.snapshot?.runs[0].nextPhrase)).toBe(1);
  });
  it("times out a hung transport after ten seconds, then retries silently", async () => {
    await page.evaluate(() => { window.transport.mode = "hold"; }); await start(); await advance(5000); await expect.poll(requests).toBe(1);
    await advance(9999); expect(await page.evaluate(() => window.transport.aborts)).toBe(0);
    await advance(1); await expect.poll(() => page.evaluate(() => window.transport.aborts)).toBe(1);
    await page.evaluate(() => { window.transport.mode = "ok"; }); await advance(2000); await settleUploaded();
    expect(await page.evaluate(() => window.problems)).toEqual([]);
  });
  it("honors a longer Retry-After despite focus, reconnect and new edits", async () => {
    await page.evaluate(() => { Object.assign(window.transport, { mode: "error", status: 429, retryAfter: "120" }); }); await start(); await advance(5000); await expect.poll(requests).toBe(1);
    await page.evaluate(() => { window.transport.mode = "ok"; window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); });
    await change(); await advance(119999); expect(await requests()).toBe(1);
    await advance(1); await settleUploaded();
  });
  it.each(["invalid-merge", "client-update-required", "merge-limit"] as const)("stops automatic %s retries and allows one explicit retry", async code => {
    await page.evaluate(code => { Object.assign(window.transport, { mode: "error", status: code === "merge-limit" ? 413 : code === "client-update-required" ? 426 : 400, code }); }, code);
    await start(); await advance(5000); await expect.poll(() => page.evaluate(() => window.problems)).toEqual([code]);
    await page.evaluate(() => { window.dispatchEvent(new Event("focus")); window.dispatchEvent(new Event("online")); }); await advance(120000);
    expect(await requests()).toBe(1);
    expect((await pending())?.request.runs).toHaveLength(1);
    await page.evaluate(async () => { window.transport.mode = "ok"; await window.sync.flush(); }); await settleUploaded();
    expect(await page.evaluate(() => window.problems)).toEqual([code, null]);
  });
  it("logout aborts synchronously, fences old ACKs, and same-account reauthentication resumes", async () => {
    await page.evaluate(() => { window.transport.mode = "hold"; }); await start(); await advance(5000); await expect.poll(requests).toBe(1);
    expect(await page.evaluate(() => { window.deviceAccess.clearDeviceAccess(); return window.transport.aborts; })).toBe(1);
    await page.evaluate(() => {
      const next = { accountId: "fictional-a", epoch: "new-session" };
      localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(next)); window.testWriter = { ...window.testWriter, ...next }; window.transport.mode = "ok";
      window.sync = window.syncModule.createDeviceLearningSync(next, code => window.problems.push(code));
    });
    await advance(5000); await settleUploaded();
    expect(await requests()).toBe(2);
  });
  it("authentication rejection ends applicable device access and preserves its pending learning", async () => {
    await page.evaluate(() => { Object.assign(window.transport, { mode: "error", status: 401, code: "unauthorized" }); }); await start(); await advance(5000);
    await expect.poll(() => page.evaluate(() => window.deviceAccess.readDeviceAccess())).toBeNull();
    expect(await page.evaluate(() => window.problems)).toEqual(["sign-in-required"]);
    expect(await page.evaluate(() => window.deviceStore.readDeviceLearningRecord("fictional-a"))).not.toBeNull();
  });
  it("backs off repeated server failures from two seconds to a capped sixty seconds", async () => {
    await page.evaluate(() => { window.transport.mode = "error"; }); await start(); await advance(5000); await expect.poll(requests).toBe(1);
    let count = 1;
    for (const delay of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
      await advance(delay - 1); expect(await requests()).toBe(count);
      await advance(1); await expect.poll(requests).toBe(++count);
    }
    expect(await page.evaluate(() => window.problems)).toEqual([]);
    expect((await pending())?.request.runs).toHaveLength(1);
  });
  it("adds retry jitter without exceeding sixty seconds", async () => {
    await page.evaluate(() => { Math.random = () => 1; window.transport.mode = "error"; }); await start(); await advance(5000); await expect.poll(requests).toBe(1);
    await advance(2000); expect(await requests()).toBe(1);
    await advance(400); await expect.poll(requests).toBe(2);
  });
  it("a relevant new local checkpoint rechecks a stopped terminal problem", async () => {
    await page.evaluate(() => { Object.assign(window.transport, { mode: "error", status: 413, code: "merge-limit" }); }); await start(); await advance(5000);
    await expect.poll(() => page.evaluate(() => window.problems)).toEqual(["merge-limit"]);
    await page.evaluate(() => { window.transport.mode = "ok"; }); await change(); await advance(5000); await settleUploaded();
    expect(await page.evaluate(() => window.problems)).toEqual(["merge-limit", null]);
  });
  it("does not announce the same unresolved problem again when a local change triggers a failed recheck", async () => {
    await page.evaluate(() => { Object.assign(window.transport, { mode: "error", status: 413, code: "merge-limit" }); }); await start(); await advance(5000);
    await expect.poll(() => page.evaluate(() => window.problems)).toEqual(["merge-limit"]);
    await change(); await advance(5000); await expect.poll(requests).toBe(2);
    expect(await page.evaluate(() => window.problems)).toEqual(["merge-limit"]);
  });
  it("switching to a foreign account cannot send or acknowledge the previous account's work", async () => {
    await page.evaluate(() => { window.transport.mode = "hold"; }); await start(); await advance(5000); await expect.poll(requests).toBe(1);
    await page.evaluate(() => {
      const other = { accountId: "fictional-b", epoch: "epoch-b" };
      localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(other));
      window.dispatchEvent(new Event("device-access-changed"));
      window.sync = window.syncModule.createDeviceLearningSync(other, code => window.problems.push(code));
    });
    await advance(60000); expect(await requests()).toBe(1);
    expect(await page.evaluate(() => window.transport.aborts)).toBe(1);
    const queue = await page.evaluate(async () => {
      window.sync.dispose(); localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(window.testWriter));
      return window.deviceStore.captureLearningSyncBatch(window.testWriter);
    });
    expect(queue?.request.runs).toHaveLength(1);
  });
  it("a failed local ACK retries safely and never replaces active state or broadcasts snapshot replacement", async () => {
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      let failOnce = true;
      IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
        if (this.name === "learning-outbox" && Object.keys(args[0].entries).length === 0 && failOnce) {
          failOnce = false; throw new DOMException("Fictional ACK quota failure", "QuotaExceededError");
        }
        return original.apply(this, args);
      };
      window.addEventListener("device-snapshot-replaced", () => { document.title = "unexpected replacement"; });
    });
    await start(); await advance(5000); await expect.poll(requests).toBe(1);
    expect((await pending())?.request.runs).toHaveLength(1);
    await change(); // Bookkeeping failure must not block a new durable checkpoint.
    await advance(5000); await settleUploaded();
    expect(await page.title()).toBe("Learning sync test");
    expect(await page.evaluate(() => window.deviceStore.readDeviceLearningRecord("fictional-a"))).toMatchObject({ runs: [{ nextPhrase: 1, revision: 1 }] });
    expect(await page.evaluate(() => window.transport.snapshot?.runs[0].nextPhrase)).toBe(1);
    expect(await page.evaluate(() => window.problems)).toEqual([]);
  });
  it("explicit offline failure is typed and does not masquerade as successful sync", async () => {
    await context.setOffline(true); await start();
    expect(await page.evaluate(() => window.sync.flush().then(() => "success", error => error.code))).toBe("offline");
    expect(await requests()).toBe(0);
  });
});
