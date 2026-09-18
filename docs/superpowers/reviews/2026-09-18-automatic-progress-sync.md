# Automatic progress sync review — #50

## Scope

Three document reviewers examined reward safety, synchronization safety, and the
implementation/testing contract. Their feedback informed the approved design:
retain pinned player predecessors, reject incomplete candidate sets, preserve
original historical credit rules, and exercise network-return recovery.

Two independent implementation reviews used `09a4782` as the fixed dev baseline
and reviewed the follow-up changes to implementation commit `4034944`.

## Standards

- Resolved repeated per-unit projection that made checkpoint work quadratic.
- Resolved divergent remote/local serialization that repeatedly republished
  unchanged compressed ledgers. Both paths now use the canonical wire encoder.
- Replaced whole-ledger checkpoint persistence with per-run SQLite writes.
  Migration uses a savepoint; failure/retry tests preserve original evidence,
  revision and XP. Full merge/export retains whole-ledger validation.
- Final independent follow-up: no remaining actionable findings or documented
  standard violations. The reviewer independently ran 64 relevant tests.

## Spec

- Resolved browsing preferences overriding actual latest learning selection.
  Learning checkpoint clocks now independently select the resume offer. Ongoing
  browsing and live playback are not interrupted; safe entry applies the update.
- Verified adjacent-day copies of the same historical award preserve maximum
  credit once and both original completed study dates. Original v1–v3 validation
  still precedes migration.
- Final independent follow-up: no remaining actionable findings. Real-service
  acceptance is explicitly separate from implementation and local test evidence.

## Verification

- Typecheck: passed.
- Full TypeScript suite: 297 passed, 0 failed.
- Native CloudKit/lifecycle suite on iOS 27 simulator: 37 passed, 0 failed.
- Build-settings checks: 8 passed; free-package checks: 3 passed;
  native-header checks: 7 passed.
- iOS production JavaScript export: passed.
- Unsigned Release simulator build after final source changes: passed.
- Diff whitespace check: passed.

## Remaining acceptance boundary

#50 stays open until two authorized physical devices under the designated iCloud
account pass offline/reconnect, duplicate delivery, relaunch, live-player,
account-isolation and automatic-sync-off scenarios. No device reset, cloud schema
deployment, public distribution, push, or pull request was part of this work.
All participating clients must update together; older overwrite clients and
downgrades are unsupported. Background/terminated periodic execution is not
promised by the foreground 60-second polling behavior.

Summary: Standards — 0 remaining findings; Spec — 0 remaining findings. Physical
CloudKit acceptance remains pending, not a claim of a closed issue.
