import { assertDeviceAccess, clearDeviceAccess, subscribeDeviceAccess, type DeviceAccess } from "./device-access";
import { acknowledgeLearningSyncBatch, captureLearningSyncBatch } from "./device-learning-store";
import { LearningMergeError, type LearningMerge } from "./learning-merge";

export type LearningSyncProblemCode = "sign-in-required" | "account-changed" | "invalid-merge" | "client-update-required" | "merge-limit";
export type LearningSyncFailureCode = LearningSyncProblemCode | "offline" | "sync-unavailable" | "access-ended";
export class LearningSyncError extends Error {
  constructor(readonly code: LearningSyncFailureCode) { super(code); this.name = "LearningSyncError"; }
}
export type DeviceLearningSync = { flush(): Promise<void>; dispose(): void };
class TransportFailure extends LearningSyncError {
  constructor(code: LearningSyncFailureCode, readonly retryAfter = 0) { super(code); }
}

function serverDelay(value: string | null): number {
  if (!value) return 0;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

function responseFailure(status: number, code: unknown): LearningSyncFailureCode {
  if (status === 401 || status === 403) return "sign-in-required";
  if (status === 426) return "client-update-required";
  if (status === 413) return "merge-limit";
  if (status === 409 && code === "account-changed") return "account-changed";
  if (status >= 400 && status < 500 && status !== 408 && status !== 429) return "invalid-merge";
  return "sync-unavailable";
}

/** One account/epoch lifetime. No network work runs inside a device save. */
export function createDeviceLearningSync(identity: DeviceAccess, onProblem: (code: LearningSyncProblemCode | null) => void): DeviceLearningSync {
  const access = { accountId: identity.accountId, epoch: identity.epoch };
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request: AbortController | undefined;
  let inFlight: Promise<void> | undefined;
  let firstQueuedAt: number | undefined;
  let failures = 0;
  let retryAt = 0;
  let serverNotBefore = 0;
  let problem: LearningSyncProblemCode | null = null;
  let stopped = false;

  function check() {
    if (disposed) throw new LearningSyncError("access-ended");
    try { assertDeviceAccess(access); } catch { throw new LearningSyncError("access-ended"); }
  }
  function publish(next: LearningSyncProblemCode | null) {
    if (!disposed && next !== problem) { problem = next; onProblem(next); }
  }
  function cancelTimer() { if (timer !== undefined) clearTimeout(timer); timer = undefined; }
  function schedule(delay: number) {
    cancelTimer();
    if (disposed || stopped || !navigator.onLine) return;
    const due = Math.max(Date.now() + delay, retryAt, serverNotBefore);
    timer = setTimeout(() => {
      timer = undefined;
      if (Date.now() < Math.max(retryAt, serverNotBefore)) { schedule(0); return; }
      void attempt().catch(() => { /* Background failures have already been classified. */ });
    }, Math.min(2_147_483_647, Math.max(0, due - Date.now())));
  }
  function queued() {
    if (disposed) return;
    stopped = false;
    firstQueuedAt ??= Date.now();
    schedule(Math.min(5000, Math.max(0, firstQueuedAt + 30000 - Date.now())));
  }
  function wake() { if (!stopped) schedule(0); }
  function offline() { cancelTimer(); }

  async function send(body: LearningMerge) {
    check();
    request = new AbortController();
    const controller = request;
    const timeout = setTimeout(() => controller.abort(), 10000);
    let abort: (() => void) | undefined;
    try {
      const cancelled = new Promise<never>((_, reject) => {
        abort = () => reject(new LearningSyncError(disposed ? "access-ended" : "sync-unavailable"));
        controller.signal.addEventListener("abort", abort, { once: true });
      });
      await Promise.race([cancelled, (async () => {
        const response = await fetch("/api/learner/snapshot", {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
          cache: "no-store", credentials: "same-origin", signal: controller.signal,
        });
        check();
        const result: unknown = await response.json().catch(() => null);
        check();
        if (!response.ok) throw new TransportFailure(responseFailure(response.status, (result as { error?: unknown } | null)?.error), serverDelay(response.headers.get("Retry-After")));
        if (!result || typeof result !== "object" || !("updated" in result) || result.updated !== true
          || !("optionsRevision" in result) || !Number.isSafeInteger(result.optionsRevision) || Number(result.optionsRevision) < 0) throw new LearningSyncError("sync-unavailable");
      })()]);
    } finally {
      clearTimeout(timeout);
      if (abort) controller.signal.removeEventListener("abort", abort);
      if (request === controller) request = undefined;
    }
  }

  async function drain() {
    check();
    cancelTimer();
    firstQueuedAt = undefined;
    for (;;) {
      check();
      if (!navigator.onLine) throw new LearningSyncError("offline");
      const batch = await captureLearningSyncBatch(access);
      check();
      if (!batch) { failures = 0; retryAt = 0; cancelTimer(); firstQueuedAt = undefined; publish(null); return; }
      if (!navigator.onLine) throw new LearningSyncError("offline");
      await send(batch.request);
      check();
      await acknowledgeLearningSyncBatch(batch);
      // A save during transport has a newer sequence; capture and send it next.
    }
  }

  function failed(cause: unknown): never {
    const error = cause instanceof LearningSyncError ? cause
      : cause instanceof LearningMergeError ? new LearningSyncError(cause.code === "options-conflict" ? "invalid-merge" : cause.code)
      : new LearningSyncError("sync-unavailable");
    if (disposed || error.code === "access-ended") { dispose(); throw new LearningSyncError("access-ended"); }
    if (error.code === "offline") { cancelTimer(); throw error; }
    if (error.code === "sync-unavailable") {
      const base = Math.min(60000, 2000 * 2 ** Math.min(failures++, 5));
      retryAt = Date.now() + Math.min(60000, base * (1 + Math.random() * 0.2));
      serverNotBefore = Math.max(serverNotBefore, Date.now() + (cause instanceof TransportFailure ? cause.retryAfter : 0));
      schedule(0);
    } else {
      stopped = true; cancelTimer(); publish(error.code);
      if (error.code === "sign-in-required" || error.code === "account-changed") {
        // Never let a delayed response sign out a different account/session.
        try { check(); clearDeviceAccess(); } catch { dispose(); }
      }
    }
    throw error;
  }

  function attempt(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = drain().catch(failed).finally(() => { inFlight = undefined; });
    return inFlight;
  }
  function dispose() {
    if (disposed) return;
    disposed = true; cancelTimer(); request?.abort(); unsubscribe();
    window.removeEventListener("device-learning-queued", queued);
    window.removeEventListener("online", wake); window.removeEventListener("focus", wake); window.removeEventListener("offline", offline);
  }
  const unsubscribe = subscribeDeviceAccess(() => { try { check(); } catch { dispose(); } });
  window.addEventListener("device-learning-queued", queued);
  window.addEventListener("online", wake); window.addEventListener("focus", wake); window.addEventListener("offline", offline);
  queued();
  return {
    flush() {
      try { check(); } catch (error) { return Promise.reject(error); }
      if (inFlight) return inFlight;
      if (!navigator.onLine) return Promise.reject(new LearningSyncError("offline"));
      if (Date.now() < serverNotBefore) return Promise.reject(new LearningSyncError("sync-unavailable"));
      stopped = false; retryAt = 0;
      return attempt();
    },
    dispose,
  };
}
