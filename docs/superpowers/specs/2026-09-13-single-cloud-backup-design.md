# Single account backup and cross-device continuation

Status: written specification approved by the owner on 2026-09-13. Implementation
is present with controlled regression verification. The final-review metadata-only
cleanup / pending-publication retry conflict has been corrected following the
owner's checkpoint request; see docs/cloudkit-progress.md. Live cloud migration
and physical multi-device acceptance remain pending.

## Approved outcome

- Maintain one recoverable progress backup per private iCloud account, not one
  per installation and not a current/previous version menu.
- Confirm the replacement before retiring its predecessor. Interrupted upload,
  quota failure, or cleanup failure must not sacrifice the last confirmed backup.
- A device with no unpublished local changes can adopt the latest cloud progress.
- If both local and cloud progress changed, require an explicit choice between
  continuing the cloud record and replacing the cloud record with this device's
  progress. Neither choice merges histories; both warn about the displaced data.
- Display one restore action with the last backup date and time.

This supersedes the per-writer retention and first-use-only restore portions of
`2026-09-12-cloudkit-progress-design.md`. Automatic semantic merging remains out
of scope; this is bounded cross-device continuation and conflict resolution, not
acceptance of every #50 or #51 journey.

## Constraints

- iPhone first, iOS 26+; Android remains deferred.
- Use the existing private CloudKit adapter and device-local SQLite. No Supabase,
  public database, backend, dependency change, or purchase-ownership migration.
- Preserve guest/account isolation, original completion identities, recorded XP,
  daily eligibility, unfinished checkpoints, and preferences.
- Learning remains local-first and never waits for a cloud acknowledgement.
- Do not change playback semantics or start audio during profile replacement.
- Routine success is quiet; conflicts and failed recovery are actionable.
- No commit, push, issue mutation, production deployment, or app uninstall is
  authorized by this specification. Preserve unrelated worktree changes.

## Alternatives and decision

1. **Shared head plus immutable replacement asset (selected):** retain the current
   validated asset until the new asset and conditional head update are confirmed.
   A durable cleanup queue then removes superseded data. Reuses existing transport
   boundaries while enabling account-wide concurrency control.
2. **Only hide older recovery choices:** smaller UI change but leaves cloud
   generations accumulating; does not meet the owner's request.
3. **Automatic history merge:** can preserve concurrent study from both devices,
   but needs separate checkpoint/reward conflict rules. Not included here.

## Cloud ownership and replacement

Use one reserved account-wide `ProgressBackupHead` record in the existing private
zone, with one current reference and no previous reference. Keep `ProgressBackup`
assets immutable, randomly identified, hash/size verified, and limited to 16 MiB.
Installation identity remains provenance, not a separate recovery namespace.

Publication carries the caller's last adopted backup identity (the base), the
captured local revision, and canonical JSON. Before publication, fetch and verify
the account and current head. Compare the current identity with the supplied base;
an unexpected difference is a conflict, not permission to overwrite it. CloudKit
record change tags must additionally reject a race after that fetch. Device wall
clock time and source-local revision numbers are not concurrency authorities.

Stage the new asset, confirm its server acknowledgement, then conditionally move
the shared head. Only a matching head acknowledgement permits acknowledging the
captured local revision and adopting the returned backup identity. Newer local
edits stay pending. Persist intent and expected base across crashes; retrying an
old pending publication must never silently rebase it onto a newer server head.
Recognize an already-committed identical publication without uploading it again.

Retirement is authorized only after a durable, validated shared head exists.
Delete only exact superseded progress-record identities in the dedicated zone;
never the current asset, an active pending asset, unrelated record types, or local
learning data. Cleanup is durable, retryable, and idempotent. A cleanup failure
does not undo a successful backup, but must remain visible as unfinished cleanup
when reporting whether cloud retention has been verified.

The shared head carries a bounded cleanup manifest of exact authorized legacy
snapshots and superseded asset identities. Fresh installations can resume that
intent without reconstructing deletion authority from a device clock or approving
newly changed legacy data. Subsequent head updates carry forward unresolved intent.

One maintained recovery version means one live head plus one referenced asset
after successful cleanup, not literally one CloudKit record. Minimal retired-head
metadata can remain to prevent unsafe deletion of concurrently mutable legacy
heads. In-flight or failed cleanup
may temporarily retain extra assets. Do not advertise historical-version fallback
after migration: corruption of the single backup cannot be repaired from a deleted
previous cloud generation.

## Local base and reconciliation

Persist the last adopted cloud identity with the account/profile mapping. Treat
existing installations without that marker as unknown-base, not empty cloud.
Installing a downloaded backup and switching its account mapping/base must be
crash-safe: prepare an inactive SQLite profile, validate all tables, then atomically
activate its mapping and base. Preserve the displaced local profile during this
operation; profile garbage collection is not part of this change.

Reconcile after account activation, on foreground opportunities, and on explicit
retry, including when there is no pending local upload. Serialize reconciliation,
publication, and user resolution so duplicate taps cannot start competing work.

| Local state | Cloud state relative to adopted base | Action |
| --- | --- | --- |
| Unchanged | Same | No work |
| Changed | Same | Publish conditionally |
| Unchanged | Newer/different | Validate and adopt cloud into inactive profile |
| Changed | Newer/different | Present conflict; no automatic upload or replacement |
| Any | Lookup failed or corrupt | Keep local data; report failure, never assume empty |

Capture account generation, profile identity, and local revision before download.
Immediately before activating downloaded data, pause/checkpoint any active session
through existing guards and recheck identity/revision. If checkpointing or another
edit changed the local data, stop automatic adoption and surface a conflict.
Never replace an actively mutating learning profile under a running player.

For an explicit conflict decision, bind the confirmation to the displayed local
revision and cloud identity. If either changes before completion, invalidate the
decision and ask again. Choosing this device still uses a conditional head update;
there is no unconditional force-overwrite mode. Choosing cloud does not award XP
or auto-resume audio. Account switches invalidate every old response and choice.

Cloud adoption also displaces any unfinished native publication. Capture its exact
native pending identity from the fresh account-scoped list and persist it with the
adopted base/profile in the same SQLite activation transaction. Retry cleanup after
activation or restart. Native cleanup checks that account and adopted base, then
conditionally adds only the captured pending asset to the shared head's cleanup
manifest before atomically clearing that pending intent. This metadata update keeps
the chosen progress identity, revision and date. Never infer pending identity from
the latest local revision, which may include edits after the failed upload. Until
authority publication and cleanup are confirmed, report cleanup as unfinished.

## Existing backup migration

Do not delete legacy per-writer heads just because the app starts. Establish the
shared backup from verified data first. For an existing account profile, compare
its canonical data with legacy candidates and preserve the owner's current restored
history as the intended migration source. If provenance is ambiguous or local and
remote contents differ, require explicit resolution instead of selecting by date.
An empty/default profile cannot silently supersede any existing cloud history.

A fresh installation encountering multiple divergent legacy backups may need a
one-time migration choice; explain it as migration, not a permanent version menu.
Once the shared head is confirmed, captured legacy heads are conditionally marked
retired using their original server change tags and stripped of recovery references.
Keep those minimal tombstones rather than deleting a mutable head by ID without a
change-tag guard. Their now-unreferenced assets are eligible for exact, durable
cleanup. A legacy head changed since migration intent is not automatically
reauthorized for retirement. New clients do not adopt legacy writes
in preference to an established shared head.

An older installed app can still publish its per-writer head. Updating all active
devices is required for the single-backup invariant. New code cannot retroactively
stop an old binary. Do not silently destroy newly discovered divergent legacy
history: surface the need to update/resolve it before cleanup. Do not claim a
strict cross-version singleton without a server-enforced compatibility mechanism.

## UI contract

- First recovery: `백업 복구` with last saved date and time, no numbered versions.
- Clean remote adoption is quiet and refreshes displayed progress/preferences.
- Conflict: explain that both devices have changed records and nothing was merged.
- Actions: `클라우드 기록 이어받기` and `이 기기 기록으로 백업 교체`.
- Confirm the selected replacement, naming which unsynchronized history will not
  be included in the chosen active/cloud record. Cancel leaves both untouched.
- Backup disabled means no automatic publication or remote profile replacement.
- Unavailable/offline/corrupt cloud preserves local learning and retry controls.

## Implementation boundaries

- `modules/progress-cloud/ios/ProgressStore.swift`: durable publication base,
  singleton head metadata, migration and precise cleanup state.
- `modules/progress-cloud/ios/ProgressTransport.swift`: conditional shared-head
  publication, singleton discovery, migration and safe cleanup eligibility.
- `modules/progress-cloud/ios/CloudKitService.swift`: preserve change-tag guards;
  allow only transport-authorized retirement while retaining account isolation.
- Native module and `modules/progress-cloud/index.ts`: typed base/ack identity
  across the bridge; identifiers stay out of user-facing labels/logs.
- `src/core/progress-sync.ts`: persisted account base, reconciliation state machine,
  inactive-profile activation and generation-bound resolution. Extract focused
  helpers where needed instead of embedding retention policy in UI components.
- `src/components/icloud-backup.tsx`: one recovery action and explicit conflict UI.
- Existing TypeScript/SQLite and native CloudKit test suites exercise these public
  boundaries. Keep prior sign-in/account-change fixes and unrelated UI work intact.

## Acceptance and failure tests

1. Sequential publications across two installation identities leave one live head
   and one asset after cleanup (minimal legacy retirement metadata may remain);
   reinstall exposes one normal recovery action.
2. Crashes before/after asset acknowledgement, head acknowledgement, local adoption,
   and deletion resume without losing the current backup or acknowledging new edits.
3. Two devices sharing a base race: one wins the head update, the other conflicts;
   retries and restarts cannot overwrite the winner implicitly.
4. Clean stale device adopts exact remote checkpoints/preferences and nonempty
   reward history without duplicate XP. Both-dirty devices require a choice.
5. Delayed download plus local edit/player checkpoint/account switch cannot replace
   newer local data. Stale confirmation is rejected for both resolution actions.
6. Guest history, disabled backup, no account, unknown account, offline, corrupt
   assets, quota, permission and storage failures preserve existing safety behavior.
7. Legacy migration never selects divergent histories by date and never deletes
   the only confirmed backup before the shared replacement is verified.
8. Run full TypeScript tests/typecheck, native tests and a signed build. Real
   CloudKit retention, clean-install restore and two-device continuation are
   separately reported physical/service acceptance; mocks are not that evidence.

## Written-spec review

Self-review completed for retention-versus-record-count wording, legacy-client
limitations, safe activation, stale confirmations, account separation and deferred
merge scope. Owner approved implementation. Retirement metadata was refined during
implementation to avoid unsafe ID-only deletion of mutable legacy heads. No remote
records changed.
