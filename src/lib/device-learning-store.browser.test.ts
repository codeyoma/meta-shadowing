// @vitest-environment node
import { beforeAll, afterAll, beforeEach, afterEach, describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { buildSync } from "esbuild";
import type * as Store from "./device-learning-store";
import type * as Access from "./device-access";
import type { DeviceRun, DeviceWriter } from "./device-learning-store";

declare global { interface Window {
  deviceStore: typeof Store; deviceAccess: typeof Access;
  testWriter: DeviceWriter; testRun: DeviceRun;
} }
let browser: Browser, context: BrowserContext, page: Page, bundle: string;
const enabled = process.env.LEARNING_SYNC_BROWSER_TEST === "1";
beforeAll(async () => {
  if (!enabled) return;
  bundle = buildSync({ stdin: { contents: 'import * as store from "./src/lib/device-learning-store"; import * as access from "./src/lib/device-access"; window.deviceStore = store; window.deviceAccess = access;', resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser", format: "iife" }).outputFiles[0].text;
  browser = await chromium.launch();
});
afterAll(async () => { await browser?.close(); });
beforeEach(async () => {
  context = await browser.newContext(); page = await context.newPage();
  await page.route("http://localhost:4179/**", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Local learning test</title>" }));
  await page.goto("http://localhost:4179/"); await page.addScriptTag({ content: bundle });
  await page.evaluate(async () => {
    const access = { accountId: "fictional-a", epoch: "epoch-a" };
    localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(access));
    window.testWriter = (await window.deviceStore.readDeviceLearningState(access)).writer;
    window.testRun = await window.deviceStore.startDeviceRun(window.testWriter, { id: "lesson-a", version: "2026-09-10T00:00:00Z", name: "Fictional lesson", localizedName: "Lesson", language: "english", phraseCount: 10, sectionCount: 0, entries: [], phrases: [] }, 1);
  });
});
afterEach(async () => { await context?.close(); });

describe.skipIf(!enabled)("durable learning outbox in real IndexedDB", () => {
  it("saves distinct microsecond package versions and retains them through reload and sync capture", async () => {
    await page.evaluate(async () => {
      // Real publication versions have microseconds; these differ within one millisecond.
      const lesson = { id: "microsecond-lesson", name: "Fictional lesson", localizedName: "Lesson", language: "english" as const, phraseCount: 10, sectionCount: 0, entries: [], phrases: [] };
      const first = await window.deviceStore.startDeviceRun(window.testWriter, { ...lesson, version: "2026-09-11T01:34:02.123456+00:00" }, 1);
      await window.deviceStore.saveDeviceRun(window.testWriter, { ...first, nextPhrase: 10, nextUnit: 10, completedAt: "2026-09-11T02:00:00.123Z" }, 0);
      await window.deviceStore.startDeviceRun(window.testWriter, { ...lesson, version: "2026-09-11T01:34:02.123457+00:00" }, 1);
    });
    await page.reload(); await page.addScriptTag({ content: bundle });
    const result = await page.evaluate(async () => {
      const access = window.deviceAccess.readDeviceAccess()!;
      return { record: await window.deviceStore.readDeviceLearningRecord(access.accountId), batch: await window.deviceStore.captureLearningSyncBatch(access) };
    });
    expect(result.record?.runs.find(run => run.lessonId === "microsecond-lesson")?.lessonVersion).toBe("2026-09-11T01:34:02.123457+00:00");
    expect(result.record?.history[0].lessonVersion).toBe("2026-09-11T01:34:02.123456+00:00");
    expect(result.batch?.request.runs.find(run => run.lessonId === "microsecond-lesson")?.lessonVersion).toBe("2026-09-11T01:34:02.123457+00:00");
    expect(result.batch?.request.history[0].lessonVersion).toBe("2026-09-11T01:34:02.123456+00:00");
  });
  it("migrates schema-2 learning once, including history and days, and never reseeds after ACK", async () => {
    const result = await page.evaluate(async () => {
      const record = (await window.deviceStore.readDeviceLearningRecord(window.testWriter.accountId))!;
      record.history = [{ ...record.runs[0], runId: "completed-legacy", completedAt: "2026-09-10T00:00:00Z" }];
      record.studyDays = ["2026-09-10"];
      await new Promise<void>((resolve, reject) => { const request = indexedDB.deleteDatabase(window.deviceStore.DEVICE_LEARNING_DATABASE); request.onsuccess = () => resolve(); request.onerror = () => reject(request.error); });
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(window.deviceStore.DEVICE_LEARNING_DATABASE, 2);
        request.onupgradeneeded = () => { request.result.createObjectStore("accounts", { keyPath: "accountId" }); request.result.createObjectStore("snapshots", { keyPath: "accountId" }); };
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; const tx = db.transaction("accounts", "readwrite"); tx.objectStore("accounts").put(record); tx.oncomplete = () => { db.close(); resolve(); }; };
      });
      const first = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
      await window.deviceStore.acknowledgeLearningSyncBatch(first!);
      return { first, second: await window.deviceStore.captureLearningSyncBatch(window.testWriter), databases: await indexedDB.databases(), keys: Object.keys(localStorage) };
    });
    expect(result.first?.request.runs).toHaveLength(1);
    expect(result.first?.request.history[0].runId).toBe("completed-legacy");
    expect(result.first?.request.studyDays).toEqual(["2026-09-10"]);
    expect(result.second).toBeNull();
    expect(result.databases.map(db => db.name)).toEqual(["meta-shadowing-device-learning-v1"]);
    expect(result.keys).toEqual(["meta-shadowing:device-access:v1"]);
  });
  it("splits oversized queues into valid bounded batches without dropping any run", async () => {
    const result = await page.evaluate(async () => {
      const record = (await window.deviceStore.readDeviceLearningRecord(window.testWriter.accountId))!;
      // Simulate existing offline work larger than one transport batch.
      record.runs = Array.from({ length: 600 }, (_, i) => ({ ...record.runs[0], runId: `legacy-${i}`, lessonName: "Fictional ".repeat(90) }));
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(window.deviceStore.DEVICE_LEARNING_DATABASE);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => { const db = request.result; const tx = db.transaction(["accounts", "learning-outbox"], "readwrite"); tx.objectStore("accounts").put(record); tx.objectStore("learning-outbox").delete(record.accountId); tx.oncomplete = () => { db.close(); resolve(); }; };
      });
      const ids: string[] = [], sizes: number[] = [];
      for (let i = 0; i < 10; i++) {
        const batch = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
        if (!batch) break;
        sizes.push(new TextEncoder().encode(JSON.stringify(batch.request)).byteLength);
        ids.push(...batch.request.runs.map(run => run.runId));
        await window.deviceStore.acknowledgeLearningSyncBatch(batch);
      }
      return { ids, sizes, pending: await window.deviceStore.captureLearningSyncBatch(window.testWriter) };
    });
    expect(result.sizes.length).toBeGreaterThan(1);
    expect(Math.max(...result.sizes)).toBeLessThanOrEqual(256 * 1024);
    expect(new Set(result.ids).size).toBe(600);
    expect(result.ids).toHaveLength(600);
    expect(result.pending).toBeNull();
  });
  it("retains the saved checkpoint through a page reload, without private fields or options", async () => {
    await page.evaluate(async () => {
      await window.deviceStore.saveDeviceRun(window.testWriter, { ...window.testRun, nextPhrase: 1, nextUnit: 1, activeMs: 100 }, 0, "2026-09-11");
    });
    await page.reload(); await page.addScriptTag({ content: bundle });
    const batch = await page.evaluate(() => window.deviceStore.captureLearningSyncBatch(window.deviceAccess.readDeviceAccess()!));
    expect(batch?.request.runs[0]).toMatchObject({ nextPhrase: 1, activeMs: 100 });
    expect(batch?.request.studyDays).toEqual(["2026-09-11"]);
    expect(batch?.request).not.toHaveProperty("options");
    expect(batch?.request.runs[0]).not.toHaveProperty("revision");
    expect(batch?.request).not.toHaveProperty("epoch");
  });
  it("an old ACK cannot clear an edit made after capture", async () => {
    const pending = await page.evaluate(async () => {
      const sent = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
      await window.deviceStore.saveDeviceRun(window.testWriter, { ...window.testRun, nextPhrase: 2, nextUnit: 2 }, 0);
      if (sent) await window.deviceStore.acknowledgeLearningSyncBatch(sent);
      return window.deviceStore.captureLearningSyncBatch(window.testWriter);
    });
    expect(pending?.request.runs).toHaveLength(1);
    expect(pending?.request.runs[0].nextPhrase).toBe(2);
  });
  it("restore and recovery preserve unsent values without inserting them into active state; old-generation ACK is fenced", async () => {
    const result = await page.evaluate(async () => {
      const sent = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
      await window.deviceStore.replaceDeviceSnapshot(window.testWriter, { schemaVersion: 1, accountId: window.testWriter.accountId, preferredLevel: 5, settings: {}, runs: [], history: [], studyDays: ["2026-09-10"] });
      if (sent) await window.deviceStore.acknowledgeLearningSyncBatch(sent);
      const after = await window.deviceStore.readDeviceLearningState(window.testWriter);
      const queued = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
      await window.deviceStore.recoverDeviceSnapshot(window.testWriter);
      const recoveredQueue = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
      return { active: after.record?.runs, queued, recoveredQueue, generation: after.writer.generation };
    });
    expect(result.active).toEqual([]);
    expect(result.queued?.request.runs).toHaveLength(1);
    expect(result.queued?.request.studyDays).toEqual(["2026-09-10"]);
    expect(result.recoveredQueue?.request.runs).toHaveLength(1);
    expect(result.generation).not.toBe("legacy");
  });
  it("settings-only saves and unchanged resumes do not requeue acknowledged progress", async () => {
    const result = await page.evaluate(async () => {
      const sent = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
      if (sent) await window.deviceStore.acknowledgeLearningSyncBatch(sent);
      await window.deviceStore.writeDeviceLearningSettings(window.testWriter.accountId, 7, { speed: 0.75 }, window.testWriter);
      return { sent, pending: await window.deviceStore.captureLearningSyncBatch(window.testWriter) };
    });
    expect(result.sent?.request.runs).toHaveLength(1);
    expect(result.pending).toBeNull();
  });
  it("outbox persistence failure rolls back the learning write and does not emit a change", async () => {
    const result = await page.evaluate(async () => {
      const original = IDBObjectStore.prototype.put;
      let changes = 0; window.addEventListener("device-learning-changed", () => changes++);
      IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
        if (this.name === "learning-outbox") throw new DOMException("Fictional quota fault", "QuotaExceededError");
        return original.apply(this, args);
      };
      let rejected = false;
      try { await window.deviceStore.saveDeviceRun(window.testWriter, { ...window.testRun, nextPhrase: 3 }, 0); } catch { rejected = true; }
      finally { IDBObjectStore.prototype.put = original; }
      return { rejected, changes, record: await window.deviceStore.readDeviceLearningRecord(window.testWriter.accountId) };
    });
    expect(result.rejected).toBe(true);
    expect(result.record?.runs[0].nextPhrase).toBe(0);
    expect(result.changes).toBe(0);
  });
  it("logout rejects capture and ACK; same account login resumes while another account sees no queue", async () => {
    const result = await page.evaluate(async () => {
      const sent = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
      window.deviceAccess.clearDeviceAccess();
      let rejected = false;
      try { await window.deviceStore.captureLearningSyncBatch(window.testWriter); } catch { rejected = true; }
      const foreign = { accountId: "fictional-b", epoch: "epoch-b" };
      localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(foreign));
      const other = await window.deviceStore.captureLearningSyncBatch(foreign);
      const resumed = { accountId: "fictional-a", epoch: "epoch-new" };
      localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(resumed));
      if (sent) { try { await window.deviceStore.acknowledgeLearningSyncBatch(sent); } catch { /* old epoch rejected */ } }
      return { rejected, other, pending: await window.deviceStore.captureLearningSyncBatch(resumed) };
    });
    expect(result.rejected).toBe(true);
    expect(result.other).toBeNull();
    expect(result.pending?.request.runs).toHaveLength(1);
  });
  it("coalesces completion and preserves it through restoring an older copy of the same run", async () => {
    const result = await page.evaluate(async () => {
      const done = { ...window.testRun, completedAt: "2026-09-11T00:00:00Z", activeMs: 900, nextPhrase: 5, nextUnit: 5 };
      await window.deviceStore.saveDeviceRun(window.testWriter, done, 0, "2026-09-11");
      const { revision: _revision, ...portable } = window.testRun;
      await window.deviceStore.replaceDeviceSnapshot(window.testWriter, { schemaVersion: 1, accountId: window.testWriter.accountId, preferredLevel: 1, settings: {}, runs: [{ ...portable, stage: 1 }], history: [], studyDays: [] });
      return { batch: await window.deviceStore.captureLearningSyncBatch(window.testWriter), state: await window.deviceStore.readDeviceLearningState(window.testWriter) };
    });
    expect(result.batch?.request.runs).toEqual([]);
    expect(result.batch?.request.history).toHaveLength(1);
    expect(result.batch?.request.history[0]).toMatchObject({ nextPhrase: 5, activeMs: 900 });
    expect(result.batch?.request.studyDays).toEqual(["2026-09-11"]);
    expect(result.state.record?.runs[0].nextPhrase).toBe(0);
    expect(result.state.record?.history).toEqual([]);
  });
  it("logout during ACK bookkeeping aborts the transaction before it can clear pending values", async () => {
    const result = await page.evaluate(async () => {
      const batch = await window.deviceStore.captureLearningSyncBatch(window.testWriter);
      const original = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(...args: Parameters<IDBObjectStore["put"]>) {
        const request = original.apply(this, args);
        if (this.name === "learning-outbox" && Object.keys(args[0].entries).length === 0) window.deviceAccess.clearDeviceAccess();
        return request;
      };
      let rejected = false;
      try { await window.deviceStore.acknowledgeLearningSyncBatch(batch!); } catch { rejected = true; }
      finally { IDBObjectStore.prototype.put = original; }
      const resumed = { accountId: "fictional-a", epoch: "next-epoch" };
      localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(resumed));
      return { rejected, queued: await window.deviceStore.captureLearningSyncBatch(resumed) };
    });
    expect(result.rejected).toBe(true);
    expect(result.queued?.request.runs).toHaveLength(1);
  });
});
