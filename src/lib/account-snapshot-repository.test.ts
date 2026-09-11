// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { createClient, query, result, rpc } = vi.hoisted(() => {
  const result = { data: null as unknown, error: null as unknown };
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  return { createClient: vi.fn(), query, result, rpc: vi.fn() };
});
vi.mock("server-only", () => ({}));
vi.mock("./supabase/server", () => ({ createServerSupabaseClient: createClient }));
import { readAccountSnapshot, writeAccountSnapshot } from "./account-snapshot-repository";
import { type LearningMerge } from "./learning-merge";
const accountId = "11111111-1111-4111-8111-111111111111";
const snapshot = { schemaVersion: 1 as const, accountId, preferredLevel: 1, settings: {}, runs: [], history: [], studyDays: [] };
const merge: LearningMerge = { protocolVersion: 1, accountId, runs: [], history: [], studyDays: [] };

beforeEach(() => {
  vi.resetAllMocks(); result.data = null; result.error = null;
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  query.maybeSingle.mockImplementation(async () => result);
  rpc.mockResolvedValue({ data: { optionsRevision: 0 }, error: null });
  createClient.mockResolvedValue({ from: vi.fn(() => query), rpc });
});
it("loads validated owner data and its options revision through the request client", async () => {
  result.data = { schema_version: 1, snapshot, options_revision: 3 };
  expect(await readAccountSnapshot(accountId)).toEqual({ snapshot, optionsRevision: 3 });
  expect(query.select).toHaveBeenCalledWith("schema_version,snapshot,options_revision");
  expect(query.eq).toHaveBeenCalledWith("account_id", accountId);
});
it("distinguishes no row with revision zero from unavailable or invalid stored state", async () => {
  expect(await readAccountSnapshot(accountId)).toEqual({ snapshot: null, optionsRevision: 0 });
  result.error = { message: "private database detail" };
  await expect(readAccountSnapshot(accountId)).rejects.toThrow("could not be loaded");
  result.error = null;
  result.data = { schema_version: 1, snapshot: { ...snapshot, schemaVersion: 2 }, options_revision: 0 };
  await expect(readAccountSnapshot(accountId)).rejects.toThrow();
  result.data = { schema_version: 1, snapshot, options_revision: -1 };
  await expect(readAccountSnapshot(accountId)).rejects.toThrow();
});
it("sends the validated versioned batch to one authenticated RPC", async () => {
  expect(await writeAccountSnapshot(accountId, merge)).toEqual({ optionsRevision: 0 });
  expect(rpc).toHaveBeenCalledWith("merge_learning_snapshot", { batch: merge });
});
it("rejects the legacy snapshot and foreign account before calling storage", async () => {
  await expect(writeAccountSnapshot(accountId, snapshot as unknown as LearningMerge)).rejects.toMatchObject({ code: "client-update-required" });
  await expect(writeAccountSnapshot("other", merge)).rejects.toMatchObject({ code: "account-changed" });
  expect(rpc).not.toHaveBeenCalled();
});
it.each([["P1001", "invalid-merge"], ["P1002", "client-update-required"], ["P1003", "options-conflict"], ["P1004", "account-changed"], ["P1005", "merge-limit"], ["42501", "unauthorized"]])("maps database %s to a stable safe code", async (code, expected) => {
  rpc.mockResolvedValue({ data: null, error: { code, message: "sensitive database detail" } });
  await expect(writeAccountSnapshot(accountId, merge)).rejects.toMatchObject({ code: expected, message: expected });
});
it("keeps unknown persistence errors transient and never acknowledges malformed RPC responses", async () => {
  rpc.mockResolvedValueOnce({ data: null, error: { code: "XX000", message: "sensitive detail" } });
  await expect(writeAccountSnapshot(accountId, merge)).rejects.toMatchObject({ message: "snapshot-save-failed" });
  rpc.mockResolvedValueOnce({ data: null, error: null });
  await expect(writeAccountSnapshot(accountId, merge)).rejects.toMatchObject({ message: "snapshot-save-failed" });
});
it("does not resolve an acknowledgement before the database request finishes", async () => {
  let commit!: (value: unknown) => void;
  rpc.mockReturnValue(new Promise(resolve => { commit = resolve; }));
  let acknowledged = false;
  const pending = writeAccountSnapshot(accountId, merge).then(() => { acknowledged = true; });
  await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
  expect(acknowledged).toBe(false);
  commit({ data: { optionsRevision: 1 }, error: null });
  await pending;
  expect(acknowledged).toBe(true);
});
it("fails closed without a configured authenticated client", async () => {
  createClient.mockResolvedValueOnce(null);
  await expect(readAccountSnapshot(accountId)).rejects.toThrow("unavailable");
  createClient.mockResolvedValueOnce(null);
  await expect(writeAccountSnapshot(accountId, merge)).rejects.toThrow("snapshot-save-failed");
});
