import { ProgressBackupStore, validateProgressBackup, type BackupDatabase } from './progress-backup';
import type { CloudAccount, CloudBackup, ProgressCloud } from '../../modules/progress-cloud';

type Preference = 'settings' | 'selection';
export class ProgressProfiles {
  private db: BackupDatabase;
  private stores = new Map<string, ProgressBackupStore>();
  constructor(private open: (id: string) => BackupDatabase, private random: () => string,
    private legacy: (key: Preference) => string | null = () => null,
    private saveLegacy: (key: Preference, value: string) => void = () => {}) {
    this.db = open('progress-profiles-v1');
    this.db.exec(`CREATE TABLE IF NOT EXISTS profiles(scope TEXT PRIMARY KEY, profile TEXT NOT NULL, enabled INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS active_profile(id INTEGER PRIMARY KEY CHECK(id=1), profile TEXT NOT NULL);
      INSERT OR IGNORE INTO active_profile VALUES(1,'guest');`);
  }
  id(): string { return this.db.first<{ profile: string }>('SELECT profile FROM active_profile WHERE id=1')!.profile; }
  store(id: string): ProgressBackupStore {
    let store = this.stores.get(id);
    if (!store) { store = new ProgressBackupStore(this.open(id)); this.stores.set(id, store); }
    return store;
  }
  current(): ProgressBackupStore { return this.store(this.id()); }
  account(scope: string) { return this.db.first<{ profile: string; enabled: number }>('SELECT profile,enabled FROM profiles WHERE scope=?', scope); }
  create(): string { const id = this.random(); this.store(id); return id; }
  select(id: string, scope?: string, enabled = true): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (scope) this.db.run('INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET profile=excluded.profile,enabled=excluded.enabled', scope, id, enabled ? 1 : 0);
      this.db.run('UPDATE active_profile SET profile=? WHERE id=1', id);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  readValue(key: Preference, id = this.id()): string | null { return id === 'guest' ? this.legacy(key) : this.store(id).readValue(key); }
  saveValue(key: Preference, value: string, id = this.id()): void {
    if (id === 'guest') this.saveLegacy(key, value); else this.store(id).saveValue(key, value);
  }
  guestBackup(): string {
    const backup = JSON.parse(this.store('guest').exportBackup());
    backup.tables.preferences = (['settings', 'selection'] as const).flatMap(key => {
      const value = this.legacy(key); return value === null ? [] : [{ key, value }];
    });
    return JSON.stringify(backup);
  }
}

export type SyncSnapshot = { profile: string; generation: number; status: CloudAccount['status'];
  hasProfile: boolean; enabled: boolean; ready: boolean; busy: boolean; pending: boolean; error: string | null; backups: CloudBackup[] };
export class ProgressSync {
  private generation = 0;
  private scope: string | null = null;
  private listeners = new Set<() => void>();
  private guards = new Set<() => void>();
  private disposed = false;
  private active = true;
  private flight: object | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastPublish = -Infinity;
  private candidates = new Map<string, string>();
  private snapshot: SyncSnapshot;
  constructor(readonly profiles: ProgressProfiles, private cloud: ProgressCloud, private now = () => Date.now()) {
    this.snapshot = { profile: profiles.id(), generation: 0, status: 'unknown', hasProfile: false, enabled: false, ready: false, busy: false, pending: false, error: null, backups: [] };
  }
  getSnapshot = (): SyncSnapshot => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  beforeSwitch(guard: () => void) { this.guards.add(guard); return () => { this.guards.delete(guard); }; }
  private emit(patch: Partial<SyncSnapshot> = {}) {
    this.snapshot = { ...this.snapshot, ...patch, profile: this.profiles.id(), generation: this.generation, pending: this.profiles.current().pending() };
    this.listeners.forEach(listener => listener());
  }
  private valid(generation: number) { return !this.disposed && generation === this.generation; }
  private fail(error: unknown) {
    const message = error instanceof Error ? error.message : '';
    this.emit({ error: /^progress-cloud-(unavailable|accountChanged|offline|quota|permission|conflict|corrupt|tooLarge|storage|busy)$/.test(message) ? message : 'progress-cloud-storage', busy: false });
    this.changed();
  }
  private switch(id: string, scope?: string, enabled = true) {
    if (id !== this.profiles.id()) this.guards.forEach(guard => guard());
    this.profiles.select(id, scope, enabled);
  }
  async refreshAccount() {
    const generation = ++this.generation;
    this.scope = null; this.flight = null; this.candidates.clear();
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    this.emit({ ready: false, enabled: false, hasProfile: false, busy: true, backups: [], error: null });
    // Native invalidation must not wait behind an older network operation.
    void this.cloud.stop().catch(() => {});
    try {
      const account = await this.cloud.account(); if (!this.valid(generation)) return;
      this.emit({ status: account.status });
      if (account.status !== 'available') {
        if (account.status === 'no-account') this.switch('guest');
        this.emit({ busy: false }); return;
      }
      this.scope = account.scope;
      const local = this.profiles.account(account.scope);
      this.switch(local?.profile ?? 'guest'); this.emit({ enabled: !!local?.enabled, hasProfile: !!local });
      const backups = await this.cloud.list(account.scope); if (!this.valid(generation)) return;
      this.candidates = new Map(backups.map((backup, index) => [`${generation}:${index}`, backup.id]));
      this.emit({ ready: true, busy: false, backups: backups.map((backup, index) => ({ ...backup, id: `${generation}:${index}` })) });
      this.changed();
    } catch (error) { if (this.valid(generation)) this.fail(error); }
  }
  async enable(importGuest: boolean, generation = this.generation) {
    if (!this.valid(generation) || !this.scope || !this.snapshot.ready || this.snapshot.busy) return;
    if (this.snapshot.backups.length && !this.profiles.account(this.scope)) { this.emit({ error: 'restore-required' }); return; }
    try {
      const previous = this.profiles.account(this.scope);
      if (!previous) this.guards.forEach(guard => guard());
      const id = previous?.profile ?? this.profiles.create();
      if (!previous && importGuest) this.profiles.store(id).restoreBackup(this.profiles.guestBackup());
      if (!previous && !this.profiles.store(id).hasData()) this.profiles.store(id).saveValue('settings', '{"mode":"manual","rate":1}');
      this.switch(id, this.scope); this.emit({ enabled: true, hasProfile: true, error: null });
      await this.retry();
    } catch (error) { if (this.valid(generation)) this.fail(error); }
  }
  async restore(id: string) {
    const generation = this.generation, scope = this.scope, remote = this.candidates.get(id);
    if (!scope || !remote || !this.snapshot.ready || this.snapshot.busy) return;
    // Recovery is first-use only; later local history must never be replaced.
    if (this.profiles.account(scope)) { this.emit({ error: 'local-profile-exists' }); return; }
    this.emit({ busy: true, error: null });
    try {
      const json = await this.cloud.read(scope, remote); if (!this.valid(generation)) return;
      try { validateProgressBackup(json); } catch { throw Error('progress-cloud-corrupt'); }
      const profile = this.profiles.create(), store = this.profiles.store(profile);
      store.restoreBackup(json); store.acknowledge(store.revision());
      this.switch(profile, scope); this.emit({ enabled: true, hasProfile: true, busy: false });
    } catch (error) { if (this.valid(generation)) this.fail(error); }
  }
  async retry() {
    if (!this.snapshot.ready) { await this.refreshAccount(); return; }
    const generation = this.generation, scope = this.scope;
    if (!scope || !this.snapshot.enabled || this.flight || this.snapshot.busy) return;
    const store = this.profiles.current(); if (!store.pending()) return;
    const flight = {}; this.flight = flight; this.lastPublish = this.now();
    try {
      // Synchronous capture: no JS mutation can run between revision and export.
      const revision = store.revision(), json = store.exportBackup();
      const result = await this.cloud.publish(scope, revision, json);
      if (!this.valid(generation) || this.flight !== flight) return;
      if (result.revision !== revision) throw Error('progress-cloud-corrupt');
      store.acknowledge(revision); this.emit({ error: null });
    } catch (error) { if (this.valid(generation) && this.flight === flight) this.fail(error); }
    finally { if (this.valid(generation) && this.flight === flight) { this.flight = null; this.changed(); } }
  }
  disable(generation = this.generation) {
    if (!this.valid(generation)) return;
    try {
      if (this.scope) this.profiles.select(this.profiles.id(), this.scope, false);
    } catch (error) { this.fail(error); return; }
    ++this.generation; this.flight = null;
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    void this.cloud.stop().catch(() => {}); this.emit({ enabled: false, busy: false, backups: [], error: null });
  }
  changed() {
    if (this.disposed) return;
    this.emit();
    if (!this.active || this.flight || this.timer || this.snapshot.busy) return;
    if (this.snapshot.error === 'progress-cloud-offline' || this.snapshot.error === 'progress-cloud-busy') {
      this.timer = setTimeout(() => { this.timer = undefined; void this.retry(); }, 60_000);
      return;
    }
    if (!this.active || !this.scope || !this.snapshot.enabled || !this.snapshot.ready || !this.snapshot.pending || this.flight || this.timer || this.snapshot.error) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.retry(); }, Math.max(0, 60_000 - (this.now() - this.lastPublish)));
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active && this.timer) { clearTimeout(this.timer); this.timer = undefined; }
    if (active) this.changed();
  }
  dispose() { this.disposed = true; ++this.generation; if (this.timer) clearTimeout(this.timer); this.listeners.clear(); this.guards.clear(); void this.cloud.stop().catch(() => {}); }
}
