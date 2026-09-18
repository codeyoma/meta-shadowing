# Account isolation and data deletion — #51

Status: owner approved the detailed design on 2026-09-18; local implementation and independent reviews complete. Physical-device and live CloudKit acceptance remain open.
Base: merged #59 on dev, `7c4ff529e2581fa7bbc9a222c51e98613f1d82c5`.

## Intent and constraints

Implement safe account changes and explicit deletion in the existing native
iPhone app. Keep package files, progress identity and StoreKit ownership separate.
Use the current SQLite and CloudKit boundaries; no new backend or Supabase.
Never perform destructive acceptance against the owner's actual learning data.
Two-device real CloudKit acceptance remains deferred, not silently passed.

The user approved these distinct actions:

| Action | Removed | Preserved |
| --- | --- | --- |
| Remove downloaded book | Selected installed package files/cache | Learning history, settings, cloud progress, purchases |
| Remove records on this device | Current profile's progress and settings, queued local publication payloads | Cloud progress, downloaded books, other profiles, purchases |
| Delete iCloud learning data | Current account's progress/settings and superseded cloud backup payloads; matching local history | Downloaded books, other accounts, purchases |

Account deletion here means app learning data, not deletion of the Apple account
or App Store purchase history. Guest users can perform local deletion only.
Purchase access is always resolved through existing verified StoreKit logic.

## Existing seams and gaps

- `ProgressProfiles` isolates guest/account databases; `ProgressSync` invalidates
  asynchronous work and exposes synchronous before-switch checkpoint guards.
- Native `ProgressCloudOwner` cancels work on CKAccountChanged. Current JavaScript
  refresh retains the previous profile in some unknown/unavailable cases; that
  cannot expose account-private content during an unresolved account transition.
- `ProgressTransport` already conditionally publishes a singleton head and keeps
  durable cleanup authority. Its cleanup is not an account-data deletion API.
- Package removal exists separately and preserves learning records.
- There is no user-facing progress deletion, persistent deletion intent, or
  deletion generation understood by reconnecting devices.

## Approach and alternatives

Use an explicit reset generation carried by the authoritative cloud head and
progress envelope. Merge only within a generation; observing a newer authoritative
generation invalidates old local checkpoints and queued writes before publication.

Do not publish an ordinary empty v4 backup: #50 correctly unions it with old
records, which would resurrect the data. Do not simply delete/recreate the zone:
absence alone cannot distinguish first use from a deletion and loses the durable
boundary stale devices need. Do not introduce per-sentence tombstones: this ticket
deletes the complete current profile, not arbitrary subsets of its learning rows.

## Account transition and local privacy

On an account-change notification, synchronously pause/checkpoint the outgoing
player, invalidate JavaScript/native operation generations, and hide its profile
before waiting for identity resolution. A failed checkpoint stops playback and
reports a storage error; privacy hiding still happens, with no upload to a new
identity. The account profile remains isolated on disk unless explicitly deleted.

After verified identity resolution, select only that account's existing profile
or an unimported guest profile. Never implicitly import the old account or guest
data. A to B to A recovers each account's own surviving records. Missing/restricted
identity shows guest state and an actionable sync status, not the old account UI.

Ordinary network loss without an account-change signal must not erase a previously
verified local session. Distinguish connectivity failure from identity invalidation;
never upload until native identity is verified again. App resume must not autoplay
an account-switched player's old session.

## Local-only deletion

Confirm that the operation affects only the currently displayed profile. Capture
profile identity and operation generation so switching accounts invalidates the
confirmation. Pause the player and disable automatic sync before removing data.

Persist a local wipe intent outside the target progress tables. Transactionally
clear its learning rows, preferences, sync ledger and revision state, and retire
exact native queued payloads for that profile. Clear guest preference fallbacks
when the guest profile is the target. Do not use broad filesystem deletion.

Crash/retry must finish the same wipe before opening that profile. Late player
writes and cloud responses cannot repopulate it. Clear mounted state only after
the local wipe succeeds; report storage failures without claiming completion.

Leave cloud data intact and automatic sync off. Explicitly enabling/manual syncing
later can recover cloud history; explain that in the confirmation. A local wipe
must not cancel an already accepted cloud-delete intent or transfer it elsewhere.

## Cloud deletion protocol

1. Capture the verified account, expected reset generation and unique request ID
   in durable account-scoped intent before any mutation. Confirm scope and pause
   current learning. Never create a fresh request ID on a retry.
2. Suspend ordinary uploads for that account. Offline requests remain visibly
   pending; do not display cloud deletion success. Keep the affected account's
   player unavailable until its destructive request reaches a safe resolution;
   other accounts and explicitly selected guest learning remain independent.
3. Fetch the authoritative head and validate identity before writing. Commit a
   fresh reset generation/empty learning envelope using conditional head update.
   The head and envelope must describe the same generation. A stale base causes
   refetch, never an unconditional overwrite or a merge of pre-reset history.
4. A lost reply is recognized by the persisted request/generation, including when
   later legitimate progress already exists in that generation. Never issue a
   second reset merely because the original response was lost. Concurrent requests
   sharing the pre-reset generation may adopt the committed boundary rather than
   erase later-generation learning again.
5. Transactionally apply the boundary locally, remove old learning/settings and
   queued payloads, and persist the observed generation. Keep retry metadata
   outside cleared tables. Late writes from the old player must be rejected.
6. Remove superseded app-owned backup assets/records using durable, exact cleanup
   authority. Recheck the current head before each deletion; never remove the
   current generation's progress or another profile's files. Retry partial cleanup
   after process termination, lost acknowledgements and connectivity failures.
7. Report completion only after the reset and required cloud payload cleanup are
   confirmed. Leave automatic sync off on the initiating device until the user
   explicitly enables it again. New local learning starts in the accepted generation.

Retain only minimal reset/protocol metadata needed to reject old queued history;
this marker contains no sentences, XP, settings or transaction data. Explain this
retention in deletion copy/docs rather than claiming every CloudKit record vanishes.

Other devices process the boundary before their next authorized merge/upload.
Old-generation local progress, including unsynced learning on a stale device, is
discarded under this explicit account-wide reset. Deletion cannot instantly clear
an offline device's storage or UI. Devices with sync disabled observe the boundary
when they next explicitly synchronize; they may not upload the old generation.

## Compatibility and recovery

Version the envelope/protocol so #50 clients cannot interpret a reset envelope as
an ordinary mergeable v4 snapshot. Preserve v1–v4 import only for first migration
before any deletion boundary; never automatically re-import legacy heads after a
reset. Native pending publications bind the expected generation and head token.

All participating installations must update before cloud deletion is supported.
Older historical overwrite clients and downgrades remain unsupported; do not claim
a server-enforced minimum app version or deletion safety against arbitrary old
clients. Automated tests must include stale #50-format input and native pending
publications. No production schema deployment is authorized by this design.

Corrupt metadata, unknown future versions, quota/permission errors and partial
fetches leave the operation pending/failed with safe retry state. Do not guess a
generation, silently start empty, or convert a failed fetch into permission to wipe.
Changing accounts suspends the original account's intent; switching back resumes
only that exact intent after verified identity. No action targets the new account.

## UI and implementation boundaries

Keep book-file removal in its existing library control. Add a data-management
surface under Settings with separate local and iCloud actions and destructive
confirmation text listing preserved purchases/books. Show a persistent pending
deletion status and retry action; ordinary synchronization remains quiet.

Keep deletion policy/state transitions in focused shared core modules, native
CloudKit CAS/cleanup in the current transport, and confirmation copy in a pure
testable UI helper. Extend the existing profile/coordinator/native interfaces;
avoid a second independent sync engine or changes to learning/reward rules.

## Verification contract

- Baseline and full TypeScript suite/typecheck; focused real-SQLite deletion tests.
- Account A to B to A, no account, restricted/unknown identity after a notification,
  ordinary offline continuation, and account change during confirmation or upload.
- Local wipe of guest/account, legacy preference fallback, storage failure,
  relaunch, late player save, retained packages/purchases and unrelated profiles.
- Two independent installations: stale queued uploads versus reset in both orders,
  repeated reset/relaunch, concurrent reset, lost commit response, new-generation
  learning, old-envelope migration rejection, and partial cleanup failure/retry.
- Native fixture tests for conditional head conflicts, precise record cleanup,
  account cancellation and pending publication fencing. No real cloud deletion.
- Confirmation scope/accessibility, iOS JavaScript export and Release simulator
  build. Record measured results separately from physical/live-service acceptance.

No app behavior has been changed by this design document. Implementation follows
written-design approval, with test-first slices and independent review before
any separately authorized commit/push/PR.

## Platform references

Apple documents per-zone atomic record batches and application handling of
server-record conflicts. Neither supplies the app-specific reset generation or
deletion-completion policy defined above:
[record batches](https://developer.apple.com/documentation/cloudkit/cksyncengine-5sie5/recordzonechangebatch),
[CKSyncEngine](https://developer.apple.com/documentation/CloudKit/CKSyncEngine-5sie5).
