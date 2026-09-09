export const MP3_CACHE_LIMIT = 100 * 1024 * 1024;
export const MP3_RETENTION_MS = 20 * 24 * 60 * 60 * 1000;
export type CachedAudioMetadata = {
  key: string;
  createdAt: number;
  lastPlayedAt: number | null;
  size: number;
};

export function cacheExpiresAt(entry: Pick<CachedAudioMetadata, "createdAt" | "lastPlayedAt">) {
  return (entry.lastPlayedAt ?? entry.createdAt) + MP3_RETENTION_MS;
}

export function cacheEvictions(entries: CachedAudioMetadata[], now: number): string[] {
  const evicted = entries.filter(entry => cacheExpiresAt(entry) <= now || entry.size > MP3_CACHE_LIMIT).map(entry => entry.key);
  const retained = entries.filter(entry => !evicted.includes(entry.key))
    .sort((a, b) => (a.lastPlayedAt ?? a.createdAt) - (b.lastPlayedAt ?? b.createdAt) || a.key.localeCompare(b.key));
  let size = retained.reduce((total, entry) => total + entry.size, 0);
  for (const entry of retained) {
    if (size <= MP3_CACHE_LIMIT) break;
    size -= entry.size;
    evicted.push(entry.key);
  }
  return evicted;
}
