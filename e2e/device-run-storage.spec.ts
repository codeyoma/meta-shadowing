import { expect, test, type Page } from "./fixtures/cloud-ui";
import { loadPackageModules } from "./fixtures/package-store";

async function openPublicStore(page: Page) {
  await page.request.post("/api/auth", { data: { password: "integration-beta-password" } });
  await page.goto("/languages");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await loadPackageModules(page);
  await expect.poll(() => page.evaluate(() => Boolean(window.deviceAccess.readDeviceAccess()))).toBe(true);
}

test("durable runs cover independent lessons and all stage families across reload", async ({ page }) => {
  await openPublicStore(page);
  const started = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const lesson = {
      id: "storage-lesson-a", version: "2026-09-10T00:00:00.000Z", language: "english" as const,
      name: "Storage A", localizedName: "Storage A", phraseCount: 12, sectionCount: 2, entries: [], phrases: [],
    };
    const other = { ...lesson, id: "storage-lesson-b", name: "Storage B" };
    const runs = [];
    for (let stage = 1; stage <= 16; stage++) {
      runs.push(await window.deviceStore.startDeviceRun(access, stage % 2 ? lesson : other, stage));
    }
    const levelOne = runs[0];
    const grouped = runs[9];
    const rapid = runs[15];
    const savedGrouped = await window.deviceStore.saveDeviceRun(access, { ...grouped, nextUnit: 2, nextPhrase: 7, confirmedCycles: 4 }, grouped.revision);
    const savedRapid = await window.deviceStore.saveDeviceRun(access, { ...rapid, nextUnit: 3, nextPhrase: 9 }, rapid.revision);
    return { levelOne, savedGrouped, savedRapid, runIds: runs.map(run => run.runId), accountId: access.accountId };
  });

  expect(started.levelOne).toMatchObject({ level: 1, stage: 1 });
  expect(started.savedGrouped).toMatchObject({ level: 5, stage: 10, nextUnit: 2, nextPhrase: 7, confirmedCycles: 4, revision: 1 });
  expect(started.savedRapid).toMatchObject({ level: 8, stage: 16, nextUnit: 3, nextPhrase: 9, confirmedCycles: 0, revision: 1 });
  expect(new Set(started.runIds).size).toBe(16);

  await page.reload();
  await loadPackageModules(page);
  const record = await page.evaluate(accountId => window.deviceStore.readDeviceLearningRecord(accountId), started.accountId);
  expect(record?.runs).toHaveLength(16);
  expect(record?.runs.map(run => [run.stage, run.level])).toEqual(
    Array.from({ length: 16 }, (_, index) => [index + 1, Math.ceil((index + 1) / 2)]),
  );
  expect(record?.runs.find(run => run.stage === 10)).toMatchObject({ lessonId: "storage-lesson-b", nextUnit: 2, nextPhrase: 7 });
  expect(record?.runs.find(run => run.stage === 16)).toMatchObject({ lessonId: "storage-lesson-b", nextUnit: 3, nextPhrase: 9 });
  expect(record?.runs.find(run => run.stage === 10)?.runId).not.toBe(record?.runs.find(run => run.stage === 16)?.runId);
  expect(record?.runs.filter(run => run.lessonId === "storage-lesson-b" && [10, 16].includes(run.stage!)).map(run => run.revision)).toEqual([1, 1]);
});

test("invalid stages, mappings, and cycle data cannot replace prior durable data", async ({ page }) => {
  await openPublicStore(page);
  const result = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const lesson = {
      id: "validation-lesson", version: "2026-09-10T00:00:00.000Z", language: "english" as const,
      name: "Validation", localizedName: "Validation", phraseCount: 12, sectionCount: 2, entries: [], phrases: [],
    };
    const audio = await window.deviceStore.startDeviceRun(access, lesson, 9);
    const rapid = await window.deviceStore.startDeviceRun(access, lesson, 13);
    const reject = async (operation: Promise<unknown>) => operation.then(() => "accepted", () => "rejected");
    const outcomes = await Promise.all([
      reject(window.deviceStore.startDeviceRun(access, lesson, 0)),
      reject(window.deviceStore.startDeviceRun(access, lesson, 17)),
      reject(window.deviceStore.saveDeviceRun(access, { ...audio, level: 4 }, audio.revision)),
      reject(window.deviceStore.saveDeviceRun(access, { ...audio, confirmedCycles: 6 }, audio.revision)),
      reject(window.deviceStore.saveDeviceRun(access, { ...rapid, confirmedCycles: 1 }, rapid.revision)),
      reject(window.deviceStore.saveDeviceRun(access, { ...audio, nextUnit: -1 }, audio.revision)),
    ]);
    const record = await window.deviceStore.readDeviceLearningRecord(access.accountId);
    return { outcomes, runs: record!.runs.map(run => ({ stage: run.stage, level: run.level, revision: run.revision, nextUnit: run.nextUnit, confirmedCycles: run.confirmedCycles })) };
  });

  expect(result.outcomes).toEqual(Array(6).fill("rejected"));
  expect(result.runs).toEqual([
    { stage: 9, level: 5, revision: 0, nextUnit: 0, confirmedCycles: 0 },
    { stage: 13, level: 7, revision: 0, nextUnit: 0, confirmedCycles: 0 },
  ]);
});

test("revision fencing, completion deduplication, and settings updates preserve run snapshots", async ({ page }) => {
  await openPublicStore(page);
  const result = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const lesson = {
      id: "completion-lesson", version: "2026-09-10T00:00:00.000Z", language: "english" as const,
      name: "Completion", localizedName: "Completion", phraseCount: 12, sectionCount: 2, entries: [], phrases: [],
    };
    const run = await window.deviceStore.startDeviceRun(access, lesson, 10);
    const saved = await window.deviceStore.saveDeviceRun(access, { ...run, nextUnit: 4, nextPhrase: 8, confirmedCycles: 5 }, run.revision);
    const stale = await window.deviceStore.saveDeviceRun(access, { ...run, nextUnit: 1 }, run.revision).then(() => "accepted", () => "fenced");
    const completed = await window.deviceStore.saveDeviceRun(access, { ...saved, completedAt: "2026-09-10T01:00:00.000Z" }, saved.revision);
    await window.deviceStore.saveDeviceRun(access, completed, completed.revision);
    const active = await window.deviceStore.startDeviceRun(access, lesson, 11);
    await window.deviceStore.writeDeviceLearningSettings(access.accountId, 8, { speed: 2, groupSize: 3 }, access);
    const record = (await window.deviceStore.readDeviceLearningRecord(access.accountId))!;
    return { stale, active, preferredLevel: record.preferredLevel, settings: record.settings, runs: record.runs, history: record.history };
  });

  expect(result.stale).toBe("fenced");
  expect(result.preferredLevel).toBe(8);
  expect(result.settings).toEqual({ speed: 2, groupSize: 3 });
  expect(result.runs).toHaveLength(1);
  expect(result.runs[0]).toMatchObject({ runId: result.active.runId, level: 6, stage: 11, settings: { speed: 1, groupSize: 2 } });
  expect(result.history).toHaveLength(1);
  expect(result.history[0]).toMatchObject({ level: 5, stage: 10, nextUnit: 4, nextPhrase: 8, confirmedCycles: 5, settings: { speed: 1, groupSize: 2 } });
});

test("schema-one settings upgrade without losing legacy preferences", async ({ page }) => {
  await openPublicStore(page);
  const result = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(window.deviceStore.DEVICE_LEARNING_DATABASE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction("accounts", "readwrite");
        transaction.objectStore("accounts").put({ schemaVersion: 1, accountId: access.accountId, preferredLevel: 4, settings: { speed: 2 } });
        transaction.oncomplete = () => { open.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    const before = await window.deviceStore.readDeviceLearningRecord(access.accountId);
    const lesson = {
      id: "legacy-settings-lesson", version: "2026-09-10T00:00:00.000Z", language: "english" as const,
      name: "Legacy settings", localizedName: "Legacy settings", phraseCount: 3, sectionCount: 0, entries: [], phrases: [],
    };
    const run = await window.deviceStore.startDeviceRun(access, lesson, 2);
    return { before, run };
  });

  expect(result.before).toMatchObject({ schemaVersion: 2, preferredLevel: 4, settings: { speed: 2 }, runs: [], history: [] });
  expect(result.run).toMatchObject({ level: 1, stage: 2, settings: { speed: 2 } });
});

test("stage-less schema-two level-one runs normalize and survive later mutations", async ({ page }) => {
  await openPublicStore(page);
  const result = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const settings = {
      mode: "manual", display: "current", speed: 1, advanceDelayMs: 1000, groupSize: 2, groupGapMs: 500,
      wpmLevel: 3, speakingExtraMs: 500, lineGapMs: 1000, sectionGapMs: 2000,
    };
    const base = {
      lessonId: "schema-two-lesson", lessonVersion: "2026-09-10T00:00:00.000Z", lessonName: "Schema two",
      language: "english", level: 1, nextUnit: 0, nextPhrase: 0, activeMs: 0, settings, confirmedCycles: 0, revision: 0,
    };
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(window.deviceStore.DEVICE_LEARNING_DATABASE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const transaction = open.result.transaction("accounts", "readwrite");
        transaction.objectStore("accounts").put({ schemaVersion: 2, accountId: access.accountId, preferredLevel: 1, settings: {},
          runs: [{ ...base, runId: "stage-less-active" }],
          history: [{ ...base, runId: "stage-less-complete", completedAt: "2026-09-10T02:00:00.000Z" }],
        });
        transaction.oncomplete = () => { open.result.close(); resolve(); };
        transaction.onerror = () => reject(transaction.error);
      };
    });
    const before = (await window.deviceStore.readDeviceLearningRecord(access.accountId))!;
    const saved = await window.deviceStore.saveDeviceRun(access, { ...before.runs[0], nextUnit: 1, nextPhrase: 1 }, before.runs[0].revision);
    await window.deviceStore.writeDeviceLearningSettings(access.accountId, 2, { speed: 2 }, access);
    const after = (await window.deviceStore.readDeviceLearningRecord(access.accountId))!;
    return { before, saved, after };
  });

  expect(result.before.runs[0]).toMatchObject({ runId: "stage-less-active", level: 1, stage: 1 });
  expect(result.before.history[0]).toMatchObject({ runId: "stage-less-complete", level: 1, stage: 1 });
  expect(result.saved).toMatchObject({ stage: 1, nextUnit: 1, nextPhrase: 1, revision: 1 });
  expect(result.after.runs[0]).toMatchObject({ runId: "stage-less-active", stage: 1, revision: 1 });
  expect(result.after.history[0]).toMatchObject({ runId: "stage-less-complete", stage: 1 });
  expect(result.after.settings).toEqual({ speed: 2 });
});

test("study days are validated, deduplicated, and committed atomically with confirmed progress", async ({ page }) => {
  await openPublicStore(page);
  const result = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const lesson = {
      id: "study-day-lesson", version: "2026-09-10T00:00:00.000Z", language: "english" as const,
      name: "Study day", localizedName: "Study day", phraseCount: 12, sectionCount: 2, entries: [], phrases: [],
    };
    const run = await window.deviceStore.startDeviceRun(access, lesson, 3);
    const first = await window.deviceStore.saveDeviceRun(access, { ...run, nextUnit: 1, nextPhrase: 1, confirmedCycles: 1 }, run.revision, "2026-09-09");
    const second = await window.deviceStore.saveDeviceRun(access, { ...first, nextUnit: 2, nextPhrase: 2, confirmedCycles: 2 }, first.revision, "2026-09-09");
    const invalid = await window.deviceStore.saveDeviceRun(access, { ...second, nextUnit: 3, nextPhrase: 3, confirmedCycles: 3 }, second.revision, "2026-02-30")
      .then(() => "accepted", () => "rejected");
    return { invalid, record: await window.deviceStore.readDeviceLearningRecord(access.accountId) };
  });

  expect(result.invalid).toBe("rejected");
  expect(result.record?.studyDays).toEqual(["2026-09-09"]);
  expect(result.record?.runs[0]).toMatchObject({ nextUnit: 2, nextPhrase: 2, confirmedCycles: 2, revision: 2 });
});

test("missing study days stay empty and malformed legacy dates are rejected", async ({ page }) => {
  await openPublicStore(page);
  const result = await page.evaluate(async () => {
    const { writer: access } = await window.deviceStore.readDeviceLearningState(window.deviceAccess.readDeviceAccess()!);
    const write = (studyDays?: unknown) => new Promise<void>((resolve, reject) => {
      const open = indexedDB.open(window.deviceStore.DEVICE_LEARNING_DATABASE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction("accounts", "readwrite");
        tx.objectStore("accounts").put({ schemaVersion: 2, accountId: access.accountId, preferredLevel: 1, settings: {}, runs: [], history: [], ...(studyDays === undefined ? {} : { studyDays }) });
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    await write();
    const missing = await window.deviceStore.readDeviceLearningRecord(access.accountId);
    await write(["2026-09-09", "2026-02-30"]);
    const malformed = await window.deviceStore.readDeviceLearningRecord(access.accountId).then(() => "accepted", () => "rejected");
    return { missing, malformed };
  });

  expect(result.missing?.studyDays).toEqual([]);
  expect(result.malformed).toBe("rejected");
});
