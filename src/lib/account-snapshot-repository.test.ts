// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const { createClient, query, result } = vi.hoisted(() => {
  const result = { data: null as unknown, error: null as unknown };
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), upsert: vi.fn() };
  return { createClient: vi.fn(), query, result };
});
vi.mock("server-only", () => ({}));
vi.mock("./supabase/server", () => ({ createServerSupabaseClient: createClient }));
import { readAccountSnapshot, writeAccountSnapshot } from "./account-snapshot-repository";
import { SNAPSHOT_MAX_BYTES, type AccountSnapshot } from "./account-snapshot";
import { DEFAULT_SESSION_SETTINGS } from "./session-settings";

const accountId = "11111111-1111-4111-8111-111111111111";
const snapshot = { schemaVersion: 1 as const, accountId, preferredLevel: 1, settings: {}, runs: [], history: [], studyDays: [] };

beforeEach(() => {
  vi.resetAllMocks();
  result.data = null;
  result.error = null;
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => result);
  query.upsert.mockImplementation(async () => result);
  createClient.mockResolvedValue({ from: vi.fn(() => query) });
});

it("reads through the authenticated request-bound client and validates stored JSON", async () => {
  result.data = { schema_version: 1, snapshot };
  expect(await readAccountSnapshot(accountId)).toEqual(snapshot);
  expect(query.select).toHaveBeenCalledWith("schema_version,snapshot");
  expect(query.eq).toHaveBeenCalledWith("account_id", accountId);
});

it("distinguishes absence from unavailable or invalid stored state", async () => {
  expect(await readAccountSnapshot(accountId)).toBeNull();
  result.error = { message: "private database detail" };
  await expect(readAccountSnapshot(accountId)).rejects.toThrow("could not be loaded");
  result.error = null;
  result.data = { schema_version: 1, snapshot: { ...snapshot, schemaVersion: 2 } };
  await expect(readAccountSnapshot(accountId)).rejects.toThrow();
});

it("atomically upserts the complete validated snapshot with owner-derived columns", async () => {
  await writeAccountSnapshot(accountId, snapshot);
  expect(query.upsert).toHaveBeenCalledWith({ account_id: accountId, schema_version: 1, snapshot }, { onConflict: "account_id" });
});

it("accepts and stores a valid snapshot immediately below the compact 2 MiB limit", async () => {
  const nearLimit: AccountSnapshot = {
    ...snapshot,
    runs: [{
      runId: "near-limit", lessonId: "lesson", lessonVersion: "2026-09-10T00:00:00.000Z",
      lessonName: "", language: "english", level: 1, stage: 2, nextUnit: 0, nextPhrase: 0,
      activeMs: 0, settings: DEFAULT_SESSION_SETTINGS, confirmedCycles: 0,
    }],
  };
  const baseBytes = new TextEncoder().encode(JSON.stringify(nearLimit)).byteLength;
  nearLimit.runs[0].lessonName = "x".repeat(SNAPSHOT_MAX_BYTES - baseBytes - 1);
  expect(new TextEncoder().encode(JSON.stringify(nearLimit)).byteLength).toBe(SNAPSHOT_MAX_BYTES - 1);
  await writeAccountSnapshot(accountId, nearLimit);
  expect(query.upsert).toHaveBeenCalledWith({ account_id: accountId, schema_version: 1, snapshot: nearLimit }, { onConflict: "account_id" });
  result.data = { schema_version: 1, snapshot: nearLimit };
  expect(await readAccountSnapshot(accountId)).toEqual(nearLimit);
});

it("fails closed when no authenticated request client is configured", async () => {
  createClient.mockResolvedValueOnce(null);
  await expect(readAccountSnapshot(accountId)).rejects.toThrow("unavailable");
  createClient.mockResolvedValueOnce(null);
  await expect(writeAccountSnapshot(accountId, snapshot)).rejects.toThrow("unavailable");
});
