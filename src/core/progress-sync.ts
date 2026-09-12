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
    const columns = this.db.all<{ name: string }>('PRAGMA table_info(profiles)');
    if (!columns.some(column => column.name === 'base')) this.db.exec('ALTER TABLE profiles ADD COLUMN base TEXT');
    if (!columns.some(column => column.name === 'cleanup')) this.db.exec('ALTER TABLE profiles ADD COLUMN cleanup INTEGER NOT NULL DEFAULT 0');
    if (!columns.some(column => column.name === 'abandoned')) this.db.exec('ALTER TABLE profiles ADD COLUMN abandoned TEXT');
  }
  id(): string { return this.db.first<{ profile: string }>('SELECT profile FROM active_profile WHERE id=1')!.profile; }
  store(id: string): ProgressBackupStore {
    let store = this.stores.get(id);
    if (!store) { store = new ProgressBackupStore(this.open(id)); this.stores.set(id, store); }
    return store;
  }
  current(): ProgressBackupStore { return this.store(this.id()); }
  account(scope: string) { return this.db.first<{ profile: string; enabled: number; base: string | null; cleanup: number; abandoned: string | null }>('SELECT profile,enabled,base,cleanup,abandoned FROM profiles WHERE scope=?', scope); }
  cleaned(scope: string, pending: boolean) {
    this.db.run('UPDATE profiles SET cleanup=?,abandoned=CASE WHEN ?=0 THEN NULL ELSE abandoned END WHERE scope=?', pending ? 1 : 0, pending ? 1 : 0, scope);
  }
  acknowledge(scope: string, base: string, cleanup: boolean) {
    this.db.run('UPDATE profiles SET base=?,cleanup=? WHERE scope=?', base, cleanup ? 1 : 0, scope);
  }
  create(): string { const id = this.random(); this.store(id); return id; }
  select(id: string, scope?: string, enabled = true, base?: string, cleanup = false, abandoned?: string): void {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      if (scope) {
        this.db.run('INSERT INTO profiles(scope,profile,enabled) VALUES(?,?,?) ON CONFLICT(scope) DO UPDATE SET profile=excluded.profile,enabled=excluded.enabled', scope, id, enabled ? 1 : 0);
        if (base !== undefined) this.db.run('UPDATE profiles SET base=?,cleanup=? WHERE scope=?', base, cleanup ? 1 : 0, scope);
        if (abandoned !== undefined) this.db.run('UPDATE profiles SET abandoned=? WHERE scope=?', abandoned, scope);
      }
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

export type SyncConflict = { token: string; profile: string; localRevision: number; generation: number; backups: CloudBackup[] };
export type SyncSnapshot = { profile: string; generation: number; status: CloudAccount['status'];
  hasProfile: boolean; enabled: boolean; ready: boolean; busy: boolean; pending: boolean; error: string | null; backups: CloudBackup[];
  conflict: SyncConflict | null; cleanupPending: boolean };
export class ProgressSync {
  private generation = 0;
  private scope: string | null = null;
  private listeners = new Set<() => void>();
  private guards = new Set<() => void>();
  private disposed = false;
  private active = true;
  private retryIdentity = false;
  private flight: object | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastPublish = -Infinity;
  private candidates = new Map<string, string>();
  private remote: CloudBackup[] = [];
  private choiceSequence = 0;
  private choiceBase: string | null = null;
  private snapshot: SyncSnapshot;
  constructor(readonly profiles: ProgressProfiles, private cloud: ProgressCloud, private now = () => Date.now()) {
    this.snapshot = { profile: profiles.id(), generation: 0, status: 'unknown', hasProfile: false, enabled: false, ready: false, busy: false, pending: false, error: null, backups: [], conflict: null, cleanupPending: false };
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
    // Expo wraps Swift LocalizedError descriptions in an exception cause line.
    // Expose only our exact terminal error code, never the native wrapper or paths.
    const code = message.match(/(?:^|\n→ Caused by: )(progress-cloud-(?:unavailable|accountChanged|offline|quota|permission|conflict|corrupt|tooLarge|storage|busy))$/)?.[1];
    this.emit({ error: code ?? 'progress-cloud-storage', busy: false });
    this.changed();
  }
  private async operationFailed(error: unknown, generation: number) {
    if (!this.valid(generation)) return;
    this.fail(error);
    if (this.snapshot.error === 'progress-cloud-conflict' && this.scope) {
      try {
        const backups = await this.cloud.list(this.scope);
        if (this.valid(generation)) { this.observe(backups); this.conflict(); }
      } catch (next) { if (this.valid(generation)) this.fail(next); }
    }
  }
  private switch(id: string, scope?: string, enabled = true) {
    if (id !== this.profiles.id()) this.guards.forEach(guard => guard());
    this.profiles.select(id, scope, enabled);
  }
  private observe(backups: CloudBackup[]) {
    this.remote = backups;
    this.candidates = new Map(backups.map((backup, index) => [`${this.generation}:${index}`, backup.id]));
    this.emit({ backups: backups.map((backup, index) => ({ ...backup, id: `${this.generation}:${index}` })),
      cleanupPending: backups.some(backup => backup.cleanupPending) || !!(this.scope && this.profiles.account(this.scope)?.cleanup) });
  }
  private remoteBase(): string {
    if (!this.remote.length) return '';
    const token = this.remote[0]!.token;
    if (typeof token !== 'string' || !token || this.remote.some(backup => backup.token !== token)) throw Error('progress-cloud-corrupt');
    return token;
  }
  private conflict() {
    this.choiceBase = this.remoteBase();
    this.emit({ conflict: { token: `${this.generation}:choice:${++this.choiceSequence}`, profile: this.profiles.id(),
      localRevision: this.profiles.current().revision(), generation: this.generation, backups: this.snapshot.backups },
    error: 'progress-cloud-conflict' });
  }
  private capture() { return { generation: this.generation, profile: this.profiles.id(), revision: this.profiles.current().revision() }; }
  private unchanged(capture: ReturnType<ProgressSync['capture']>) {
    return this.valid(capture.generation) && this.profiles.id() === capture.profile && this.profiles.current().revision() === capture.revision;
  }
  private async install(backup: CloudBackup, capture: ReturnType<ProgressSync['capture']>, downloaded?: string) {
    const scope = this.scope!;
    const json = downloaded ?? await this.cloud.read(scope, backup.id);
    if (!this.valid(capture.generation)) return false;
    let canonical: string;
    try { canonical = JSON.stringify(validateProgressBackup(json)); } catch { throw Error('progress-cloud-corrupt'); }
    const latest = await this.cloud.list(scope);
    if (!this.valid(capture.generation)) return false;
    this.observe(latest);
    if (this.remoteBase() !== backup.token || !latest.some(value => value.id === backup.id)) { this.conflict(); return false; }
    if (!this.unchanged(capture)) { this.conflict(); return false; }
    // A pause can synchronously checkpoint. Run it exactly once, then check again.
    this.guards.forEach(guard => guard());
    if (!this.unchanged(capture)) { this.conflict(); return false; }
    const profile = this.profiles.create(), store = this.profiles.store(profile);
    store.restoreBackup(canonical); store.acknowledge(store.revision());
    // Native identity can refer to an older uploaded revision than the currently
    // displaced SQLite data. Persist it in the same commit as profile activation.
    const pending = latest[0]?.pendingPublication;
    const abandoned = (pending !== backup.token ? pending : undefined) ?? this.profiles.account(scope)?.abandoned ?? undefined;
    const cleanup = latest.some(value => value.cleanupPending) || !!abandoned;
    this.profiles.select(profile, scope, true, backup.token, cleanup, abandoned);
    this.emit({ enabled: true, hasProfile: true, conflict: null, error: null, cleanupPending: cleanup });
    if (!backup.legacy && cleanup) await this.clean(backup.token, capture.generation);
    return true;
  }
  private async clean(base: string, generation: number) {
    const scope = this.scope!, profile = this.profiles.id();
    const pending = await this.cloud.cleanup(scope, base, this.profiles.account(scope)?.abandoned ?? null);
    if (!this.valid(generation) || this.profiles.id() !== profile) return;
    this.profiles.cleaned(scope, pending);
    this.remote = this.remote.map(backup => ({ ...backup, cleanupPending: pending }));
    this.emit({ cleanupPending: pending, error: null });
  }
  private async publish(base: string, generation: number) {
    const scope = this.scope!, profile = this.profiles.id(), store = this.profiles.current();
    const revision = store.revision(), json = store.exportBackup();
    this.lastPublish = this.now();
    const result = await this.cloud.publish(scope, revision, json, base);
    if (!this.valid(generation) || this.profiles.id() !== profile) return;
    if (result.revision !== revision || !result.token || result.legacy) throw Error('progress-cloud-corrupt');
    // Persist the server identity first. A crash before the revision ack is recovered
    // by canonical equality; newer local changes retain their pending revision.
    this.profiles.acknowledge(scope, result.token, result.cleanupPending);
    store.acknowledge(revision);
    this.observe([result]);
    this.emit({ conflict: null, error: null, cleanupPending: result.cleanupPending });
  }
  private reconciled() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.emit({ error: null });
  }
  private async reconcile(generation: number) {
    const capture = this.capture(), scope = this.scope!;
    const backups = await this.cloud.list(scope);
    if (!this.valid(generation)) return;
    this.observe(backups);
    const base = this.remoteBase(), local = this.profiles.account(scope)!;
    const cleanup = backups.some(backup => backup.cleanupPending) || !!local.cleanup || !!local.abandoned;
    const store = this.profiles.current();
    if (!this.unchanged(capture)) { this.conflict(); return; }
    if (this.snapshot.conflict) { this.conflict(); return; }
    if (local.base === base && !backups.some(backup => backup.legacy)) {
      if (local.abandoned || (!store.pending() && cleanup)) await this.clean(base, generation);
      if (!this.valid(generation) || this.profiles.id() !== capture.profile) return;
      if (store.pending()) await this.publish(base, generation);
      else this.reconciled();
      return;
    }
    if (!backups.length) {
      if (local.base !== null && local.base !== '') { this.conflict(); return; }
      this.profiles.acknowledge(scope, '', false);
      if (store.pending()) await this.publish('', generation);
      else this.reconciled();
      return;
    }
    if (backups.length !== 1) { this.conflict(); return; }
    const backup = backups[0]!;
    const json = await this.cloud.read(scope, backup.id);
    if (!this.valid(generation)) return;
    let canonical: string;
    try { canonical = JSON.stringify(validateProgressBackup(json)); } catch { throw Error('progress-cloud-corrupt'); }
    if (!this.unchanged(capture)) { this.conflict(); return; }
    if (store.exportBackup() === canonical) {
      const abandoned = backup.pendingPublication !== base ? backup.pendingPublication : undefined;
      this.profiles.select(this.profiles.id(), scope, true, base, cleanup || !!abandoned, abandoned);
      store.acknowledge(capture.revision);
      if (backup.legacy) await this.publish(base, generation);
      else if (cleanup || abandoned) await this.clean(base, generation);
      else this.reconciled();
      return;
    }
    if (local.base === null || store.pending() || backup.legacy) { this.conflict(); return; }
    await this.install(backup, capture, canonical);
  }
  async refreshAccount() {
    const generation = ++this.generation;
    this.retryIdentity = false;
    this.scope = null; this.flight = null; this.candidates.clear();
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    this.emit({ ready: false, enabled: false, hasProfile: false, busy: true, backups: [], error: null, conflict: null, cleanupPending: false });
    // Native invalidation must not wait behind an older network operation.
    void this.cloud.stop().catch(() => {});
    try {
      const account = await this.cloud.account(); if (!this.valid(generation)) return;
      this.emit({ status: account.status });
      if (account.status !== 'available') {
        if (account.status === 'no-account') this.switch('guest');
        this.retryIdentity = account.status === 'unknown';
        this.emit({ busy: false }); this.changed(); return;
      }
      this.scope = account.scope;
      const local = this.profiles.account(account.scope);
      this.switch(local?.profile ?? 'guest'); this.emit({ enabled: !!local?.enabled, hasProfile: !!local });
      const backups = await this.cloud.list(account.scope); if (!this.valid(generation)) return;
      this.observe(backups);
      this.emit({ ready: true, busy: false });
      if (local?.enabled) await this.retry();
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
      // Guest checkpoint was already captured before preparing the new profile.
      this.profiles.select(id, this.scope); this.emit({ enabled: true, hasProfile: true, error: null });
      await this.retry();
    } catch (error) { if (this.valid(generation)) this.fail(error); }
  }
  async restore(id: string) {
    const generation = this.generation, scope = this.scope, remote = this.candidates.get(id);
    if (!scope || !remote || !this.snapshot.ready || this.snapshot.busy || this.flight) return;
    // Recovery is first-use only; later local history must never be replaced.
    if (this.profiles.account(scope)) { this.emit({ error: 'local-profile-exists' }); return; }
    const flight = {}; this.flight = flight;
    this.emit({ busy: true, error: null });
    try {
      const backup = this.remote.find(backup => backup.id === remote)!;
      if (await this.install(backup, this.capture())) {
        if (backup.legacy) await this.publish(backup.token, generation);
      }
    } catch (error) { await this.operationFailed(error, generation); }
    finally { if (this.valid(generation) && this.flight === flight) { this.flight = null; this.emit({ busy: false }); this.changed(); } }
  }
  async retry() {
    if (!this.snapshot.ready) { await this.refreshAccount(); return; }
    const generation = this.generation, scope = this.scope;
    if (!scope || !this.snapshot.enabled || this.flight || this.snapshot.busy) return;
    const flight = {}; this.flight = flight;
    this.emit({ busy: true });
    try {
      await this.reconcile(generation);
    } catch (error) { if (this.flight === flight) await this.operationFailed(error, generation); }
    finally { if (this.valid(generation) && this.flight === flight) { this.flight = null; this.emit({ busy: false }); this.changed(); } }
  }
  async resolveConflict(choice: 'cloud' | 'local', token: string, backupID?: string): Promise<void> {
    const conflict = this.snapshot.conflict, scope = this.scope, generation = this.generation;
    if (!scope || !conflict || conflict.token !== token || this.flight || this.snapshot.busy) return;
    const base = this.choiceBase!, capture = { generation: conflict.generation, profile: conflict.profile, revision: conflict.localRevision };
    const selected = backupID ? this.candidates.get(backupID) : this.remote.length === 1 ? this.remote[0]!.id : undefined;
    const flight = {}; this.flight = flight; this.emit({ busy: true });
    try {
      const backups = await this.cloud.list(scope);
      if (!this.valid(generation)) return;
      this.observe(backups);
      if (!this.unchanged(capture) || this.remoteBase() !== base) { this.conflict(); return; }
      if (choice === 'local') {
        if (!this.profiles.account(scope)) {
          // First recovery may conflict with a guest checkpoint. The explicit
          // local choice imports guest history/preferences into an account profile;
          // publishing must never acknowledge the independent guest store.
          this.guards.forEach(guard => guard());
          if (!this.unchanged(capture)) { this.conflict(); return; }
          const profile = this.profiles.create();
          this.profiles.store(profile).restoreBackup(this.profiles.guestBackup());
          this.profiles.select(profile, scope, true, base);
          this.emit({ enabled: true, hasProfile: true });
        }
        await this.publish(base, generation);
      }
      else {
        const backup = backups.find(backup => backup.id === selected);
        if (!backup) { this.conflict(); return; }
        if (await this.install(backup, capture)) {
          if (backup.legacy) await this.publish(base, generation);
        }
      }
    } catch (error) { await this.operationFailed(error, generation); }
    finally { if (this.valid(generation) && this.flight === flight) { this.flight = null; this.emit({ busy: false }); this.changed(); } }
  }
  disable(generation = this.generation) {
    if (!this.valid(generation)) return;
    try {
      if (this.scope) this.profiles.select(this.profiles.id(), this.scope, false);
    } catch (error) { this.fail(error); return; }
    ++this.generation; this.flight = null;
    this.retryIdentity = false;
    if (this.timer) clearTimeout(this.timer); this.timer = undefined;
    void this.cloud.stop().catch(() => {}); this.emit({ enabled: false, busy: false, backups: [], error: null, conflict: null });
  }
  changed() {
    if (this.disposed) return;
    this.emit();
    if (!this.active || this.flight || this.timer || this.snapshot.busy) return;
    if (this.retryIdentity || this.snapshot.error === 'progress-cloud-offline' || this.snapshot.error === 'progress-cloud-busy') {
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
