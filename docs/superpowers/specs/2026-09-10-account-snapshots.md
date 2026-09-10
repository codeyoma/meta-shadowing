# Explicit account snapshots — ticket #31

Implements #31 under the approved device-first contract in
`2026-09-09-device-first-learning.md`. The device remains authoritative.

## Scope

Provide explicit upload, download, and local recovery from settings. No automatic
upload, background sync on reconnect, practice leases, package transfer, historical
cloud-record migration, or logout redesign. Do not modify hosted databases or deploy.
Schema migrations and integration tests run against disposable local Supabase only.

## Portable format

Use a versioned, strictly validated snapshot with account identity, preferred learning
level, learning settings, every lesson/version/stage checkpoint, completion history,
and study days. Export through an explicit allowlist, not object spreading the local
record. Exclude credentials, device access epochs, local write revisions, package
inventory/audio, device identifiers, and device-specific preferences.

Preserve run identities and confirmed progress. Allocate local concurrency revisions
when importing; remote revisions must never authorize a local write. Validate level
and stage compatibility, settings, timestamps, nonnegative safe integer counters,
cycle bounds, and duplicate run/completion identities. Unknown fields and unsupported
versions are rejected rather than silently discarded on import.

Initial limits: 2 MiB UTF-8 JSON, 2,000 active runs, 10,000 completion records,
36,600 unique study days, and 128 characters for each identifier. Enforce byte limits
while reading the request stream, not only from Content-Length. Exceeding a limit
leaves existing cloud/local state unchanged and presents a recoverable error; never
truncate history to fit. These are implementation limits, not retention policies.

## Server boundary

Add GET and PUT `/api/learner/snapshot`, using verified online learner authentication
and the repository's same-origin mutation protections. Derive ownership exclusively
from server authentication; reject a mismatched body account ID. Return private,
no-store responses and stable error codes without raw payloads or credentials.

Store one row per account in a dedicated `learner_snapshots` table. The row contains
account ID, snapshot schema version, validated JSON, and server update time. RLS
limits reads/writes to the authenticated owner. An atomic upsert unconditionally
replaces the complete row: no merge and no timestamp/revision conflict prompt.
GET distinguishes absence from a valid snapshot. Invalid stored data is an error,
never an empty replacement. No service-role authorization shortcut in learner APIs.

## Local replacement and recovery

Download first retrieves and validates a snapshot, then asks the user to confirm
replacement. No cloud row or an all-empty/default snapshot cannot erase existing
local progress. Settings-only snapshots with nondefault settings are valid.

In one strict IndexedDB transaction, retain the current account record as a single
recovery backup and replace the active record. Transaction failure preserves both
the previous active record and previous backup. The transaction rechecks account
access and fences old writers with a durable account generation checked by every
mutation; do not rely solely on per-run revisions, which can collide after restore.
Notify other tabs after commit so active players reload or stop safely.

Recovery is local and account-scoped. Confirm it, then atomically swap the backup
and current record, updating the generation again. This preserves a reversible
recovery point. A stale tab cannot overwrite the recovered state. The package
database and package grants are never modified; restored progress still requires
an installed, authorized package before playback.

## Transfers and UI

Use the existing settings surface and shared shadcn controls for upload, download,
and recovery. Show transfer-specific busy/error/result state only in that surface;
do not reintroduce automatic-settings-save banners. Confirmation explains replacement
and local recovery. Preserve accessible names, focus return, and disabled duplicate
actions during a transfer.

Capture the account/access epoch when an explicit transfer starts. Cancel requests
on account change, logout, or disposal, and recheck identity before accepting a
response or committing local data. Aborting a sent upload cannot undo a completed
server write; report an uncertain outcome honestly. Do not retry it automatically.
An explicit retry starts a transfer for the still-current account, with no persistent
queue. Other-account sessions never inherit a pending transfer or its payload.

## Boundaries and implementation sequence

1. Portable model/validation and projection tests in `src/lib/account-snapshot.ts`.
2. Durable account generation, atomic replacement, and recovery in the device store;
   test through IndexedDB in a real browser, including stale tabs and aborted writes.
3. Dedicated local migration, authenticated repository, and snapshot API; test RLS
   directly plus HTTP identity, size limits, and unconditional replacement.
4. Transfer controller and settings controls; test explicit-only networking,
   confirmation cancellation, missing packages, interrupted transfers, and recovery.

## Verification

Use red-green tests for each boundary, never relax existing privacy assertions.
Cover A/B denial, duplicate upload, empty/malformed cloud data, failed local commit,
recovery, concurrent tabs, account switching during held requests, and no automatic
upload on login, learning, reload, or reconnect. Run unit tests, UI checks, production
build, typecheck, disposable pgTAP, and desktop/mobile browser regression tests.
Independently review the completed behavior and privacy before ticket closure.

## Review status

The user approved this written design on 2026-09-10. Implementation and local
verification proceed under the companion plan; approval does not authorize
commit, push, hosted migration, or deployment.

Subsequently, the user authorized local acceptance and ticket closure, followed by
publication as a feature PR into `dev`. Hosted migration, merge, and deployment
remain outside that authorization.
