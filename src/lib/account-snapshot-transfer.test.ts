import { afterEach, expect, it, vi } from "vitest";
import { createAccountSnapshotTransfer } from "./account-snapshot-transfer";

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });
it("fetches only explicitly and discards a confirmed candidate when cancelled", async () => {
  const access = { accountId: "a", epoch: "one" };
  localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(access));
  const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ snapshot: {
    schemaVersion: 1, accountId: "a", preferredLevel: 4, settings: {}, runs: [], history: [], studyDays: [],
  } })));
  vi.stubGlobal("fetch", fetcher);
  const transfer = createAccountSnapshotTransfer(access, () => {});
  expect(fetcher).not.toHaveBeenCalled();
  await transfer.download();
  expect(transfer.state.phase).toBe("confirm-download");
  expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: "no-store" });
  transfer.cancel();
  expect(transfer.state.phase).toBe("idle");
  await transfer.confirm();
  expect(transfer.state.phase).toBe("idle");
  transfer.dispose();
});

it.each([null, { schemaVersion: 1, accountId: "a", preferredLevel: 1, settings: {}, runs: [], history: [], studyDays: [] }, { accountId: "a" }, { schemaVersion: 1, accountId: "b", preferredLevel: 4, settings: {}, runs: [], history: [], studyDays: [] }])("never offers replacement of absent, empty, malformed or foreign data", async snapshot => {
  const access = { accountId: "a", epoch: "one" };
  localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(access));
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ snapshot }))));
  const transfer = createAccountSnapshotTransfer(access, () => {});
  await transfer.download();
  expect(transfer.state.phase).not.toBe("confirm-download");
  transfer.dispose();
});

it.each(["account", "epoch", "dispose"])("ignores a held response after %s changes and disallows duplicate requests", async kind => {
  const access = { accountId: "a", epoch: "one" };
  localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify(access));
  let release!: (response: Response) => void;
  const fetcher = vi.fn().mockReturnValue(new Promise<Response>(resolve => { release = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const changed = vi.fn();
  const transfer = createAccountSnapshotTransfer(access, changed);
  const held = transfer.download();
  await transfer.download();
  expect(fetcher).toHaveBeenCalledTimes(1);
  if (kind === "dispose") transfer.dispose();
  else {
    localStorage.setItem("meta-shadowing:device-access:v1", JSON.stringify({ accountId: kind === "account" ? "b" : "a", epoch: "two" }));
    window.dispatchEvent(new Event("device-access-changed"));
  }
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  release(new Response(JSON.stringify({ snapshot: { schemaVersion: 1, accountId: "a", preferredLevel: 4, settings: {}, runs: [], history: [], studyDays: [] } })));
  await held;
  expect(changed).toHaveBeenCalledTimes(1);
  expect(transfer.state.phase).not.toBe("confirm-download");
  transfer.dispose();
});
