# Account-scoped MP3 cache (#22)

This cache is independent of the cloud-progress feature gate. It does not migrate,
read, write, or reset learning records. It adds no service worker or offline study.

## Storage and retention

Only the `meta-shadowing-mp3-v1` IndexedDB database is managed by this feature.
Each entry contains a key (account UUID, lesson ID, published version, canonical
audio ID), MP3 Blob, format, byte size, creation time, last actual playback time,
and expiry time. Signed URLs, response headers, tokens, settings, progress, and
study days are not stored in the cache.

Unplayed prefetches expire exactly 20 × 24 hours after creation. A `playing` event
followed by advancing media time renews retention. Fetches, cache reads, seeking,
and rejected playback do not renew it. Startup and every cache operation prune
expired entries. No deletion task runs while the browser is closed.

The total budget across this app's cached accounts is 100 MiB. Expired entries go
first; remaining eviction order uses last actual playback, or creation for never
played entries. Read/write transactions serialize capacity checks across tabs.
Oversized downloads use native streaming rather than persistent storage.

Storage denial, quota errors, and browser eviction are cache misses, not learning
failures. Only successful, complete MP3 responses that pass signature and browser
decoding checks are stored. Partial, malformed, unreadable, or damaged entries
cannot count as a listen. Retry fetches fresh audio; corruption removes only the
affected entry. M4A and WebM retain online playback without persistent caching.

## Access and playback

`GET /api/lessons/[id]/audio/[phraseNumber]/access?version=...` uses the existing
verified Google identity, beta pass, and published lesson/version lookup. Its
private `no-store` JSON response contains only account/lesson/version/audio IDs
and format. It does not return a signed URL or acquire practice ownership.

The player verifies access when preparing audio and before each play. Current
and next recordings remain the only live audio handles. While playing, access
is checked every eight seconds; an unverified ten-second interval stops playback.
Offline, visibility, focus, and account changes invalidate pending playback.
On logout/account change, old handles are revoked and this feature's previous
account entries are removed. Cleanup failure cannot make those keys reusable by
the next account. Other apps' storage and old learning keys are not deleted.

When a mobile browser rejects asynchronous `play()`, the player stays paused and
offers Continue. A second tap can synchronously finish that same prepared play
request using its same-source, same-account online check, valid for at most three
seconds. After that interval, access must be checked again. A failed request does
not renew retention or increment the learning cycle.

## Verification and release limits

Run against disposable **local** Supabase only, with Node 24:

```sh
SUPABASE_TEST_WORKDIR=<local-test-stack> PLAYWRIGHT_PORT=3040 NEXT_DIST_DIR=.next/cache-test npm run test:mp3-cache
SUPABASE_TEST_WORKDIR=<local-test-stack> PLAYWRIGHT_PORT=3040 NEXT_DIST_DIR=.next/cache-production PLAYWRIGHT_PRODUCTION=1 npm run test:mp3-cache -- --project=mobile --project=desktop
```

The test signs in real local Auth fixtures, reads real publication state, and
downloads a generated tone from private local Storage. A persistent browser
profile is closed/reopened to verify body reuse. Controlled time and storage/
transport failures exercise retention, capacity, corruption, account isolation,
and fallback. These are not physical-device or hosted Google OAuth results.

Before beta release, test on actual iPhone Safari/home-screen and Android
Chrome/installed screens: cold and warm first tap, rejected-autoplay recovery,
manual and automatic repeat, grouped next audio, pause/background/foreground,
offline recovery, logout/account switch, low-storage eviction, and reopen using
the same profile. Confirm that audio-access checks still occur on hits and a
revoked/replaced lesson cannot start or continue past the next check.

Twenty days is an application expiry policy, **not a storage guarantee**: browsers
may evict earlier. This is app-level access control, not DRM or remote retrieval
of bytes already delivered to a device. See the [browser storage limits](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
and [media play permissions](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/play).
