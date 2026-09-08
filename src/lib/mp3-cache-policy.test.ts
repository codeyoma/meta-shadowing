import { describe, expect, it } from "vitest";
import { cacheExpiresAt, cacheEvictions } from "./mp3-cache-policy";

describe("MP3 retention", () => {
  it("expires unplayed audio at exactly 20 days and renews only from actual playback", () => {
    expect(cacheExpiresAt({ createdAt: 1000, lastPlayedAt: null })).toBe(1728001000);
    expect(cacheExpiresAt({ createdAt: 1000, lastPlayedAt: 9000 })).toBe(1728009000);
    const entry = { key: "unplayed", createdAt: 1000, lastPlayedAt: null, size: 10 };
    expect(cacheEvictions([entry], 1728000999)).toEqual([]);
    expect(cacheEvictions([entry], 1728001000)).toEqual(["unplayed"]);
  });
  it("cleans expired files first, then the least recently played files within 100 MiB", () => {
    const entries = [
      { key: "played-recently", createdAt: 1, lastPlayedAt: 10000, size: 40 * 1024 * 1024 },
      { key: "prefetched", createdAt: 9000, lastPlayedAt: null, size: 40 * 1024 * 1024 },
      { key: "played-long-ago", createdAt: 2, lastPlayedAt: 5000, size: 40 * 1024 * 1024 },
      { key: "expired", createdAt: -1728000000, lastPlayedAt: null, size: 10 },
    ];
    expect(cacheEvictions(entries, 11000)).toEqual(["expired", "played-long-ago"]);
    expect(cacheEvictions([{ key: "oversized", createdAt: 0, lastPlayedAt: null, size: 104857601 }], 1)).toEqual(["oversized"]);
    expect(cacheEvictions([{ key: "exact-cap", createdAt: 0, lastPlayedAt: null, size: 104857600 }], 1)).toEqual([]);
  });
});
