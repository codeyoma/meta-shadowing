# Private iCloud progress backup — #49

Status: owner approved implementation after a second consistency review.
The owner approved the local-first direction and test seams, and requested that
the final review include #45 as well as #49. This document does not record any
successful CloudKit configuration, upload, or recovery.

## Goal and boundaries

A learner studies the controlled sample, saves completed and unfinished practice
on the phone, and backs that progress up to their private iCloud database. A fresh
installation can recover successfully synchronized progress without awarding XP
again. Learning never waits for a cloud response.

SQLite belongs to each installation, not a developer-operated user database.
CloudKit stores progress privately for the signed-in iCloud user. StoreKit remains
the separate authority for purchases. No Supabase, email signup, administrative
user database, purchased lesson payloads, or public CloudKit records are added.

#49 demonstrates one learner's backup and clean-install recovery with the sample.
Concurrent two-device reconciliation belongs to #50; comprehensive account-change
and deletion journeys belong to #51. Basic account isolation and stale-operation
protection are mandatory here and cannot be deferred to those tickets.

## Current implementation

- `Journal` commits checkpoints, completion identity, and reward history to
  `learning-v1.db`. Completion and XP writes already share a SQLite transaction.
- Settings and library selection use existing SQLite key-value entries.
- `getJournal()` currently returns one process-wide journal without account scope.
- No CloudKit capability or container is configured in the generated entitlements.
- Existing #45 purchase/restore and unrelated UI edits remain uncommitted. Preserve
  them; do not stash, reset, or incorporate unrelated edits into #49 commits.

## Architecture decision

Keep the existing SQLite learning model and introduce a native CloudKit adapter
using CKSyncEngine. Apple recommends this engine for applications bringing their
own local persistence; it supplies scheduling and transient retry support, while
the app remains responsible for its data model and local state.
[Apple's synchronization overview](https://developer.apple.com/videos/play/wwdc2023/10188/).

Alternatives considered:

- Migrating learning storage to Core Data would replace the working journal and
  enlarge the migration and reward-regression surface. Not selected for #49.
- Manual-only upload/download would be smaller, but would leave routine progress
  unprotected when the learner forgets to initiate a backup. Not selected.

Keep three explicit boundaries:

1. **Learning store:** synchronous durable local saves, account-scoped reads,
   versioned export/import, and an atomic pending-backup revision.
2. **Backup coordinator:** opt-in/import consent, active account generation,
   pending work, restore validation, and user-visible recovery states.
3. **Native CloudKit adapter:** private-database access, account status and change
   events, persistent engine state, cloud acknowledgements, and sanitized errors.

## Account and consent behavior

The existing database and preference keys are the guest profile. Preserve them
without clearing or silently assigning them to the first detected iCloud account.
Separate iCloud profiles use distinct local storage namespaces; account identifiers
stay local and must not appear in logs, screenshots, committed configuration, or
user-visible labels. Namespace derivation is not an encryption boundary.

Settings gains an iCloud backup entry. Enabling it requires a confirmed native
iCloud identity. If local guest data exists, offer an explicit choice to import it
or keep it separate. Declining preserves guest data and performs no guest upload.
Users can continue studying locally without enabling iCloud backup.

Before importing, fetch the account's existing backup. An existing cloud history
must not be replaced by an empty/default profile or silently combined with a
divergent guest history. Restore it into its own profile while preserving guest
data separately. Any ambiguous combination remains blocked with an explanation;
cross-device/history reconciliation is not invented in this slice.

After consent, synchronization runs quietly. No separate Apple login UI is added:
the device's iCloud account and the App Store purchasing account remain distinct.

Every asynchronous operation carries the account namespace and session generation.
On a confirmed sign-out or switch, invalidate old callbacks, stop old-account work,
pause/checkpoint the old learning session, and replace active journal/settings/UI
references before another account can be used. Do not relabel old progress as
guest data, reuse its queued records, or copy it into the new account.

A temporary account lookup failure is not confirmed sign-out. Preserve the last
local profile for offline use, suspend cloud operations until identity is confirmed,
and never select a new identity by assumption. No-account startup supports guest
learning. Switching profiles must not start audio or count a completion.

## Backup and restore contract

Serialize a versioned logical backup, not a live SQLite file or its WAL. The backup
contains a consistent set of:

- Package/version, stage, run identity, and completed-run history.
- Unfinished session state, including phrase, confirmed/planned cycles, phase,
  media position, playback rate, and frozen remaining time where applicable.
- Original reward amounts, daily eligibility, and study dates needed to reproduce
  XP and streaks; no new reward calculation using the restore date.
- Learning preferences and selected language/book, validated through the existing
  domain decoders and current catalog.

Preserve existing run identities and zero-XP records. Legacy history without reward
records remains without invented rewards. Repeated delivery of the same backup or
completion cannot change totals or produce another completion.

Each backup generation is an immutable, uncompressed UTF-8 JSON asset with a
16 MiB application limit. Validate the byte limit before parsing and validate all
rows with bounded domain schemas before importing. This is a progress-data limit,
not a limit on lesson downloads; exceeding it pauses cloud backup with an
actionable message and leaves local learning intact.

Use two private record types in a dedicated progress zone:

- `ProgressBackup`: schema version, random generation identity, source-local
  revision, opaque installation-writer identity, byte count, SHA-256, and the asset.
- `ProgressBackupHead`: one pointer per installation writer, identifying its
  current and previous completely acknowledged generations and checksums. Both
  referenced generations remain discoverable for recovery.

Persist a fresh random writer identity per account profile on each installation;
never derive it from a hardware identifier. Upload the immutable backup first.
Only after its acknowledgement may the head be advanced, using the server change
tag rather than an unconditional overwrite. An unexpected head conflict stops
publication for recovery, preserving both generations. Mark the revision backed
up only after the matching head acknowledgement. Restore follows a head, validates
its referenced generation and hash, and ignores unreferenced/incomplete uploads.

Coalesce pending changes, allow one generation in flight per profile, and schedule
ordinary publication no more often than once per minute while active. Explicit
retry and lifecycle opportunities may flush sooner, but cannot promise background
execution. Keep the newest local revision pending behind an older in-flight one.
Keep the current and previous acknowledged generations for this writer. Only after
the new head is acknowledged may older superseded generations from this writer be
removed; never remove a referenced generation, another writer's backup, or local
learning history. Persist the exact cleanup candidates so interruption is retryable.
Replaced, unreferenced uploads from this writer are also cleanup candidates. A quota
error must not trigger deletion of the last good backup to make room for its
unacknowledged replacement. Record bounded retention and asset growth in tests.

This avoids a mutable whole-account last-writer-wins snapshot: another installation
cannot silently erase this installation's generation by advancing its own head.

Retain divergent source generations instead of merging them by device wall-clock
time. In #49, a clean installation may restore an explicitly selected complete
backup when more than one candidate exists. #50 will define automated convergence.
The selection must not expose device/account identifiers.

Apply a validated backup transactionally into an inactive account profile, then
publish the active profile only after installation succeeds. Do not call the
normal completion-awarding action while importing. Missing or incompatible lesson
content keeps its history but does not make the player ready or reinterpret a
checkpoint against different phrases.

## Durability and failure handling

Commit each local learning change and its pending revision together. Preference
and selection mutations must also become durable pending changes. Native delivery
may occur later; a crash between the local commit and bridge delivery must remain
recoverable on the next launch.

Persist CloudKit engine state per account. Preserve pending work until the native
adapter reports the relevant cloud acknowledgement. An acknowledgement for an older
revision cannot mark a newer edit backed up. Incoming work must be durably staged
before transport progress is advanced; interrupted imports are retryable.

Use native scheduling and transient retries, with no tight polling loop. Quota,
configuration, unsupported-data, and permission failures remain actionable in
Settings; routine saves, connectivity changes, and successful uploads stay quiet.
Local learning continues during cloud failures. Local storage failures retain the
existing pause-and-retry behavior and never claim a successful save.

Do not promise immediate synchronization after force-quit or recovery of unsent
progress after uninstall. User-facing erasure of cloud history belongs to #51;
retiring superseded backup generations does not erase the history they contain.

## Apple setup and privacy gate

Use an owner-confirmed container through ignored local configuration and an Expo
config plugin. Do not fabricate a live container identifier or manually maintain
generated Xcode project changes. Enable the required iCloud/CloudKit and remote
notification capabilities with matching signing. Verify development configuration
before any controlled cloud test. Production schema deployment and public release
are not authorized by this design.
[Apple CloudKit setup](https://developer.apple.com/documentation/cloudkit/enabling-cloudkit-in-your-app).

Real upload and reinstall testing require a designated iCloud test account and
valid signed build. The Sandbox purchase account does not satisfy that identity
requirement. Missing access is a reported acceptance blocker, not a reason to
substitute another backend. Do not delete the owner's installed app or unsynced
data for a recovery test without explicit approval and a recoverable test plan.

## Approved test boundaries and acceptance evidence

Use red-green TDD at the approved public seams:

1. Save/export/restore through the learning-store interface: unfinished cycles,
   original reward history, repeated restore, and transaction failure preservation.
2. Backup coordinator actions: explicit consent, guest preservation, profile
   isolation, and stale-account completion rejection.
3. External CloudKit boundary: no account, offline, delayed acknowledgement,
   restart retry, quota failure, incomplete generations, and rejected remote data.

Prefer a real test SQLite database for durable behavior. Test doubles belong at
the external cloud/time boundary, not inside the coordinator's own collaborators.
Local tests are not evidence that Apple's servers accepted a backup.

Run focused tests and typechecking during implementation, the full suite at the
end, and relevant native build/runtime checks. Separately demonstrate a real
sample completion plus unfinished cycle, confirmed cloud backup, and recovery
after a controlled clean installation with identical history and no duplicate XP.
Leave #49 open if actual cloud recovery remains unverified.

## Review and commit scope

The final Standards and Spec reviews include #45 and #49 from the completed #44
baseline `6ebb68b97a0ecc26bf8b3e9e074c68fe6eab0066`. Include committed #45 work and
its pending purchase-restore follow-ups; explicitly exclude unrelated branding,
playback-speed, and navigation edits from ticket findings and commits.

Commit only inspected task changes on the current branch. Preserve other work,
use the repository's verified no-reply identity, and scan the exact staged payload
for private identifiers, paths, credentials, and lesson content. No push, merge,
issue closure, real-money purchase, or release is implied.

## Second consistency review

- Store settings/selection in the account profile's transactional store, not a
  separate key-value commit during restore. Keep legacy guest keys readable.
- Include the previous generation in the published head, so retaining its asset
  actually permits recovery when the current generation is damaged.
- Bind an in-flight player's save closure to its original profile; changing a
  global journal must not redirect a late pause/save into another account.
- Never replace a nonempty active profile on delayed fetch. First-time restore
  targets an inactive profile and requires consent; regular fetch cannot overwrite
  local edits. Multi-device merge remains #50.
- Treat transport failures as unknown availability, never as an empty cloud backup.
  Guest import or empty-profile publication requires a successful initial fetch.

These corrections refine the approved safety boundaries without adding a backend
or extending the ticket to two-device merging. Implementation proceeds from the
companion plan; live CloudKit acceptance remains separately gated.
