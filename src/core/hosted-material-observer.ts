import type { DeliveryStatus } from '../../modules/package-delivery';

/** A focused card owns its polling, including when another card started delivery. */
export function observeHostedMaterial({ readDelivery, publish, refreshStorage, schedule }: {
  readDelivery(): Promise<DeliveryStatus>;
  publish(status: DeliveryStatus): void;
  refreshStorage(): Promise<{ busy: boolean } | null | void>;
  schedule(callback: () => Promise<void>): () => void;
}) {
  let active = true;
  let first = true;
  let cancelTimer: (() => void) | undefined;
  let pending: Promise<void> | undefined;
  async function observe() {
    cancelTimer?.();
    cancelTimer = undefined;
    let busy = true;
    try {
      const status = await readDelivery();
      if (!active) return;
      busy = ['downloading', 'installing', 'cancelling'].includes(status.phase);
      publish(status);
      if (first || !busy) {
        const storage = await refreshStorage();
        busy = busy || !!storage?.busy;
      }
      first = false;
    } catch {
      // A transient status failure must not stop observing an active download.
      if (active && first) publish({ phase: 'failed', progress: 0 });
    }
    if (active && busy) cancelTimer = schedule(refresh);
  }
  function refresh(): Promise<void> {
    if (!active) return Promise.resolve();
    if (!pending) pending = observe().finally(() => { pending = undefined; });
    return pending;
  }
  return { refresh, dispose() { active = false; cancelTimer?.(); } };
}
