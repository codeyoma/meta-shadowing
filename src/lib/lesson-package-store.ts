import { manifestDigest, packageKey, validatePackage, verifyPackageAudio, type LessonPackage, type PackageAcquisition } from "./lesson-package";

export const LESSON_PACKAGE_DATABASE = "meta-shadowing-lesson-packages-v1";
const stores = ["packages", "assets", "grants", "fences"];
type PackageChange = { lessonId?: string; accountId?: string };
function changed(detail: PackageChange) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("lesson-packages-changed", { detail }));
  if (typeof BroadcastChannel !== "undefined") { const channel = new BroadcastChannel(LESSON_PACKAGE_DATABASE); channel.postMessage(detail); channel.close(); }
}
export function subscribePackageChanges(listener: (change: PackageChange) => void) {
  const local = (event: Event) => listener((event as CustomEvent<PackageChange>).detail);
  window.addEventListener("lesson-packages-changed", local);
  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(LESSON_PACKAGE_DATABASE);
  if (channel) channel.onmessage = event => listener(event.data);
  return () => { window.removeEventListener("lesson-packages-changed", local); channel?.close(); };
}
type PackageRecord = { key: string; manifest: LessonPackage; sha256: string; state: "partial" | "ready"; revision: number };
type AssetRecord = { key: string; blob: Blob };
export type PackageInstall = { accountId: string; lessonId: string; generation: number; accountEpoch: number; key?: string };
export type InstalledLessonPackage = { manifest: LessonPackage; sha256: string; audio: Blob[] };
export type PackageInventory = { lessonId: string; version: string; name: string; state: "partial" | "ready" | "damaged" | "unauthorized"; complete: number; total: number };

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Package storage request failed"));
  });
}
async function database() {
  const request = indexedDB.open(LESSON_PACKAGE_DATABASE, 1);
  request.onupgradeneeded = () => { for (const name of stores) request.result.createObjectStore(name); };
  const db = await result(request);
  db.onversionchange = () => db.close();
  return db;
}
async function transaction<T>(mode: IDBTransactionMode, action: (tx: IDBTransaction) => Promise<T>) {
  const db = await database();
  const tx = db.transaction(stores, mode);
  const complete = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error("Package storage transaction failed"));
  });
  // A synchronous quota failure can abort before action reaches its first await.
  void complete.catch(() => {});
  try {
    const value = await action(tx);
    await complete;
    return value;
  } catch (error) {
    try { tx.abort(); } catch { /* Already settled. */ }
    throw error;
  } finally { db.close(); }
}
function epoch(tx: IDBTransaction, kind: string, id: string): Promise<number> {
  return result(tx.objectStore("fences").get([kind, id])).then(value => value ?? 0);
}
async function guard(tx: IDBTransaction, ticket: PackageInstall) {
  const [generation, accountEpoch] = await Promise.all([epoch(tx, "lesson", ticket.lessonId), epoch(tx, "account", ticket.accountId)]);
  if (generation !== ticket.generation || accountEpoch !== ticket.accountEpoch) throw new Error("Package operation was cancelled");
}

/** Reserve before network acquisition, so deletion/logout also fences a delayed manifest. */
export async function reservePackageInstall(accountId: string, lessonId: string): Promise<PackageInstall> {
  return transaction("readonly", async tx => ({ accountId, lessonId,
    generation: await epoch(tx, "lesson", lessonId), accountEpoch: await epoch(tx, "account", accountId) }));
}
export async function beginPackageInstall(ticket: PackageInstall, acquisition: PackageAcquisition): Promise<PackageInstall> {
  const { manifest, sha256 } = acquisition;
  validatePackage(manifest);
  if (ticket.accountId !== acquisition.accountId || ticket.lessonId !== manifest.lesson.id || await manifestDigest(manifest) !== sha256) throw new Error("Invalid package acquisition");
  const key = packageKey(manifest.lesson.id, manifest.lesson.version);
  await transaction("readwrite", async tx => {
    await guard(tx, ticket);
    const previous: PackageRecord | undefined = await result(tx.objectStore("packages").get(key));
    // A fresh authenticated acquisition can reuse retained verified audio. Data
    // such as previously pending syntax is replaced as one complete manifest.
    tx.objectStore("packages").put({ key, manifest, sha256,
      state: previous?.sha256 === sha256 ? previous.state : "partial", revision: (previous?.revision ?? 0) + 1 } satisfies PackageRecord, key);
  });
  return { ...ticket, key };
}
export async function readStagedPackageAudio(ticket: PackageInstall, index: number): Promise<Blob | null> {
  const snapshot = await transaction("readonly", async tx => {
    await guard(tx, ticket);
    const record: PackageRecord | undefined = await result(tx.objectStore("packages").get(ticket.key!));
    const descriptor = record?.manifest.audio[index];
    if (!descriptor) return null;
    const asset: AssetRecord | undefined = await result(tx.objectStore("assets").get([ticket.key!, descriptor.assetId]));
    return asset ? { blob: asset.blob, descriptor } : null;
  });
  if (!snapshot) return null;
  try { await verifyPackageAudio(snapshot.descriptor, snapshot.blob); return snapshot.blob; } catch { return null; }
}
export async function stagePackageAudio(ticket: PackageInstall, index: number, blob: Blob) {
  const record: PackageRecord | undefined = await transaction("readonly", tx => result(tx.objectStore("packages").get(ticket.key!)));
  const descriptor = record?.manifest.audio[index];
  if (!descriptor) throw new Error("Package no longer exists");
  await verifyPackageAudio(descriptor, blob);
  await transaction("readwrite", async tx => {
    await guard(tx, ticket);
    const current: PackageRecord | undefined = await result(tx.objectStore("packages").get(ticket.key!));
    if (!current || current.sha256 !== record.sha256) throw new Error("Package acquisition changed");
    tx.objectStore("assets").put({ key: ticket.key!, blob } satisfies AssetRecord, [ticket.key!, descriptor.assetId]);
    tx.objectStore("packages").put({ ...current, revision: current.revision + 1 }, ticket.key!);
  });
}
async function snapshotPackage(key: string) {
  return transaction("readonly", async tx => {
    const record: PackageRecord | undefined = await result(tx.objectStore("packages").get(key));
    if (!record) return null;
    const assets = await Promise.all(record.manifest.audio.map(audio => result<AssetRecord | undefined>(tx.objectStore("assets").get([key, audio.assetId]))));
    return { record, assets };
  });
}
async function validateSnapshot(snapshot: NonNullable<Awaited<ReturnType<typeof snapshotPackage>>>, signal?: AbortSignal) {
  signal?.throwIfAborted();
  validatePackage(snapshot.record.manifest);
  if (await manifestDigest(snapshot.record.manifest) !== snapshot.record.sha256) throw new Error("Package data is damaged");
  const audio: Blob[] = [];
  // Only one full ArrayBuffer is materialized at a time; retain Blob handles.
  for (const [index, descriptor] of snapshot.record.manifest.audio.entries()) {
    signal?.throwIfAborted();
    const blob = snapshot.assets[index]?.blob;
    if (!blob) throw new Error("Package audio is missing");
    await verifyPackageAudio(descriptor, blob);
    audio.push(blob);
  }
  signal?.throwIfAborted();
  return { manifest: snapshot.record.manifest, sha256: snapshot.record.sha256, audio };
}
export async function commitPackageInstall(ticket: PackageInstall, signal?: AbortSignal): Promise<void> {
  const snapshot = await snapshotPackage(ticket.key!);
  if (!snapshot) throw new Error("Package no longer exists");
  await validateSnapshot(snapshot, signal);
  await transaction("readwrite", async tx => {
    signal?.throwIfAborted();
    // Cancellation must remain effective until the atomic transaction settles.
    const abort = () => { try { tx.abort(); } catch { /* Already committed. */ } };
    signal?.addEventListener("abort", abort, { once: true });
    const settled = () => signal?.removeEventListener("abort", abort);
    tx.addEventListener("complete", settled, { once: true });
    tx.addEventListener("abort", settled, { once: true });
    await guard(tx, ticket);
    const current: PackageRecord | undefined = await result(tx.objectStore("packages").get(ticket.key!));
    if (!current || current.revision !== snapshot.record.revision) throw new Error("Package changed during validation");
    signal?.throwIfAborted();
    tx.objectStore("packages").put({ ...current, state: "ready" }, ticket.key!);
    tx.objectStore("grants").put({ sha256: current.sha256 }, [ticket.accountId, ticket.key!]);
  });
  changed({ lessonId: ticket.lessonId });
}
export async function readLessonPackage(accountId: string, lessonId: string, version: string): Promise<InstalledLessonPackage | null> {
  const key = packageKey(lessonId, version);
  const grant = await transaction("readonly", tx => result<{ sha256: string } | undefined>(tx.objectStore("grants").get([accountId, key])));
  if (!grant) return null;
  const snapshot = await snapshotPackage(key);
  if (!snapshot || snapshot.record.state !== "ready" || grant.sha256 !== snapshot.record.sha256) return null;
  let installed: InstalledLessonPackage;
  try { installed = await validateSnapshot(snapshot); } catch { return null; }
  return transaction("readonly", async tx => {
    const current: PackageRecord | undefined = await result(tx.objectStore("packages").get(key));
    const currentGrant = await result<{ sha256: string } | undefined>(tx.objectStore("grants").get([accountId, key]));
    return current?.revision === snapshot.record.revision && currentGrant?.sha256 === grant.sha256 ? installed : null;
  });
}
export async function listLessonPackages(accountId: string): Promise<PackageInventory[]> {
  const rows: PackageRecord[] = await transaction("readonly", tx => result(tx.objectStore("packages").getAll()));
  const inventory: PackageInventory[] = [];
  for (const row of rows) {
    const installed = row.state === "ready" && await readLessonPackage(accountId, row.manifest.lesson.id, row.manifest.lesson.version);
    const grant = await transaction("readonly", tx => result(tx.objectStore("grants").get([accountId, row.key])));
    let complete = 0;
    if (installed) complete = row.manifest.audio.length;
    const snapshot = installed ? null : await snapshotPackage(row.key);
    if (snapshot) for (const [index, descriptor] of row.manifest.audio.entries()) {
      const blob = snapshot.assets[index]?.blob;
      if (blob) try { await verifyPackageAudio(descriptor, blob); complete++; } catch { /* Show missing/corrupt as incomplete. */ }
    }
    inventory.push({ lessonId: row.manifest.lesson.id, version: row.manifest.lesson.version, name: row.manifest.lesson.name,
      state: installed ? "ready" : row.state === "partial" ? "partial" : grant ? "damaged" : "unauthorized", complete, total: row.manifest.audio.length });
  }
  return inventory;
}
export async function invalidatePackageAccount(accountId: string, revokeGrants = false) {
  await transaction("readwrite", async tx => {
    tx.objectStore("fences").put(await epoch(tx, "account", accountId) + 1, ["account", accountId]);
    if (revokeGrants) for (const key of await result(tx.objectStore("grants").getAllKeys())) {
      if (Array.isArray(key) && key[0] === accountId) tx.objectStore("grants").delete(key);
    }
  });
  changed({ accountId });
}
export async function deleteLessonPackage(lessonId: string) {
  await transaction("readwrite", async tx => {
    tx.objectStore("fences").put(await epoch(tx, "lesson", lessonId) + 1, ["lesson", lessonId]);
    const records: PackageRecord[] = await result(tx.objectStore("packages").getAll());
    const keys = new Set(records.filter(row => row.manifest.lesson.id === lessonId).map(row => row.key));
    for (const key of keys) tx.objectStore("packages").delete(key);
    for (const storeName of ["assets", "grants"]) for (const key of await result(tx.objectStore(storeName).getAllKeys())) {
      if (Array.isArray(key) && keys.has(String(key[storeName === "assets" ? 0 : 1]))) tx.objectStore(storeName).delete(key);
    }
  });
  changed({ lessonId });
}
