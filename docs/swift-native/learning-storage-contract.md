# Swift learning and storage boundary (W3 / #94)

This implements the deterministic learning domain and local transactional store.
It is not the production player, media engine, CloudKit adapter or completed app.
The normal app remains the synthetic W2 library. A Debug-only storage probe adds
an end-to-end local confirmation/relaunch check without real content or accounts.

## Ownership

- `LearningDomain` owns validated plans, sixteen stage policies, pure transitions,
  grouping/regrouping, hints, reveal timing, preferences, rewards and backup values.
  It imports no SwiftUI, AVFoundation, SQLite or Apple service framework.
- `LearningPersistence` owns system SQLite through one actor. Each explicit
  profile has a hashed directory under the injected root; there is no scan of
  reference installations. SQLite connections and transactions never cross the actor.
- `AppFoundation.LearningController` coordinates commands and committed UI state.
  W4 will execute its transport requests; W5 will render the production screens.

The SQLite/controller actors are intentional despite the app's main-actor-first
view policy. Filesystem work does not run in a SwiftUI initializer.

## Consumer protocol

`LearningStore` is an actor protocol. `open(plan:preferences:writerID:)` returns a
`LearningSnapshot` containing a handle, writer version, paused session and progress.
An unfinished compatible checkpoint is restored; a completed checkpoint is history.
A new run requires a new run ID. Package/source identity mismatches fail rather than
silently selecting different lesson content.

Create `LearningCommand(handle:id:expectedVersion:event:)` for each user action.
Reuse its UUID only when retrying the same operation. The store reduces against
its pinned predecessor, not caller-provided XP or progress. Duplicate commands
return their original committed snapshot and zero newly earned XP; a conflicting
payload or stale writer/version is rejected. No-op events do not increment backup
revision. Revoke profile leases before replacing the active profile.

`LearningController.send`, `receive`, `retrySave` and `deactivate` serialize the
interaction boundary. A failed save leaves displayed progress unchanged, stops
accepted transport, and retains the command for retry. Retry is idempotent and
never resumes transport automatically. Deactivation rejects late publication;
it does not claim that an operation already committed to disk was rolled back.

Transport requests include writer, plan, unit, cycle and a separate generation.
The consumer must echo that token in callbacks, execute requests once, cancel
owned playback/reveal work before teardown, and never synthesize confirmations
from audio end. Position saves advance writer versions without invalidating the
live transport generation. Pause, navigation, replacement and teardown invalidate
old callbacks. Re-reading `state` does not replay transport effects.
An end callback arriving during a position save is retained and processed after
that commit, with its token checked again. Failure or teardown discards it safely.
Successful ordinary confirmation/Repeat starts the next cycle immediately;
audio Next uses the one-second entry delay. Silent Next has no audio delay.
Navigation selection stays paused. Retry and restore never trigger this chaining.

Stages 1–10 use three manual cycles with the third-cycle repeat/next choice;
repeat adds two cycles. Stages 7–10 group 2/3/4 source blocks. Regrouping retains
closed source progress, creates a new plan and deduplicates overlapping source
ordinals within one lineage. Stages 11–16 are silent reveal and credit only an
explicit confirmation. Entry delay and reveal timing are values, not timers.

## Atomicity, progress and preferences

Checkpoint, receipt evidence, completion, study day, backup revision and command
receipt commit in one `BEGIN IMMEDIATE` transaction. There is no suspension inside
the transaction. UI publication follows successful COMMIT. WAL, full synchronous
writes and a bounded busy timeout are enabled. Corrupt/future databases are not erased.

XP and completion evidence merge monotonically; resume/preferences use independent
logical clocks. A remote resume can win the slot without replacing an active
writer's predecessor. Passive saves cannot steal another run's resume slot.
Pause alone cannot promote the latest learning selection. Library browsing is
stored separately from `LearningProgress.latestLearning`.

Progress includes language XP/level/streak and package-specific completion counts.
Study dates use an injected clock/calendar at successful practice persistence.
Profiles isolate data; package versions isolate completion/resume identity.
Preferences include rate, group size, reveal WPM presets, view style and independent
optional source/translation fonts and sizes. Legacy missing typography stays absent.
Clearing library selection writes a clocked English/no-book selection (the default),
not a missing row that an older imported selection could resurrect. A nil language
with no book normalizes to this default; a book without a language is invalid.

## Local backup boundary

`exportBackup(profileID:)` returns canonical payload bytes, durable revision,
acknowledged revision and optional reset generation. This never uploads anything.
`mergeBackup` validates before mutation and merges in one transaction.
`restoreIntoEmptyProfile` refuses to replace nonempty progress or a leased profile.
`acknowledgeBackup` is monotonic and cannot exceed the current revision.

The codec accepts reference v1–v4 and a v5 reset envelope around v4; export is v4
unless a generation exists. Cross-generation ordinary merge is rejected. No reset
or CloudKit orchestration is implemented here. Payloads contain no sentence text.
Imported checkpoints receive real sources only when the installed plan is supplied.

Validation includes a 16 MiB UTF-8 payload limit, 4 MiB checkpoint-string limit,
100000-element/count bounds, duplicate-key rejection, compact-array expansion
bounds, valid dates/identities and cross-record receipt/completion consistency.
One shared 1000000-cell expansion budget covers inferred checkpoint/source/unit
arrays, legacy cycle arrays, compact sync arrays and receipt members. It is reserved
before allocation; normalized output must also fit the 16 MiB envelope. Valid but
larger histories are rejected without mutation instead of risking memory exhaustion.
Known legacy source projections normalize at decode for idempotence; opaque XP
candidates remain opaque. Import never manufactures a new reward or practice day.

## Verification

Run from the repository root:

```sh
swift test --package-path native-ios/Packages/LearningDomain
swift test --package-path native-ios/Packages/LearningPersistence
swift test --package-path native-ios/Packages/AppFoundation
node --import tsx scripts/swift-learning-reference.ts --check
```

The last command is a local-only oracle using the retained TypeScript reference;
it is not hosted application CI. It checks deterministic synthetic fixtures for
all sixteen stages/group sizes, regroup/reveal sequences, level thresholds and
legacy/modern backups. Fixture generation uses fixed public data and dates.

Real SQLite tests exercise reopen, profile isolation, lost replies, stale writers,
read-only/busy/corrupt/future stores, every write boundary, import rollback and
acknowledgement. Controller tests cover committed publication, retry without
autoplay, deactivation and old/live transport callbacks.

On the dedicated iOS 27 Simulator, Debug `--ui-test-learning-storage` opens the
probe. `--ui-test-probe-id <UUID>` selects an isolated test namespace, not an
arbitrary path. XCUITest finishes a synthetic reveal, explicitly confirms one
phrase, observes 3 XP, relaunches and verifies unchanged progress while paused.
The probe is not compiled into Release. Existing navigation, foreground, Dynamic
Type and load-retry tests remain in the suite.

### Local acceptance result — 2026-09-28 (Asia/Seoul, UTC+09:00)

Verified on Xcode 27 / Swift 6.4, using a dedicated iOS 27 Simulator and the
fictional CI identity. These are local results, not claims about hosted CI:

- LearningDomain: 53 tests passed; LearningPersistence: 18 passed;
  AppFoundation: 20 passed. No failures or skips.
- Independent TypeScript oracle: fixture `--check` passed.
- XCUITest: all 4 tests passed, including confirmation/relaunch persistence.
- Fresh Debug and Release builds, installation and launch passed. Both product
  inspections passed with iOS 26 minimum and no Expo/React Native/JavaScript runtime.
  Debug links system SQLite. Release contains no storage-probe identifiers and
  opens the normal sample shell even when given the Debug-only launch argument.
- Workflow lint, fictional-identity clean-checkout configuration checks and all
  3 branch-policy regression tests passed. Custom issue-closing automation and
  its tests were subsequently removed at the owner's request.

Final review fixes include buffering playback-end during a position commit,
post-commit cycle continuation without retry autoplay, durable selection clearing,
aggregate backup expansion limits and validated scope/reward decoding.
An independent whole-change reviewer rechecked the corrections and reported
no remaining Critical, Important or actionable Minor findings in the W3 scope.

Media execution, finished UI, haptics, Apple services, account boundaries, physical
installation and release acceptance remain W4–W8 work. No benchmark or claimed
performance improvement is part of this ticket.
