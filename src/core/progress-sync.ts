import { ProgressBackupStore, ProgressMergeError, validateProgressBackup, type BackupDatabase } from './progress-backup';
import type { CloudAccount, CloudBackup, ProgressCloud } from '../../modules/progress-cloud';
import { ProgressDeletions } from './progress-deletion';
import { decodeEnvelope, emptyProgress, encodeEnvelope } from './progress-envelope';

type Preference = 'settings' | 'selection';
export class ProgressProfiles {
  private db: BackupDatabase;
  private stores = new Map<string, ProgressBackupStore>();
  private guestPreferenceRevision = 0;
  private hidden = false;
  readonly deletions: ProgressDeletions;
  constructor(private open: (id: string) => BackupDatabase, private random: () => string,
    private legacy: (key: Preference) => string | null = () => null,
    private saveLegacy: (key: Preference, value: string) => void = () => {},
    private clearLegacy: (key: Preference) => void = () => {}) {
    this.db = open('progress-profiles-v1');
    this.deletions = new ProgressDeletions(this.db);
    this.db.exec(`CREATE TABLE IF NOT EXISTS profiles(scope TEXT PRIMARY KEY, profile TEXT NOT NULL, enabled INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS active_profile(id INTEGER PRIMARY KEY CHECK(id=1), profile TEXT NOT NULL);
      INSERT OR IGNORE INTO active_profile VALUES(1,'guest');`);
    const columns = this.db.all<{ name: string }>('PRAGMA table_info(profiles)');
    if (!columns.some(column => column.name === 'base')) this.db.exec('ALTER TABLE profiles ADD COLUMN base TEXT');
    if (!columns.some(column => column.name === 'cleanup')) this.db.exec('ALTER TABLE profiles ADD COLUMN cleanup INTEGER NOT NULL DEFAULT 0');
    if (!columns.some(column => column.name === 'abandoned')) this.db.exec('ALTER TABLE profiles ADD COLUMN abandoned TEXT');
  }
  id(): string { return this.hidden ? 'guest' : this.db.first<{ profile: string }>('SELECT profile FROM active_profile WHERE id=1')!.profile; }
  /** Privacy cannot depend on a successful disk write. Identity recovery clears this fence. */
  hide(): unknown {
    this.hidden = true;
    try { this.select('guest'); } catch (error) { return error; }
  }
  store(id: string): ProgressBackupStore {
    let store = this.stores.get(id);
    if (!store) { store = new ProgressBackupStore(this.open(id)); this.stores.set(id, store); }
    return store;
  }
  current(): ProgressBackupStore { return this.store(this.id()); }
  retire(id: string): void { this.stores.get(id)?.revoke(); this.stores.delete(id); }
  clearGuest(): void {
    this.deletions.removeGuest();
    this.clearLegacy('settings'); this.clearLegacy('selection'); ++this.guestPreferenceRevision;
  }
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
      this.hidden = false;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  readValue(key: Preference, id = this.id()): string | null {
    return this.store(id).readValue(key) ?? (id === 'guest' && !this.deletions.guestRemoved() ? this.legacy(key) : null);
  }
  saveValue(key: Preference, value: string, id = this.id()): void {
    if (id === 'guest') {
      if (this.readValue(key, id) === value) return;
      // Once changed, SQLite owns the ordered value; KV remains only a legacy
      // fallback and cannot overwrite a newer learning selection on import.
      this.store(id).saveValue(key, value);
      this.saveLegacy(key, value);
      ++this.guestPreferenceRevision;
    } else this.store(id).saveValue(key, value);
  }
  // Consent is process-local; guest preferences live outside the journal DB.
  preferenceRevision(): number { return this.id() === 'guest' ? this.guestPreferenceRevision : 0; }
  hasGuestData(): boolean {
    const backup = validateProgressBackup(this.store('guest').exportBackup());
    if (Object.entries(backup.tables).some(([key, rows]) => key !== 'preferences' && rows.length > 0)) return true;
    const settings = this.readValue('settings', 'guest');
    if (settings && settings !== '{"mode":"manual","rate":1}') return true;
    return this.readValue('selection', 'guest') !== null;
  }
  guestBackup(): string {
    const values: Partial<Record<Preference, string>> = {};
    for (const key of ['settings', 'selection'] as const) {
      const value = this.deletions.guestRemoved() ? null : this.legacy(key); if (value !== null) values[key] = value;
    }
    return this.store('guest').exportWithPreferences(values);
  }
}

export type SyncSnapshot = { profile: string; generation: number; status: CloudAccount['status'];
  hasProfile: boolean; enabled: boolean; ready: boolean; busy: boolean; pending: boolean; error: string | null; backups: CloudBackup[];
  conflict: null; cleanupPending: boolean; authority: number; learningAvailable: boolean;
  deletion: null | { kind: 'local' | 'cloud'; pending: true }; };

function errorCode(error: unknown): string {
  const message = error instanceof Error ? error.message : '';
  // Never expose account identifiers, native wrapper paths, or raw payloads.
  return message.match(/(?:^|\n→ Caused by: )(progress-cloud-(?:unavailable|accountChanged|offline|quota|permission|conflict|corrupt|tooLarge|storage|busy|updateRequired))$/)?.[1]
    ?? 'progress-cloud-storage';
}
function headToken(backups: readonly CloudBackup[]): string {
  if (!backups.length) return '';
  const token = backups[0]!.token;
  if (!token || backups.some(backup => backup.token !== token)
    || new Set(backups.map(backup => backup.id)).size !== backups.length
    || (backups.length > 1 && backups.some(backup => !backup.legacy))) throw Error('progress-cloud-corrupt');
  return token;
}
function sameHead(a: readonly CloudBackup[], b: readonly CloudBackup[]): boolean {
  return headToken(a) === headToken(b)
    && a.length === b.length
    && a.every(item => b.some(other => other.id === item.id && other.legacy === item.legacy
      && (other.resetGeneration ?? '') === (item.resetGeneration ?? '')));
}

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
  private lastAttempt = -Infinity;
  private snapshot: SyncSnapshot;
  private authority = 0;
  private confirmationGeneration = 0;
  private emittedOperation = 0;
  private emittedAuthority = 0;
  private verified = false;
  private lastScope: string | null = null;
  constructor(readonly profiles: ProgressProfiles, private cloud: ProgressCloud, private now = () => Date.now(),
    private identity: () => string = () => globalThis.crypto.randomUUID()) {
    this.snapshot = { profile: profiles.id(), generation: 0, status: 'unknown', hasProfile: false, enabled: false,
      ready: false, busy: false, pending: false, error: null, backups: [], conflict: null, cleanupPending: false,
      authority: 0, learningAvailable: profiles.id() === 'guest', deletion: null };
    // Cached account selection is not identity verification on a new launch.
    if (profiles.id() !== 'guest') profiles.select('guest');
    this.emit();
  }
  getSnapshot = (): SyncSnapshot => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  beforeSwitch(guard: () => void) { this.guards.add(guard); return () => { this.guards.delete(guard); }; }
  authorized(authority: number, profile = this.profiles.id()): boolean {
    return !this.disposed && authority === this.authority && profile === this.profiles.id() && this.snapshot.learningAvailable;
  }
  savePreference(key: Preference, value: string, authority: number, profile: string): boolean {
    if (!this.authorized(authority, profile)) return false;
    this.profiles.saveValue(key, value, profile); this.changed(); return true;
  }
  private deletionScope(): string | null {
    const scope = this.scope ?? this.lastScope;
    return this.verified && scope && this.profiles.account(scope)?.profile === this.profiles.id() ? scope : null;
  }
  private emit(patch: Partial<SyncSnapshot> = {}) {
    if (this.emittedOperation !== this.generation || this.emittedAuthority !== this.authority) {
      ++this.confirmationGeneration; this.emittedOperation = this.generation; this.emittedAuthority = this.authority;
    }
    const deletionScope = this.deletionScope();
    this.snapshot = { ...this.snapshot, ...patch, profile: this.profiles.id(), generation: this.confirmationGeneration,
      authority: this.authority, pending: this.profiles.current().pending(),
      deletion: this.profiles.deletions.local(this.profiles.id()) ? { kind: 'local', pending: true }
        : deletionScope && this.profiles.deletions.cloud(deletionScope) ? { kind: 'cloud', pending: true } : null };
    if (this.snapshot.deletion) this.snapshot.learningAvailable = false;
    this.listeners.forEach(listener => listener());
  }
  private valid(generation: number, profile?: string) {
    return !this.disposed && generation === this.generation && (profile === undefined || profile === this.profiles.id());
  }
  private validAction(generation: number) { return !this.disposed && generation === this.snapshot.generation; }
  private cancelTimer() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }
  private fail(error: unknown) {
    const code = errorCode(error);
    if (code === 'progress-cloud-accountChanged') {
      const failure = this.hideAccount();
      this.emit({ error: failure ? 'progress-cloud-storage' : code, busy: false }); return;
    }
    // CAS contention is expected. Leave work pending and retry at the next interval.
    this.emit({ error: code === 'progress-cloud-conflict' ? null : code, busy: false });
  }
  private observe(backups: CloudBackup[]) {
    headToken(backups);
    this.emit({ backups: backups.map((backup, index) => ({ ...backup, id: `${this.generation}:${index}` })),
      cleanupPending: backups.some(backup => backup.cleanupPending)
        || !!(this.scope && this.profiles.account(this.scope)?.cleanup) });
  }
  private switch(id: string) {
    if (id === this.profiles.id()) return;
    const failure = this.pauseAll();
    this.guards.clear();
    this.profiles.retire(this.profiles.id()); ++this.authority;
    try {
      this.profiles.select(id);
      if (failure) throw failure;
    } catch (error) {
      // Identity is already different. Neither the outgoing profile nor the
      // newly resolved scope may retain authority after a failed transition.
      this.hideAccount();
      this.emit({ error: 'progress-cloud-storage' });
      throw error;
    }
  }
  private pauseAll(): unknown {
    let failure: unknown;
    for (const guard of this.guards) try { guard(); } catch (error) { failure ??= error; }
    return failure;
  }
  private invalidate() {
    ++this.generation; this.flight = null; this.cancelTimer();
    void this.cloud.stop().catch(() => {});
  }
  async accountChanged() {
    if (this.disposed) return;
    const failure = this.hideAccount();
    if (failure) return;
    await this.refreshAccount();
  }
  private hideAccount() {
    let failure = this.pauseAll();
    this.invalidate(); this.profiles.retire(this.profiles.id()); ++this.authority;
    this.guards.clear();
    this.verified = false; this.scope = null; this.lastScope = null;
    const selectionFailure = this.profiles.hide();
    failure ??= selectionFailure;
    this.emit({ learningAvailable: false, ready: false, hasProfile: false, enabled: false, backups: [], busy: false,
      error: failure ? 'progress-cloud-storage' : null });
    return failure;
  }
  async removeLocal(generation = this.snapshot.generation) {
    if (!this.validAction(generation) || this.snapshot.deletion) return;
    const profile = this.profiles.id();
    const failure = this.pauseAll();
    this.invalidate(); this.profiles.retire(profile); ++this.authority;
    const operation = this.generation;
    this.emit({ learningAvailable: false, enabled: false });
    try {
      const candidate = this.scope ?? this.lastScope;
      const scope = candidate && this.profiles.account(candidate)?.profile === profile ? candidate : null;
      this.profiles.deletions.beginLocal(profile, scope ?? '');
      if (scope && this.profiles.account(scope)) this.profiles.select(profile, scope, false);
      this.guards.clear();
      if (failure) throw failure;
      await this.finishLocal();
    } catch (error) { if (this.valid(operation, profile)) this.fail(error); }
  }
  private async finishLocal() {
    const profile = this.profiles.id(), intent = this.profiles.deletions.local(profile);
    if (!intent) return;
    const generation = this.generation;
    this.emit({ busy: true, learningAvailable: false });
    if (intent.scope) this.profiles.select(profile, intent.scope, false);
    this.profiles.retire(profile);
    const store = this.profiles.current();
    store.reset(emptyProgress(), store.resetGeneration());
    if (profile === 'guest') this.profiles.clearGuest();
    if (intent.scope) await this.cloud.discardLocal(intent.scope);
    if (!this.valid(generation, profile)) return;
    this.profiles.deletions.finishLocal(profile);
    this.emit({ busy: false, learningAvailable: true, error: null, enabled: false });
  }
  async retryDeletion() {
    if (this.disposed || this.snapshot.busy) return;
    const operation = this.generation, profile = this.profiles.id();
    try {
      await this.finishLocal();
      const scope = this.deletionScope();
      if (scope && this.profiles.deletions.cloud(scope)) await this.finishCloud(scope);
    }
    catch (error) { if (this.valid(operation, profile)) this.fail(error); }
  }
  async deleteCloud(generation = this.snapshot.generation) {
    const scope = this.scope ?? this.lastScope;
    if (!this.validAction(generation) || !scope || !this.verified || this.profiles.account(scope)?.profile !== this.profiles.id()
      || this.snapshot.deletion) return;
    this.scope = scope;
    const profile = this.profiles.id(), failure = this.pauseAll();
    this.invalidate(); this.profiles.retire(profile); ++this.authority;
    const operation = this.generation;
    this.guards.clear();
    this.emit({ learningAvailable: false, enabled: false });
    try {
      const request = this.identity(), expected = this.profiles.current().resetGeneration();
      // Validate injected identity before persisting an unrecoverable request.
      encodeEnvelope(emptyProgress(), request);
      this.profiles.deletions.beginCloud({ scope, profile, request, expected });
      this.profiles.select(profile, scope, false);
      if (failure) throw failure;
      await this.finishCloud();
    } catch (error) { if (this.valid(operation, profile)) this.fail(error); }
  }
  private applyBoundary(progress: string, resetGeneration: string) {
    const profile = this.profiles.id();
    if (this.profiles.current().resetGeneration() === resetGeneration) return;
    const failure = this.pauseAll();
    this.profiles.retire(profile); ++this.authority;
    this.guards.clear();
    this.emit({ learningAvailable: false });
    if (failure) throw failure;
    this.profiles.current().reset(progress, resetGeneration);
  }
  private async finishCloud(scope = this.scope!) {
    const intent = this.profiles.deletions.cloud(scope);
    if (!intent || intent.profile !== this.profiles.id() || !this.verified) return;
    const generation = this.generation, profile = intent.profile;
    this.cancelTimer(); this.emit({ busy: true, learningAvailable: false, enabled: false });
    try {
      this.profiles.select(profile, scope, false);
      const result = await this.cloud.reset(scope, intent.request, intent.expected, encodeEnvelope(emptyProgress(), intent.request));
      if (!this.valid(generation, profile)) return;
      if (!result.token || result.legacy || !result.resetGeneration) throw Error('progress-cloud-corrupt');
      const json = await this.cloud.read(scope, result.id);
      if (!this.valid(generation, profile)) return;
      const payload = decodeEnvelope(json, result.resetGeneration);
      const latest = await this.cloud.list(scope);
      if (!this.valid(generation, profile)) return;
      if (!sameHead([result], latest)) throw Error('progress-cloud-conflict');
      this.applyBoundary(payload.progress, payload.generation);
      // A repeated request may return newer learning in the same generation.
      this.profiles.current().mergeBackup(payload.progress);
      if (this.profiles.current().exportBackup() === payload.progress) this.profiles.current().acknowledge(this.profiles.current().revision());
      this.profiles.acknowledge(scope, result.token, result.cleanupPending);
      this.observe(latest);
      if (!result.cleanupPending && !latest.some(head => head.cleanupPending)) this.profiles.deletions.finishCloud(scope);
      this.emit({ error: null, learningAvailable: !this.profiles.deletions.cloud(scope) });
    } finally {
      if (this.valid(generation, profile)) { this.emit({ busy: false }); this.changed(); }
    }
  }
  private async clean(base: string, generation: number, profile: string) {
    const scope = this.scope!;
    const pending = await this.cloud.cleanup(scope, base, this.profiles.account(scope)?.abandoned ?? null);
    if (!this.valid(generation, profile)) return;
    this.profiles.cleaned(scope, pending);
    this.emit({ cleanupPending: pending });
  }
  private async publish(base: string, generation: number, profile: string) {
    const scope = this.scope!, store = this.profiles.current();
    const revision = store.revision(), json = encodeEnvelope(store.exportBackup(), store.resetGeneration());
    const result = await this.cloud.publish(scope, revision, json, base);
    if (!this.valid(generation, profile)) return;
    if (result.revision !== revision || !result.token || result.legacy
      || (result.resetGeneration ?? '') !== store.resetGeneration()) throw Error('progress-cloud-corrupt');
    // A crash between these writes retains pending work. Canonical equality on
    // the next pass recovers it; only this exact sent revision is acknowledged.
    this.profiles.acknowledge(scope, result.token, result.cleanupPending);
    store.acknowledge(revision);
    this.observe([result]);
    this.emit({ error: null });
  }
  private async reconcile(generation: number, profile: string) {
    const scope = this.scope!;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const backups = await this.cloud.list(scope);
        if (!this.valid(generation, profile)) return;
        this.observe(backups);
        const base = headToken(backups), payloads: string[] = [];
        const observed = this.profiles.current().resetGeneration();
        if (observed && !backups.length) throw Error('progress-cloud-corrupt');
        const resetGeneration = backups[0]?.resetGeneration ?? '';
        if (observed && !resetGeneration) throw Error('progress-cloud-corrupt');
        if (resetGeneration && (backups.length !== 1 || backups[0]!.legacy)) throw Error('progress-cloud-corrupt');
        // Validate every candidate before touching SQLite. Never promote partial
        // legacy recovery into an authoritative singleton head.
        for (const backup of backups) {
          const json = await this.cloud.read(scope, backup.id);
          if (!this.valid(generation, profile)) return;
          payloads.push(decodeEnvelope(json, backup.resetGeneration ?? '').progress);
        }
        const latest = await this.cloud.list(scope);
        if (!this.valid(generation, profile)) return;
        if (!sameHead(backups, latest)) throw Error('progress-cloud-conflict');
        this.observe(latest);
        if (resetGeneration) this.applyBoundary(payloads[0]!, resetGeneration);
        const store = this.profiles.current();
        // This reads the latest local state, including edits made during awaits.
        // The store validates the whole union before its single write transaction.
        try { store.mergeBackups(payloads); }
        catch (error) { throw Error(error instanceof ProgressMergeError ? 'progress-cloud-corrupt' : 'progress-cloud-storage'); }
        const local = this.profiles.account(scope)!;
        const cleanup = latest.some(backup => backup.cleanupPending) || !!local.cleanup || !!local.abandoned;
        const identical = payloads.length === 1 && store.exportBackup() === payloads[0];
        if (identical && !latest[0]!.legacy) {
          const pending = latest[0]!.pendingPublication;
          const abandoned = pending && pending !== base ? pending : local.abandoned ?? undefined;
          // Store exact native pending identity together with the adopted base.
          this.profiles.select(profile, scope, !!local.enabled, base, cleanup || !!abandoned, abandoned);
          store.acknowledge(store.revision());
          if (cleanup || abandoned) await this.clean(base, generation, profile);
        } else {
          if (cleanup && base) await this.clean(base, generation, profile);
          if (!this.valid(generation, profile)) return;
          // An empty default profile still gets a head on its first explicit sync.
          // A disappeared head is repopulated from durable local history, not erased.
          await this.publish(base, generation, profile);
        }
        if (this.valid(generation, profile)) this.emit({ error: null, learningAvailable: true });
        return;
      } catch (error) {
        if (!this.valid(generation, profile)) return;
        if (errorCode(error) !== 'progress-cloud-conflict') throw error;
        if (attempt === 2) return; // Quiet, bounded contention; next timer retries.
      }
    }
  }
  async refreshAccount(reconcile = true) {
    if (this.disposed) return;
    const generation = ++this.generation;
    this.retryIdentity = false; this.scope = null; this.flight = null; this.cancelTimer();
    this.emit({ ready: false, enabled: false, hasProfile: false, busy: true, backups: [], error: null, cleanupPending: false });
    void this.cloud.stop().catch(() => {});
    try {
      const account = await this.cloud.account();
      if (!this.valid(generation)) return;
      this.emit({ status: account.status });
      if (account.status !== 'available') {
        if (account.status === 'no-account' || account.status === 'unavailable') {
          this.switch('guest'); this.verified = false; this.lastScope = null;
          this.emit({ learningAvailable: !this.profiles.deletions.local('guest') });
        }
        this.retryIdentity = account.status === 'unknown';
        this.emit({ busy: false });
        if (this.profiles.deletions.local(this.profiles.id())) await this.retryDeletion();
        return;
      }
      this.scope = account.scope;
      this.lastScope = account.scope;
      this.verified = true;
      const local = this.profiles.account(account.scope);
      this.switch(local?.profile ?? 'guest');
      this.emit({ enabled: !!local?.enabled, hasProfile: !!local, learningAvailable: true });
      if (this.profiles.deletions.local(this.profiles.id()) || this.profiles.deletions.cloud(account.scope)) {
        this.emit({ busy: false }); await this.retryDeletion();
        if (!this.valid(generation) || this.snapshot.deletion) return;
      }
      const backups = await this.cloud.list(account.scope);
      if (!this.valid(generation)) return;
      this.observe(backups); this.emit({ ready: true, busy: false });
      if (local?.enabled && reconcile) await this.retry();
    } catch (error) { if (this.valid(generation)) this.fail(error); }
    finally { if (this.valid(generation)) this.changed(); }
  }
  private activate(importGuest: boolean, enabled: boolean) {
    const previous = this.profiles.account(this.scope!);
    if (previous) {
      this.profiles.select(previous.profile, this.scope!, enabled);
    } else {
      // Pause/capture guest only for an actual account-profile switch.
      const failure = this.pauseAll(); if (failure) throw failure;
      this.guards.clear();
      this.profiles.retire(this.profiles.id()); ++this.authority;
      const id = this.profiles.create(), store = this.profiles.store(id);
      if (importGuest) store.restoreBackup(this.profiles.guestBackup());
      // Defaults must not stamp over settings recovered from another device.
      if (!store.hasData() && !this.snapshot.backups.length) store.saveValue('settings', '{"mode":"manual","rate":1}');
      this.profiles.select(id, this.scope!, enabled);
    }
    this.emit({ enabled, hasProfile: true, error: null, learningAvailable: true });
  }
  async enable(importGuest: boolean, generation = this.snapshot.generation) {
    if (!this.validAction(generation) || !this.scope || !this.snapshot.ready || this.snapshot.busy || this.snapshot.deletion) return;
    const operation = this.generation;
    try { this.activate(importGuest, true); await this.retry(); }
    catch (error) { if (this.valid(operation)) this.fail(error); }
  }
  /** One deliberate two-way pass; never changes an existing automatic-sync toggle. */
  async refresh(importGuest = false, generation = this.snapshot.generation) {
    if (!this.validAction(generation) || this.snapshot.busy || this.flight || this.snapshot.deletion) return;
    const operation = this.generation;
    if (!this.snapshot.ready) {
      await this.refreshAccount(false);
      // A caller's consent never carries into a freshly checked account.
      return;
    }
    if (!this.scope) return;
    try {
      if (!this.profiles.account(this.scope)) this.activate(importGuest, false);
      await this.run();
    } catch (error) { if (this.valid(operation)) this.fail(error); }
  }
  async retry() {
    if (this.disposed) return;
    if (this.snapshot.deletion) { await this.retryDeletion(); return; }
    if (!this.snapshot.ready) { if (!this.snapshot.busy) await this.refreshAccount(); return; }
    if (!this.snapshot.enabled) return;
    await this.run();
  }
  private async run() {
    if (!this.scope || !this.snapshot.hasProfile || this.flight || this.snapshot.busy || this.disposed || this.snapshot.deletion) return;
    const generation = this.generation, profile = this.profiles.id(), flight = {};
    this.flight = flight; this.cancelTimer(); this.lastAttempt = this.now(); this.emit({ busy: true });
    try { await this.reconcile(generation, profile); }
    catch (error) { if (this.valid(generation, profile)) this.fail(error); }
    finally {
      if (this.valid(generation, profile) && this.flight === flight) {
        this.flight = null; this.emit({ busy: false }); this.changed();
      }
    }
  }
  networkAvailable() {
    if (this.disposed || !this.active) return;
    if (this.snapshot.deletion) { void this.retryDeletion(); return; }
    if (this.snapshot.enabled || this.retryIdentity || (!this.snapshot.ready && this.snapshot.error === 'progress-cloud-offline')) {
      void this.retry();
    }
  }
  disable(generation = this.snapshot.generation) {
    if (!this.validAction(generation)) return;
    try {
      if (this.scope && this.profiles.account(this.scope)) this.profiles.select(this.profiles.id(), this.scope, false);
    } catch (error) { this.fail(error); return; }
    ++this.generation; this.flight = null; this.retryIdentity = false; this.cancelTimer();
    void this.cloud.stop().catch(() => {});
    this.emit({ enabled: false, busy: false, error: null });
  }
  changed() {
    if (this.disposed) return;
    this.emit();
    if (!this.active || this.flight || this.timer || this.snapshot.busy) return;
    if (this.snapshot.deletion) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.retryDeletion(); }, 60_000); return;
    }
    const transient = ['progress-cloud-offline', 'progress-cloud-busy'].includes(this.snapshot.error ?? '');
    if (this.retryIdentity || (!this.snapshot.ready && transient)) {
      this.timer = setTimeout(() => { this.timer = undefined; void this.retry(); }, 60_000);
      return;
    }
    if (!this.scope || !this.snapshot.enabled || !this.snapshot.ready || (this.snapshot.error && !transient)) return;
    // Poll even when clean. COMMIT notifications from export/ack cannot turn
    // no-change polling into a tight upload loop.
    const delay = Math.max(0, 60_000 - (this.now() - this.lastAttempt));
    this.timer = setTimeout(() => { this.timer = undefined; void this.retry(); }, delay);
  }
  setActive(active: boolean) {
    this.active = active;
    if (!active) this.cancelTimer();
    else this.changed();
  }
  dispose() {
    this.disposed = true; ++this.generation; this.cancelTimer();
    this.listeners.clear(); this.guards.clear(); void this.cloud.stop().catch(() => {});
  }
}
