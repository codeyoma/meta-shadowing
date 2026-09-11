import { assertDeviceAccess, clearDeviceAccess, subscribeDeviceAccess, type DeviceAccess } from "./device-access";
import { exportAccountSnapshot, parseAccountSnapshot, snapshotHasContent, type AccountSnapshot } from "./account-snapshot";
import { readDeviceLearningState, replaceDeviceSnapshot, recoverDeviceSnapshot } from "./device-learning-store";
import { parseLearningMerge } from "./learning-merge";
import { LearningSyncError, type LearningSyncFailureCode } from "./device-learning-sync";

export type TransferState = { phase: "idle" | "busy" | "confirm-download" | "confirm-recovery" | "error"; message?: string; problem?: LearningSyncFailureCode };

/** A single, disposable account/epoch scope. Pending payloads exist only in memory. */
export function createAccountSnapshotTransfer(identity: DeviceAccess, changed: (state: TransferState) => void, flush?: () => Promise<void>) {
  const access = { ...identity };
  let state: TransferState = { phase: "idle" };
  let pending: AccountSnapshot | undefined;
  let request: AbortController | undefined;
  let disposed = false;
  const publish = (next: TransferState) => { state = next; if (!disposed) changed(next); };
  const check = () => { if (disposed || request?.signal.aborted) throw new Error("Transfer ended"); assertDeviceAccess(access); };
  const unsubscribe = subscribeDeviceAccess(() => { try { check(); } catch { dispose(); } });
  function dispose() { disposed = true; request?.abort(); pending = undefined; unsubscribe(); }
  async function send(init: RequestInit = {}) {
    const signal = AbortSignal.any([request!.signal, AbortSignal.timeout(10_000)]);
    const response = await fetch("/api/learner/snapshot", { ...init, cache: "no-store", signal }); check();
    if (response.status === 401 || response.status === 403) { clearDeviceAccess(); throw new Error("Access rejected"); }
    if (response.status === 409) {
      const result = await response.clone().json(); check();
      if (result?.error === "account-changed") { clearDeviceAccess(); throw new Error("Access rejected"); }
      if (result?.error === "options-conflict") throw new Error("options-conflict");
    }
    return response;
  }
  async function cloudOptions() {
    const response = await send();
    if (!response.ok) throw new Error("Read failed");
    const result = await response.json(); check();
    if (!Number.isSafeInteger(result?.optionsRevision) || result.optionsRevision < 0) throw new Error("Invalid revision");
    return { optionsRevision: result.optionsRevision as number, snapshot: result.snapshot === null ? null : parseAccountSnapshot(result.snapshot, access.accountId) };
  }
  async function run(action: () => Promise<void>, upload = false) {
    if (disposed || state.phase === "busy" || state.phase.startsWith("confirm")) return;
    request = new AbortController();
    publish({ phase: "busy" });
    try { check(); await action(); check(); }
    catch (error) {
      pending = undefined;
      try { check(); } catch { dispose(); return; }
      publish({ phase: "error", ...(error instanceof LearningSyncError ? { problem: error.code } : {}), message: error instanceof Error && error.message === "options-conflict"
        ? "다른 기기에서 계정 설정이 바뀌었습니다. 계정 설정을 유지했습니다. 이 기기 설정을 보내려면 다시 동기화해 주세요."
        : upload
        ? "업로드 결과를 확인하지 못했습니다. 서버에 저장되었을 수 있습니다. 연결을 확인한 뒤 직접 다시 시도해 주세요."
        : "학습 기록을 가져오거나 복구하지 못했습니다. 기기 기록은 교체하지 않았습니다. 연결과 저장 공간을 확인한 뒤 다시 시도해 주세요." });
    }
  }
  return {
    get state() { return state; },
    dispose,
    cancel() { if (state.phase.startsWith("confirm")) { pending = undefined; publish({ phase: "idle" }); } },
    upload() { return run(async () => {
      if (!flush) throw new Error("Sync unavailable");
      await flush(); check();
      const { record } = await readDeviceLearningState(access); check();
      const snapshot = record ? parseAccountSnapshot(exportAccountSnapshot(record), access.accountId)
        : { preferredLevel: 1, settings: {} };
      const { optionsRevision } = await cloudOptions();
      const batch = parseLearningMerge({ protocolVersion: 1, accountId: access.accountId, runs: [], history: [], studyDays: [],
        options: { expectedRevision: optionsRevision, preferredLevel: snapshot.preferredLevel, settings: snapshot.settings } }, access.accountId);
      try {
        const response = await send({ method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(batch) });
        if (!response.ok) throw new Error("Upload unconfirmed");
        const result = await response.json(); check();
        if (result?.updated !== true || result.optionsRevision !== optionsRevision + 1) throw new Error("Upload unconfirmed");
      } catch (error) {
        check();
        if (error instanceof Error && error.message === "options-conflict") throw error;
        // Learning retries are idempotent; an options mutation is not. Read back,
        // including the exact next revision, and never retry this PUT implicitly.
        const saved = await cloudOptions();
        if (saved.optionsRevision !== optionsRevision + 1 || !saved.snapshot
          || saved.snapshot.preferredLevel !== snapshot.preferredLevel
          || Object.keys({ ...saved.snapshot.settings, ...snapshot.settings }).some(key =>
            saved.snapshot!.settings[key as keyof typeof snapshot.settings] !== snapshot.settings[key as keyof typeof snapshot.settings])) throw new Error("Upload unconfirmed");
      }
      publish({ phase: "idle" });
    }, true); },
    download() { return run(async () => {
      const response = await send();
      if (!response.ok) throw new Error("Download failed");
      const result = await response.json(); check();
      if (result?.snapshot === null) { publish({ phase: "error", message: "계정에 저장된 학습 기록이 없습니다." }); return; }
      const snapshot = parseAccountSnapshot(result?.snapshot, access.accountId);
      if (!snapshotHasContent(snapshot)) { publish({ phase: "error", message: "빈 학습 기록으로 기기 기록을 교체할 수 없습니다." }); return; }
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
        publish({ phase: "idle" });
      });
    },
  };
}
