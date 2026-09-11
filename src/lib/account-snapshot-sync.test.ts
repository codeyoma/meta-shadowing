import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createAccountSnapshotTransfer } from "./account-snapshot-transfer";
import { readDeviceAccess } from "./device-access";
import { LearningSyncError } from "./device-learning-sync";
import { readDeviceLearningState } from "./device-learning-store";

vi.mock("./device-learning-store", () => ({
  readDeviceLearningState: vi.fn(async () => ({ record: { accountId: "a", preferredLevel: 4, settings: {}, runs: [], history: [], studyDays: [] } })),
  replaceDeviceSnapshot: vi.fn(), recoverDeviceSnapshot: vi.fn(),
}));
const access = { accountId: "a", epoch: "one" };
const snapshot = { schemaVersion: 1, accountId: "a", preferredLevel: 4, settings: {}, runs: [], history: [], studyDays: [] };
beforeEach(() => localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(access)));
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

it("flushes learning and explicitly CAS transfers options with no success notice", async () => {
  const calls: { method: string; body?: unknown }[] = [];
  let flushed = false;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    expect(flushed).toBe(true);
    calls.push({ method: init.method ?? "GET", body: init.body ? JSON.parse(String(init.body)) : undefined });
    return Response.json(init.method === "PUT" ? { updated: true, optionsRevision: 8 } : { snapshot: null, optionsRevision: 7 });
  });
  const transfer = createAccountSnapshotTransfer(access, () => {}, async () => { flushed = true; });
  await transfer.upload();
  expect(transfer.state).toEqual({ phase: "idle" });
  expect(calls).toEqual([{ method: "GET", body: undefined }, { method: "PUT", body: {
    protocolVersion: 1, accountId: "a", runs: [], history: [], studyDays: [],
    options: { expectedRevision: 7, preferredLevel: 4, settings: {} },
  } }]);
  transfer.dispose();
});

it.each(["lost-response", "malformed-response"])("reads back %s without replaying an options write", async failure => {
  let gets = 0, puts = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    if (init.method === "PUT") { puts++; if (failure === "lost-response") throw new TypeError("lost"); return Response.json({}); }
    gets++;
    return Response.json({ snapshot: gets === 1 ? null : snapshot, optionsRevision: gets === 1 ? 7 : 8 });
  });
  const transfer = createAccountSnapshotTransfer(access, () => {}, async () => {});
  await transfer.upload();
  expect({ gets, puts }).toEqual({ gets: 2, puts: 1 });
  expect(transfer.state).toEqual({ phase: "idle" });
  transfer.dispose();
});

it("preserves conflicting cloud options and requires a fresh explicit attempt", async () => {
  let puts = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    if (init.method === "PUT") { puts++; return Response.json({ error: "options-conflict" }, { status: 409 }); }
    return Response.json({ snapshot, optionsRevision: 7 });
  });
  const transfer = createAccountSnapshotTransfer(access, () => {}, async () => {});
  await transfer.upload();
  expect(puts).toBe(1);
  expect(transfer.state.phase).toBe("error");
  expect(transfer.state.message).toContain("다른 기기");
  transfer.dispose();
});

it("does not claim success or replay when read-back does not prove the uncertain write", async () => {
  let puts = 0;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    if (init.method === "PUT") { puts++; throw new TypeError("lost"); }
    return Response.json({ snapshot, optionsRevision: 7 });
  });
  const transfer = createAccountSnapshotTransfer(access, () => {}, async () => {});
  await transfer.upload();
  expect(puts).toBe(1);
  expect(transfer.state.phase).toBe("error");
  transfer.dispose();
});

it.each([401, 403, 409])("ends rejected access on explicit transfer status %s", async status => {
  vi.stubGlobal("fetch", async () => Response.json({ error: "account-changed" }, { status }));
  const transfer = createAccountSnapshotTransfer(access, () => {}, async () => {});
  await transfer.upload();
  expect(readDeviceAccess()).toBeNull();
  transfer.dispose();
});

it("preserves the coordinator problem identity for one shared explicit/background dialog", async () => {
  const transfer = createAccountSnapshotTransfer(access, () => {}, async () => { throw new LearningSyncError("merge-limit"); });
  await transfer.upload();
  expect(transfer.state).toMatchObject({ phase: "error", problem: "merge-limit" });
  transfer.dispose();
});

it("can explicitly sync default options before this device has any learning record", async () => {
  vi.mocked(readDeviceLearningState).mockResolvedValueOnce({ record: null, writer: { accountId: "a", epoch: "one", generation: "legacy" } });
  let sent: unknown;
  vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
    if (init.method === "PUT") { sent = JSON.parse(String(init.body)); return Response.json({ updated: true, optionsRevision: 1 }); }
    return Response.json({ snapshot: null, optionsRevision: 0 });
  });
  const transfer = createAccountSnapshotTransfer(access, () => {}, async () => {});
  await transfer.upload();
  expect(transfer.state).toEqual({ phase: "idle" });
  expect(sent).toMatchObject({ options: { expectedRevision: 0, preferredLevel: 1, settings: {} } });
  transfer.dispose();
});
