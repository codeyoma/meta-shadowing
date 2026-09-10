import { expect, test } from "./fixtures/cloud-ui";
import { loadPackageModules } from "./fixtures/package-store";
import { openLearnerPage } from "./fixtures/cloud-navigation";

test("disposal during the replacement transaction preserves active and recovery records", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  const result = await page.evaluate(async () => {
    const store = window.deviceStore, access = window.deviceAccess.readDeviceAccess()!;
    await store.writeDeviceLearningSettings(access.accountId, 3, {}, (await store.readDeviceLearningState(access)).writer);
    const snapshot = { schemaVersion: 1 as const, accountId: access.accountId, preferredLevel: 7, settings: {}, runs: [], history: [], studyDays: [] };
    await store.replaceDeviceSnapshot(access, snapshot);
    const abort = new AbortController();
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(...args) {
      const request = original.apply(this, args);
      if (this.transaction.mode === "readwrite") request.addEventListener("success", () => abort.abort(), { once: true });
      return request;
    };
    const rejected = await Reflect.apply(store.replaceDeviceSnapshot, null, [access, { ...snapshot, preferredLevel: 8 }, abort.signal]).then(() => false, () => true);
    IDBObjectStore.prototype.get = original;
    const active = await store.readDeviceLearningRecord(access.accountId);
    await store.recoverDeviceSnapshot(access);
    const backup = await store.readDeviceLearningRecord(access.accountId);
    return { rejected, active, backup };
  });
  expect(result.rejected).toBe(true);
  expect(result.active?.preferredLevel).toBe(7);
  expect(result.backup?.preferredLevel).toBe(3);
});

test("atomic snapshots swap reversibly and fence stale settings and delayed starts", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  const result = await page.evaluate(async () => {
    const store = window.deviceStore;
    if (!("replaceDeviceSnapshot" in store)) return { supported: false };
    const access = window.deviceAccess.readDeviceAccess()!;
    const { writer } = await store.readDeviceLearningState(access);
    await store.writeDeviceLearningSettings(access.accountId, 3, { speed: 2 }, writer);
    const snapshot = { schemaVersion: 1 as const, accountId: access.accountId, preferredLevel: 7, settings: { speed: 3 }, runs: [], history: [], studyDays: ["2026-09-09"] };
    await store.replaceDeviceSnapshot(access, snapshot);
    const b = await store.readDeviceLearningRecord(access.accountId);
    const stale = await store.writeDeviceLearningSettings(access.accountId, 8, {}, writer).then(() => false, () => true);
    await store.recoverDeviceSnapshot(access);
    const a = await store.readDeviceLearningRecord(access.accountId);
    await store.recoverDeviceSnapshot(access);
    const again = await store.readDeviceLearningRecord(access.accountId);
    const invalid = await store.replaceDeviceSnapshot(access, { ...snapshot, accountId: "foreign" }).then(() => false, () => true);
    const empty = await store.replaceDeviceSnapshot(access, { ...snapshot, preferredLevel: 1, settings: {}, studyDays: [] }).then(() => false, () => true);
    const malformed = await store.replaceDeviceSnapshot(access, { ...snapshot, preferredLevel: 99 }).then(() => false, () => true);
    const afterRejected = await store.readDeviceLearningRecord(access.accountId);
    await store.recoverDeviceSnapshot(access);
    const backupAfterRejected = await store.readDeviceLearningRecord(access.accountId);
    return { supported: true, b, a, again, stale, invalid, empty, malformed, afterRejected, backupAfterRejected };
  });
  expect(result.supported).toBe(true);
  expect(result.b).toMatchObject({ preferredLevel: 7, settings: { speed: 3 }, studyDays: ["2026-09-09"] });
  expect(result.a).toMatchObject({ preferredLevel: 3, settings: { speed: 2 }, studyDays: [] });
  expect(result.again).toEqual(result.b);
  expect([result.stale, result.invalid, result.empty]).toEqual([true, true, true]);
  expect(result.malformed).toBe(true);
  expect(result.afterRejected).toEqual(result.b);
  expect(result.backupAfterRejected).toEqual(result.a);
});

test("abort preserves current and backup, absent backup swaps, and other tabs reject old generations", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  expect(await page.evaluate(() => "readDeviceLearningState" in window.deviceStore)).toBe(true);
  const other = await context.newPage();
  await other.goto("/languages");
  await loadPackageModules(other);
  await other.evaluate(() => { window.deviceStore.subscribeDeviceSnapshot(() => { document.documentElement.dataset.snapshotChanged = "yes"; }); });
  const old = await other.evaluate(async () => window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!));
  const result = await page.evaluate(async () => {
    const store = window.deviceStore, access = window.deviceAccess.readDeviceAccess()!;
    const beforePackages = await window.packageStore.listLessonPackages(access.accountId);
    const snapshot = { schemaVersion: 1 as const, accountId: access.accountId, preferredLevel: 7, settings: {}, runs: [], history: [], studyDays: [] };
    const absent = await store.hasDeviceSnapshotBackup(access);
    await store.replaceDeviceSnapshot(access, snapshot);
    const present = await store.hasDeviceSnapshotBackup(access);
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(...args) { const value = original.apply(this, args); this.transaction.abort(); return value; };
    const aborted = await store.replaceDeviceSnapshot(access, { ...snapshot, preferredLevel: 8 }).then(() => false, () => true);
    IDBObjectStore.prototype.put = original;
    const afterAbort = await store.readDeviceLearningRecord(access.accountId);
    await store.recoverDeviceSnapshot(access);
    const recoveredAbsence = await store.readDeviceLearningRecord(access.accountId);
    await store.recoverDeviceSnapshot(access);
    return { absent, present, aborted, afterAbort, recoveredAbsence, packagesUnchanged: JSON.stringify(beforePackages) === JSON.stringify(await window.packageStore.listLessonPackages(access.accountId)) };
  });
  expect(result).toMatchObject({ absent: false, present: true, aborted: true, afterAbort: { preferredLevel: 7 }, recoveredAbsence: null, packagesUnchanged: true });
  await expect.poll(() => other.evaluate(() => document.documentElement.dataset.snapshotChanged)).toBe("yes");
  const stale = await other.evaluate(async ({ writer }) => {
    const store = window.deviceStore;
    const lesson = { id: "delayed", version: "2026-09-10T00:00:00.000Z", name: "Delayed", localizedName: "Delayed", language: "english" as const, phraseCount: 1, sectionCount: 0, entries: [], phrases: [] };
    return Promise.all([
      store.writeDeviceLearningSettings(writer.accountId, 8, {}, writer),
      store.startDeviceRun(writer, lesson, 1),
    ].map(value => value.then(() => "accepted", () => "fenced")));
  }, old);
  expect(stale).toEqual(["fenced", "fenced"]);
});

test("restored run identity and revision cannot authorize old checkpoints or logout-epoch writers", async ({ page }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
  const result = await page.evaluate(async () => {
    const store = window.deviceStore;
    const access = window.deviceAccess.readDeviceAccess()!;
    const { writer } = await store.readDeviceLearningState(access);
    const lesson = { id: "collision", version: "2026-09-10T00:00:00.000Z", name: "Collision", localizedName: "Collision", language: "english" as const, phraseCount: 3, sectionCount: 0, entries: [], phrases: [] };
    const run = await store.startDeviceRun(writer, lesson, 1);
    const finished = await store.startDeviceRun(writer, { ...lesson, id: "finished" }, 3);
    await store.saveDeviceRun(writer, { ...finished, completedAt: "2026-09-10T01:00:00.000Z", activeMs: 700 }, finished.revision, "2026-09-09");
    const record = (await store.readDeviceLearningRecord(access.accountId))!;
    const snapshot = window.snapshotModel.exportAccountSnapshot(record);
    snapshot.runs[0].nextPhrase = 2;
    snapshot.runs[0].nextUnit = 2;
    await store.replaceDeviceSnapshot(access, snapshot);
    const queued = () => store.writeDeviceLearningSettings(access.accountId, 8, {}, writer);
    const reject = (value: Promise<unknown>) => value.then(() => false, () => true);
    const fenced = await Promise.all([
      reject(store.saveDeviceRun(writer, { ...run, nextPhrase: 1 }, run.revision)),
      reject(queued()),
      reject(store.startDeviceRun(writer, { ...lesson, id: "delayed-start" }, 1)),
    ]);
    const after = (await store.readDeviceLearningRecord(access.accountId))!;
    const { writer: current } = await store.readDeviceLearningState(access);
    window.deviceAccess.clearDeviceAccess();
    localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify({ accountId: access.accountId, epoch: crypto.randomUUID() }));
    const epoch = await reject(store.writeDeviceLearningSettings(access.accountId, 8, {}, current));
    return { fenced, epoch, after };
  });
  expect(result.fenced).toEqual([true, true, true]);
  expect(result.epoch).toBe(true);
  expect(result.after.runs).toHaveLength(1);
  expect(result.after.runs[0]).toMatchObject({ lessonId: "collision", nextPhrase: 2, nextUnit: 2, revision: 0 });
  expect(result.after.history).toHaveLength(1);
  expect(result.after.history[0]).toMatchObject({ lessonId: "finished", activeMs: 700, completedAt: "2026-09-10T01:00:00.000Z" });
  expect(result.after.studyDays).toEqual(["2026-09-09"]);
});

test("a replacement in another tab stops the visible player and preserves installed package bytes", async ({ page, context }) => {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await openLearnerPage(page, "/player?lesson=10000000-0000-4000-8000-000000000001&level=1&stage=1");
  await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toBeVisible();
  const other = await context.newPage();
  await other.goto("/languages");
  await loadPackageModules(other);
  const result = await other.evaluate(async () => {
    const access = window.deviceAccess.readDeviceAccess()!;
    const packages = window.packageStore;
    const before = await packages.listLessonPackages(access.accountId);
    const installed = before.find(row => row.state === "ready")!;
    const read = () => packages.readLessonPackage(access.accountId, installed.lessonId, installed.version);
    const bytes = async () => Promise.all((await read())!.audio.map(async blob => window.packageModel.sha256(await blob.arrayBuffer())));
    const beforeBytes = await bytes();
    await window.deviceStore.replaceDeviceSnapshot(access, { schemaVersion: 1, accountId: access.accountId, preferredLevel: 8, settings: { speed: 2 }, runs: [], history: [], studyDays: [] });
    return { before, after: await packages.listLessonPackages(access.accountId), beforeBytes, afterBytes: await bytes() };
  });
  expect(result.before.some(row => row.state === "ready")).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.afterBytes).toEqual(result.beforeBytes);
  await expect(page.getByRole("button", { name: "기기 저장 재시도" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CONTINUE · 첫 원음 듣기", exact: true })).toHaveCount(0);
});
