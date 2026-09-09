import { cacheEvictions, cacheExpiresAt, MP3_CACHE_LIMIT, type CachedAudioMetadata } from "./mp3-cache-policy";

// This database belongs only to this feature. Never enumerate/delete other stores.
const DATABASE = "meta-shadowing-mp3-v1";
type Entry = CachedAudioMetadata & { format: "audio/mpeg"; expiresAt: number; bytes: Blob };
let activeAccount: string | null | undefined;
const accountListeners = new Set<() => void>();
export const isAudioAccountCurrent = (accountId: string) => activeAccount === undefined || activeAccount === accountId;
export function onAudioAccountChange(listener: () => void) {
  accountListeners.add(listener);
  return () => { accountListeners.delete(listener); };
}

function validEntry(entry: Entry) {
  try {
    const key: unknown = JSON.parse(entry.key);
    return Array.isArray(key) && key.length === 4 && key.every(part => typeof part === "string" && part.length > 0)
      && entry.format === "audio/mpeg" && entry.bytes instanceof Blob && entry.bytes.size === entry.size && entry.size > 0
      && Number.isFinite(entry.createdAt) && entry.createdAt >= 0
      && (entry.lastPlayedAt === null || (Number.isFinite(entry.lastPlayedAt) && entry.lastPlayedAt >= entry.createdAt))
      && entry.expiresAt === cacheExpiresAt(entry);
  } catch { return false; }
}

/** One read/write transaction serializes pruning and capacity checks across tabs. */
function useCache<T>(work: (store: IDBObjectStore, entries: Entry[]) => T, allowed = () => true): Promise<T | undefined> {
  return new Promise(resolve => {
    let database: IDBDatabase | undefined, transaction: IDBTransaction | undefined, finished = false;
    const finish = (value?: T) => {
      if (finished) return;
      finished = true; clearTimeout(timeout); database?.close(); resolve(value);
    };
    const abandon = () => { try { transaction?.abort(); } catch { /* already completed */ } finish(); };
    const timeout = setTimeout(abandon, 2000);
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => { request.result.createObjectStore("entries", { keyPath: "key" }); };
      request.onerror = () => finish();
      request.onblocked = () => finish();
      request.onsuccess = () => {
        try {
          database = request.result;
          if (finished || !allowed()) { database.close(); finish(); return; }
          database.onversionchange = () => database?.close();
          transaction = database.transaction("entries", "readwrite");
          const store = transaction.objectStore("entries"), read = store.getAll();
          let result: T | undefined;
          transaction.oncomplete = () => finish(result);
          transaction.onerror = transaction.onabort = () => finish();
          read.onsuccess = () => {
            try {
              if (!allowed()) { transaction?.abort(); return; }
              const entries = read.result as Entry[];
              const valid = entries.filter(validEntry);
              const evicted = new Set(cacheEvictions(valid, Date.now()));
              for (const entry of entries) if (!validEntry(entry) || evicted.has(entry.key)) store.delete(entry.key);
              result = work(store, valid.filter(entry => !evicted.has(entry.key)));
            } catch { abandon(); }
          };
        } catch { abandon(); }
      };
    } catch { finish(); }
  });
}

export function setAudioCacheAccount(accountId: string | null) {
  if (activeAccount !== accountId) {
    activeAccount = accountId;
    for (const listener of accountListeners) listener();
  }
  // Failure is safe: the next account can only request keys in its own namespace.
  void useCache((store, entries) => {
    for (const entry of entries) if (JSON.parse(entry.key)[0] !== accountId) store.delete(entry.key);
  }, () => activeAccount === accountId);
}

export function createMp3Cache(accountId: string) {
  const allowed = () => isAudioAccountCurrent(accountId);
  return {
    key(lessonId: string, version: string, audioId: string) { return JSON.stringify([accountId, lessonId, version, audioId]); },
    read(key: string) { return useCache((_store, entries) => entries.find(entry => entry.key === key), allowed); },
    remove(key: string) { return useCache(store => { store.delete(key); }, allowed); },
    put(key: string, bytes: Blob) {
      if (bytes.size > MP3_CACHE_LIMIT) return Promise.resolve(undefined);
      return useCache((store, entries) => {
        const previous = entries.find(entry => entry.key === key);
        if (previous) return previous;
        const entry: Entry = { key, format: "audio/mpeg", size: bytes.size, createdAt: Date.now(), lastPlayedAt: null, expiresAt: 0, bytes };
        entry.expiresAt = cacheExpiresAt(entry);
        const evicted = cacheEvictions([...entries, entry], Date.now());
        for (const removed of evicted) store.delete(removed);
        if (evicted.includes(key)) return undefined;
        store.put(entry);
        return entry;
      }, allowed);
    },
    played(key: string) {
      return useCache((store, entries) => {
        const entry = entries.find(entry => entry.key === key);
        if (!entry) return;
        const renewed = { ...entry, lastPlayedAt: Math.max(entry.createdAt, Date.now()) };
        store.put({ ...renewed, expiresAt: cacheExpiresAt(renewed) });
      }, allowed);
    },
  };
}
