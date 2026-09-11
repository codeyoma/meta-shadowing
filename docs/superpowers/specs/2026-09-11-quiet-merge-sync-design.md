# Quiet learning with merge-based cloud sync

Status: approved for implementation in conversation on 2026-09-11.

## Outcome and scope

After explicitly downloading a complete lesson package, a learner can study from
that package online or offline. Progress commits to the device before the next
learning boundary. Uploads happen independently, without success messages or
connectivity notices. A network request must never gate a cycle, phrase, or local
settings change.

The user approved merging learning records instead of replacing the cloud copy.
This design supersedes the manual-only learning-upload and whole-cloud-replacement
rules in `2026-09-09-device-first-learning.md` and
`2026-09-10-account-snapshots.md`. It preserves the package, local durability,
account isolation, and explicit local-restore guarantees from tickets #27–31.

Automatic sync covers active learning runs, completion history, and study days.
Learning options and preferred level remain device-local; their cloud transfer
remains explicit. Background progress uploads cannot change cloud options.
Cloud records do not automatically replace an active device's progress or options.

This work adds neither streaming fallback nor live practice leases. It does not
promise uploads while the browser is closed. Commit, push, remote CI, deployment,
hosted migrations, and issue updates remain separate actions requiring approval.
Preserve the existing uncommitted CI fixes.

## Current implementation and chosen approach

`device-learning-store.ts` already commits account-scoped runs and settings in
strict IndexedDB transactions. `local-learning-player.tsx` waits for those local
commits, not cloud acknowledgements. Preserve that boundary.

`account-snapshot-transfer.ts` currently uploads only on command;
`account-snapshot-repository.ts` unconditionally upserts the entire snapshot.
There is no durable background queue. The settings transfer controls, local-save
errors, and offline-shell registration also contain inline informational/error
alerts. Legacy cloud-preferences state still participates in the browse shell.

Use a durable device queue and one atomic server merge operation. Client-side
read/merge/replace is rejected because simultaneous clients can overwrite each
other. A full per-event replication system would add ordering, retention, and
migration work unnecessary for the current run-based model.

## Merge contract

Merge is scoped to the authenticated account. Input is projected through explicit
allowlists and validated before use. Package files, tokens, cookies, local writer
credentials/generations, and arbitrary object fields are excluded.

| Record | Rule |
| --- | --- |
| Distinct run IDs | Retain both, even for the same lesson and stage. |
| Same run ID | Lesson ID, published version, language, level, and stage must agree; otherwise reject the batch without changing cloud data. |
| Completed versus active copy | The completed copy wins; a late active upload cannot resurrect it. |
| Two active copies | Select one complete checkpoint by the total ordering below. Keep `nextUnit`, `nextPhrase`, cycles, and settings together. |
| Two completed copies | Keep one completion; earliest valid completion time wins, with canonical representation breaking a tie. |
| Active time for one run ID | Keep the maximum `activeMs`, never the sum of repeatedly uploaded copies. |
| Study days | Set union, sorted and deduplicated. |
| Missing entries | Absence is not deletion. Package deletion and an older local snapshot cannot erase cloud history. |

Order active checkpoints by the tuple `(nextPhrase, canonicalSettings,
confirmedCycles, nextUnit, canonicalRemainingFields)`, taking the greatest tuple.
Numbers compare numerically; canonical strings use fixed field/key order and
code-point comparison, independent of locale and arrival order. Thus settings
break a same-phrase tie before cycles when settings differ; equal settings allow
the higher cycle count to win. Exclude `activeMs` from this comparison and from
completion tie-breaking because it merges separately. SQL and application fixtures
must agree on the ordering, including normalized completion timestamps.

For grouped levels, `nextUnit` is a group index, not an absolute phrase index.
Never independently maximize checkpoint fields or compare group indexes across
different settings. A deliberate local rewind remains local; a cloud restore
resumes the farthest recorded checkpoint for that run. Distinct independently
started runs remain distinct; copies of one restored run share identity. Maximum
time is conservative for such copies and is not an exact sum of parallel practice.

Learning merge must be idempotent, commutative, and associative for valid compatible
records. Upload order and lost-response retries must not change the final learning
state. Preserve historical lesson versions. Continue the existing deterministic
run-ID selection when a restored stage has multiple unfinished runs.

## Atomic server boundary

Introduce a versioned merge request containing only changed runs/completions and
study days. Keep the validated portable snapshot format for explicit download and
recovery; a merge request is a separate protocol, not a permissive snapshot parser.

The authenticated route delegates to a single database transaction that establishes
the account row, locks it, validates both stored and incoming data, merges, validates
the result, and commits. Concurrent first uploads must serialize as well as updates.
An acknowledgement means the transaction committed. Identical retries are safe
without adding another completion or incrementing learning time.

Protect this invariant at the database write boundary, not just in the newest
browser client. Revoke direct authenticated insert/update access to the snapshot
table and replace it with a narrowly scoped merge operation. Keep owner-scoped
read RLS. The internal writer may use a private-schema security-definer function
because direct table writes are intentionally unavailable; it must check the
non-anonymous authenticated owner itself, use an empty search path and qualified
names, and expose only the necessary authenticated RPC entry point. Public and
anonymous execution are revoked. Do not introduce a client service-role key.

The database boundary must enforce the same allowed fields, account identity,
limits, and immutable run identity as the route. Direct RPC calls are part of the
security tests, not assumed to have passed route validation.

Legacy unversioned PUT requests receive an actionable client-update error from
the new server. An older deployed server's direct upsert must fail safely after
the privilege cutover rather than overwrite merged data. Existing valid cloud
snapshots remain readable; malformed stored data is preserved and reported, never
replaced with an empty record.

Keep existing byte/count limits for stored snapshots and bound incoming batches.
If a merge exceeds a limit, reject the entire transaction, retain local data and
pending items, and expose one actionable sync problem. Do not truncate history or
claim upload success. This change does not introduce retention or cloud deletion.

The locking and permission design follows the primary
[PostgreSQL locking reference](https://www.postgresql.org/docs/current/explicit-locking.html)
and [Supabase function guidance](https://supabase.com/docs/guides/database/functions).

## Durable device queue and scheduling

Extend the local database with an account-scoped outbox. Every changed learning
run/completion and new study day is queued in the same strict transaction as the
local record. Queue entries contain allowlisted portable values and a local change
sequence. Coalesce multiple changes to the same run; do not copy lesson files or
create an unbounded queue of individual cycles. Settings-only changes do not enqueue
automatic uploads. On first use after upgrading, enqueue existing learning records
once so earlier offline work is included.

The local transaction is the learning boundary. Queue network work only after it
commits. Serialization, authentication, requests, retries, and acknowledgement
bookkeeping never run inside the player's awaited save operation.

Mount an account-scoped coordinator in normal browse, player, and offline-shell
entry paths, not only while settings is open. Start with a five-second debounce
and a thirty-second maximum delay during continuous changes. Completion and a
reconnection may request an earlier flush. Send changed records only, with at most
one in-flight batch per coordinator; duplicate tabs remain safe through idempotent
server merge and transactional queue acknowledgements.

Use a ten-second request timeout and exponential retries from two to sixty seconds
with jitter, honoring a longer server retry delay. Do not schedule attempts while
known offline. Reopen, focus, and reconnect can resume pending work while the app is
running. These events do not display notices or import cloud state into the player.

An acknowledgement removes only the captured entry sequence and only under the
same account/access epoch and snapshot generation. A newer local edit remains
queued. A lost response, crashed tab, or failed local acknowledgement leaves safe
retry work. A bookkeeping-only failure does not block learning if new learning
transactions still commit; failure to commit new progress and its outbox does.

Transient network errors, timeouts, and server failures retry silently. Explicit
authentication rejection ends the applicable access and requires sign-in under the
existing access policy. Invalid-data, unsupported-protocol, and capacity errors
stop automatic tight-loop retries and surface once as actionable problems. Recheck
after a relevant local change, explicit retry, or a new authenticated session.

## Account changes, manual transfers, and recovery

Logout synchronously fences the coordinator and aborts in-flight requests before
clearing access. Retain pending learning under its original account. Resume only
after that same account authenticates again. Another account must neither inspect,
upload, nor acknowledge those records. Aborting a request cannot undo a server
transaction already committed for the original authenticated account.

Reuse existing logout behavior for this slice; do not add a new routine sync prompt
on every logout. A broader optional “sync and log out” flow belongs to #32. Apply
the queue/account fences now because automatic sync depends on them.

Keep explicit cloud restore and local recovery. Both retain confirmation, atomic
backup, and stale-writer invalidation. Pause capture during replacement and fence
old acknowledgements. Preserve previously queued unsent learning values even if
they are absent from the replacement; local restore is not a cloud deletion. New
changes use the new generation. Replaying old pending values may add history to the
cloud but must never restore them into the active local player automatically.

The manual upload control becomes “Sync now”: flush learning and explicitly export
current options without deleting cloud learning. Options use a separate revision
compare-and-swap within the transaction. On a revision conflict, keep cloud options
and offer an explicit retry rather than silently overwriting them. On an uncertain
response, read back the option revision/value; never blindly replay a settings
overwrite. Automatic learning retries carry no option mutation.

Routine successful transfers return the control to idle without a success alert.
No cloud snapshot or an empty restore candidate disables replacement and produces
one brief contextual dialog only after the user requests download.

## Notification policy

Use the existing centered shadcn dialog infrastructure; a new toast dependency is
not needed for this slice. Keep meaningful progress inside the control the user
opened. Notifications describe a problem and the available action, not internal
storage or network activity.

| Situation | Presentation and effect |
| --- | --- |
| Online/offline change, successful local save, queued upload, retry, sync success | No banner, toast, modal, or unsolicited live-region announcement. |
| Explicit package download | In-control progress, pause/resume, and ready state; no extra completion notification. |
| Temporary background network failure with usable local data | Silent retry; learning continues. |
| New local progress/settings cannot commit | One centered alert with retry/exit actions; prevent unsaved progression. |
| Required package absent, damaged, revoked, or known outdated | Gate only the affected learning action and show the relevant download/update/access action. Respect the existing finish-current-phrase update rule. |
| Explicit transfer/download fails, or sync cannot recover without action | One centered alert with retry/sign-in/update as applicable; preserve local learning when authorization and storage still permit it. |
| Explicit restore/recovery or app navigation risking unsaved work | Centered confirmation with safe default focus. The browser's native unload warning remains native. |

Deduplicate by problem and account; reconnect events must not reopen a dismissed
dialog for the same unresolved background problem. A fresh explicit action may show
its error again. A blocking local-save problem keeps the affected action disabled
even if its dialog closes. Focus is trapped in an open dialog, restored on close,
and visible at mobile and desktop sizes. Do not stack competing dialogs.

Remove routine explanatory copy from the offline catalog and transfer controls.
Keep available lessons, download readiness, actual empty states, and ordinary
loading accessibility. A service-worker preparation failure retries quietly; if
offline reopening cannot be made ready, show one actionable warning when the user
downloads/starts a package, rather than claiming offline readiness. This technical
failure must not be confused with a harmless connectivity change.

For the active browse shell, remove obsolete cloud-preference save/conflict notices
together with the associated device-owned selection/settings write dependency.
Retain server authentication and published-catalog access checks. If cached/local
content is usable, background refresh failure does not gate it; if a requested
action has no usable data, show the actual recovery action. Merely hiding a banner
while leaving an invisible server gate is not acceptable.

## Verification and delivery boundaries

1. Merge tests cover permutation order, duplicate batches, stale active uploads
   after completion, disjoint runs, shared restored-run identity, grouped settings,
   old lesson versions, conflicting identity, limits, and exact field rejection.
2. Local-store/coordinator tests cover atomic record+outbox writes, coalescing,
   edits during upload, lost acknowledgements, reload, retry timing, account A/B
   switching, logout/login, restore generation fences, and unsent-value retention.
3. Disposable local database tests exercise concurrent first writes and updates,
   RPC bypass attempts, foreign/anonymous access, legacy direct-write denial,
   transaction rollback, existing snapshot preservation, and settings conflicts.
4. Browser tests exercise all eight levels offline and with delayed/failed sync:
   audio and learning boundaries remain independent of responses; reload retains
   local work; reconnection eventually uploads it without routine notifications.
5. Positive notification tests verify centered actionable errors, retry behavior,
   keyboard/focus/contrast, and usable exit paths. Negative tests cover no routine
   status alerts during save, reconnect, retry, and success. Keep visible download
   progress and real failure assertions strict.
6. Replace only tests requiring manual-only uploads or destructive cloud overwrite.
   Preserve account isolation, complete-package gating, local durability, privacy,
   and history-navigation assertions. Update the superseded specifications with
   pointers when implementation adopts this contract.
7. Run unit tests, UI checks, typecheck, production build, local DB integration,
   and targeted desktop/mobile browser tests. Record actual outcomes; mobile
   emulation is not physical-phone validation.

Implement and test the merge/queue slice before wiring the quiet UI policy, then
run the integrated scenarios. No remote verification or publication is included.
Future rollout must deploy the safe database write boundary before enabling auto
sync. Rollback disables the coordinator but preserves the merge-only database
boundary, snapshots, outbox, and local learning; it must not restore destructive
legacy writes. Any hosted cutover requires separate approval.
