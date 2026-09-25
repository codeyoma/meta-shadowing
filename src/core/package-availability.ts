import type { DeliveryStatus } from '../../modules/package-delivery';
import type { PackageStorageStatus } from './package-storage';

export type MaterialSnapshot = Readonly<{
  storage: PackageStorageStatus | null;
  delivery: DeliveryStatus | null;
  reading: boolean;
  changing: boolean;
  failed: boolean;
}>;

/** Shared browsing state, not authorization. Native files remain the durable truth. */
export class PackageAvailability {
  private snapshot: MaterialSnapshot = { storage: null, delivery: null, reading: true, changing: false, failed: false };
  private listeners = new Set<() => void>();
  private started = false;
  private pending?: Promise<PackageStorageStatus | null>;
  private cancelPoll?: () => void;
  private observing = true;
  constructor(private readonly read: (changing: boolean) => Promise<{
    storage?: PackageStorageStatus; delivery: DeliveryStatus | null;
  }>, private readonly schedule: (callback: () => void) => () => void) {}

  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.started) { this.started = true; void this.refresh(); }
    return () => { this.listeners.delete(listener); };
  };
  private publish(value: Partial<MaterialSnapshot>) {
    this.snapshot = { ...this.snapshot, ...value };
    for (const listener of this.listeners) listener();
  }
  refresh = (): Promise<PackageStorageStatus | null> => {
    this.started = true;
    if (this.pending) return this.pending;
    this.cancelPoll?.(); this.cancelPoll = undefined;
    this.publish({ reading: true });
    this.pending = this.read(this.snapshot.changing).then(value => {
      this.publish({ ...value, failed: false });
      return this.snapshot.storage;
    }, () => {
      this.publish({ storage: null, failed: true });
      return null;
    }).finally(() => {
      this.pending = undefined;
      this.publish({ reading: false });
      const phase = this.snapshot.delivery?.phase;
      if (this.observing && (this.snapshot.changing || this.snapshot.storage?.busy
        || phase === 'downloading' || phase === 'installing' || phase === 'cancelling')) {
        this.cancelPoll = this.schedule(() => { void this.refresh(); });
      }
    });
    return this.pending;
  };

  /** Serialize file mutations after outstanding reads. Completion refreshes every subscriber. */
  async change<T>(operation: () => Promise<T>): Promise<T> {
    if (this.snapshot.changing) throw Error('A package operation is still running.');
    this.publish({ changing: true });
    await this.pending;
    try {
      const operationResult = operation();
      void this.refresh();
      return await operationResult;
    } finally {
      // Drain a delivery-status poll before the final, authoritative storage read.
      await this.pending;
      this.publish({ changing: false });
      await this.refresh();
    }
  }

  setObserving(active: boolean) {
    if (active === this.observing) return;
    this.observing = active;
    if (!active) { this.cancelPoll?.(); this.cancelPoll = undefined; }
    else if (this.started) {
      // A pre-background read may return an obsolete result. Reconcile after it,
      // rather than mistaking that in-flight request for a fresh foreground read.
      if (this.pending) void this.pending.then(() => { if (this.observing) void this.refresh(); });
      else void this.refresh();
    }
  }
}
