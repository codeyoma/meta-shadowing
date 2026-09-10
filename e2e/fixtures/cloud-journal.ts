import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { assertLocalSupabaseUrl } from "./local-supabase-google";
import type { Journal } from "../../src/lib/learning-records";

export const fixtureVersion = "2026-09-01T00:00:00+00:00";
export function fixtureRunId(value: string) {
  if (/^[\da-f]{8}-([\da-f]{4}-){3}[\da-f]{12}$/i.test(value)) return value;
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0,8)}-${hash.slice(8,12)}-4${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
}

/** Real database setup for history/layout scenarios, never a persistence mock. */
export async function seedServerJournal(page: Page, journal: Partial<Journal>) {
  const url = process.env.SUPABASE_INTEGRATION_URL!; assertLocalSupabaseUrl(url);
  const service = createClient(url, process.env.SUPABASE_INTEGRATION_SECRET_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
  const response = await page.request.get("/api/learner/preferences");
  expect(response.status()).toBe(200);
  const { profile } = await response.json();
  const userId = profile.accountId;
  const normalize = <T extends NonNullable<Journal["progress"]>>(record: T) => ({ ...record, runId: fixtureRunId(record.runId), lessonVersion: record.lessonVersion === "fixture-v1" ? fixtureVersion : record.lessonVersion });
  expect((await service.from("learner_practice_runs").update({ status: "abandoned" }).eq("user_id", userId)).error).toBeNull();
  const progress = journal.progress ? normalize(journal.progress) : null;
  const rows = [
    ...(journal.history ?? []).map(record => ({ user_id: userId, run_id: fixtureRunId(record.runId), record: normalize(record), status: "completed" })),
    ...(progress ? [{ user_id: userId, run_id: progress.runId, record: progress, status: "active" }] : []),
  ];
  if (rows.length) expect((await service.from("learner_practice_runs").upsert(rows)).error).toBeNull();
  expect((await service.from("learner_practice_accounts").upsert({ user_id: userId, run_id: progress?.runId ?? null, generation: 0, revision: 0, instance: null, lease_until: null })).error).toBeNull();
  if (journal.studyDays?.length) expect((await service.from("learner_study_days").upsert(journal.studyDays.map(day => ({ user_id: userId, day })), { ignoreDuplicates: true })).error).toBeNull();
}

/** Presentation fixture: device-authoritative level one, legacy server levels 2–8.
 * Explicit seeding is test setup, never a production migration/read fallback. */
export async function seedLearningJournal(page: Page, journal: Partial<Journal>) {
  await seedServerJournal(page, { ...journal, progress: journal.progress?.level === 1 ? null : journal.progress,
    history: journal.history?.filter(record => record.level !== 1) });
  const { profile } = await (await page.request.get("/api/learner/preferences")).json();
  const normalize = <T extends NonNullable<Journal["progress"]>>(record: T) => ({ ...record,
    runId: fixtureRunId(record.runId), lessonVersion: record.lessonVersion === "fixture-v1" ? fixtureVersion : record.lessonVersion,
    revision: 0, confirmedCycles: 0,
  });
  if (!/^https?:/.test(page.url())) await page.goto("/offline");
  await page.evaluate(async ({ accountId, progress, history }) => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("meta-shadowing-device-learning-v1", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("accounts", { keyPath: "accountId" });
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction("accounts", "readwrite"), store = tx.objectStore("accounts");
        const read = store.get(accountId);
        read.onsuccess = () => store.put({ accountId, preferredLevel: 1, settings: {}, ...read.result, schemaVersion: 2,
          runs: progress ? [progress] : [], ...(history ? { history } : {}) });
        tx.oncomplete = () => { request.result.close(); window.dispatchEvent(new Event("device-learning-changed")); resolve(); };
        tx.onerror = tx.onabort = () => reject(tx.error);
      };
    });
  }, { accountId: profile.accountId, progress: journal.progress?.level === 1 ? normalize(journal.progress) : null,
    history: journal.history?.filter(record => record.level === 1).map(normalize) });
}
