import { assertDeviceAccess, subscribeDeviceAccess, type DeviceAccess } from "./device-access";
import { exportAccountSnapshot, parseAccountSnapshot, snapshotHasContent, type AccountSnapshot } from "./account-snapshot";
import { readDeviceLearningState, replaceDeviceSnapshot, recoverDeviceSnapshot } from "./device-learning-store";

export type TransferState = { phase: "idle" | "busy" | "confirm-download" | "confirm-recovery" | "success" | "error"; message?: string };

/** A single, disposable account/epoch scope. Pending payloads exist only in memory. */
export function createAccountSnapshotTransfer(identity: DeviceAccess, changed: (state: TransferState) => void) {
  const access = { ...identity };
  let state: TransferState = { phase: "idle" };
  let pending: AccountSnapshot | undefined;
  let request: AbortController | undefined;
  let disposed = false;
  const publish = (next: TransferState) => { state = next; if (!disposed) changed(next); };
  const check = () => { if (disposed || request?.signal.aborted) throw new Error("Transfer ended"); assertDeviceAccess(access); };
  const unsubscribe = subscribeDeviceAccess(() => { try { check(); } catch { dispose(); } });
  function dispose() { disposed = true; request?.abort(); pending = undefined; unsubscribe(); }
  async function run(action: () => Promise<void>, upload = false) {
    if (disposed || state.phase === "busy" || state.phase.startsWith("confirm")) return;
    request = new AbortController();
    publish({ phase: "busy" });
    try { check(); await action(); check(); }
    catch {
      pending = undefined;
      try { check(); } catch { dispose(); return; }
      publish({ phase: "error", message: upload
        ? "업로드 결과를 확인하지 못했습니다. 서버에 저장되었을 수 있습니다. 연결을 확인한 뒤 직접 다시 시도해 주세요."
        : "학습 기록을 가져오거나 복구하지 못했습니다. 기기 기록은 교체하지 않았습니다. 연결과 저장 공간을 확인한 뒤 다시 시도해 주세요." });
    }
  }
  return {
    get state() { return state; },
    dispose,
    cancel() { if (state.phase.startsWith("confirm")) { pending = undefined; publish({ phase: "idle" }); } },
    upload() { return run(async () => {
      const { record } = await readDeviceLearningState(access); check();
      if (!record) throw new Error("No local record");
      const snapshot = parseAccountSnapshot(exportAccountSnapshot(record), access.accountId);
      const response = await fetch("/api/learner/snapshot", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(snapshot), cache: "no-store", signal: request!.signal }); check();
      if (!response.ok) throw new Error("Upload failed");
      const result = await response.json(); check();
      if (result?.updated !== true) throw new Error("Upload unconfirmed");
      publish({ phase: "success", message: "계정에 학습 기록을 업로드했습니다." });
    }, true); },
    download() { return run(async () => {
      const response = await fetch("/api/learner/snapshot", { cache: "no-store", signal: request!.signal }); check();
      if (!response.ok) throw new Error("Download failed");
      const result = await response.json(); check();
      if (result?.snapshot === null) { publish({ phase: "success", message: "계정에 저장된 학습 기록이 없습니다." }); return; }
      const snapshot = parseAccountSnapshot(result?.snapshot, access.accountId);
      if (!snapshotHasContent(snapshot)) { publish({ phase: "success", message: "빈 학습 기록으로 기기 기록을 교체할 수 없습니다." }); return; }
      pending = snapshot;
      publish({ phase: "confirm-download" });
    }); },
    recovery() { if (!disposed && state.phase !== "busy" && !state.phase.startsWith("confirm")) { check(); publish({ phase: "confirm-recovery" }); } },
    async confirm() {
      const phase = state.phase;
      if (phase !== "confirm-download" && phase !== "confirm-recovery") return;
      const candidate = pending; pending = undefined;
      state = { phase: "idle" };
      await run(async () => {
        check();
        if (phase === "confirm-download") {
          if (!candidate) throw new Error("No candidate");
          await replaceDeviceSnapshot(access, candidate, request!.signal);
        } else await recoverDeviceSnapshot(access, request!.signal);
        check();
        publish({ phase: "success", message: phase === "confirm-download" ? "기기 학습 기록을 교체했습니다. 이전 기록은 이 기기에서 복구할 수 있습니다." : "이전 기기 학습 기록을 복구했습니다." });
      });
    },
  };
}
