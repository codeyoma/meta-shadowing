# Device-first learning: confirmed design

## Authority and scope

The device is authoritative for learning progress, completion history, and learning
settings. Learning never waits for a network acknowledgment. The cloud stores an
explicitly uploaded account snapshot, not a live practice lease. Separate devices
may learn independently. No implicit merging or device-takeover enforcement.

This specification authorizes implementation, not hosted data deletion, publishing
commits, merging, or deployment. Existing test progress is not migrated into the new
local model. Accounts, published lessons, audio, and existing database tables remain
intact. The new namespace starts empty.

## Packages

- Users explicitly download an entire published lesson before learning.
- A package contains text, all audio, lesson-specific dictionary data, and persisted
  sentence analysis. Acquisition is authenticated and publication/version scoped.
- Download progress and resumable failures are visible. Incomplete or corrupt
  packages never become playable. There is no streaming fallback.
- Retain packages until explicit removal rather than applying the old MP3 TTL/LRU.
  Request persistent browser storage; do not promise storage survives browser/user
  deletion or OS eviction. Detect missing files and require download again.
- Retain reusable files after logout. File retention does not grant another account
  permission to use them. Account-specific authorization is separate from bytes.
- Package deletion preserves progress and completion history.
- Reconnection checks for explicit authorization rejection and published updates.
  Offline learning remains permitted for a previously authenticated account.
- A detected update allows the current phrase to finish, then blocks another phrase
  until the replacement is complete. Preserve the old package until replacement
  succeeds. Reset unfinished progress for the new version; preserve old history.

## Local state and snapshots

- Persist all lessons' progress and completion history, plus learning settings,
  separately per account. Persist cycle confirmations and phrase boundaries.
- Local durability is required before crossing a phrase boundary. Local write
  failure pauses before the next phrase and offers recovery; never silently claim
  success or fall back to memory-only storage.
- No automatic server progress writes, ownership renewals, or per-play checks.
- Explicit upload unconditionally replaces the account's cloud snapshot. No merge
  and no stale-device conflict prompt. A failed explicitly requested upload may be
  retried while that account/session remains active. Logout cancels future retries.
- Explicit download replaces local progress/settings after confirmation, atomically
  retaining a recovery backup. An empty cloud account must not erase local state.
- Snapshots exclude credentials, downloaded files, package presence, and device
  preferences. They contain a schema version and validated learning records only.
- Downloaded state never means that its lesson packages are installed locally.

## Authentication and logout

- Initial login, acquiring packages, and snapshot transfer require valid online auth.
- A previously authenticated account can learn locally offline until explicit logout.
- Explicit rejection on reconnect blocks access; a transient network failure does not.
- Offline logout saves local state and logs out without queued future uploads.
- Online logout offers sync then logout, retry on sync failure, or logout anyway.
- Unsynchronized local records survive logout, accessible only to the same account
  after login. They must never be uploaded under a subsequent account.

## Navigation and settings

- Render the locally stored catalog immediately; refresh in the background.
- Show skeletons only without usable local content. Network refresh cannot disable
  local learning settings or blank an already rendered page.
- A shared full-screen settings drawer opens above language, lesson, and stage
  screens, preserving the underlying route and scroll position.
- Drawer sections: account/logout, learning settings, downloaded packages, explicit
  cloud upload/download and local recovery. Settings save locally immediately.
- Preserve accessible labels, focus containment/return, keyboard behavior, safe-area
  padding, and existing shadcn primitives.

## Acceptance

- All eight levels work from complete packages without a network connection.
- Three listening confirmations have no checkpoint/renew HTTP dependency.
- Reload preserves progress/settings; denied local storage cannot lose work silently.
- Two devices remain independent until explicit upload/download.
- A/B account switching cannot expose or synchronize another account's records.
- Interrupted/corrupt downloads cannot start learning; deletion preserves history.
- Updates stop at the phrase boundary, not mid-phrase; old completion history survives.
- Catalog navigation and opening settings require no blocking network round trip.
- New tests assert these outcomes rather than obsolete server-lease behavior.
