# Automatic multi-device progress sync — #50

Status: owner-approved behavior recorded; written-spec review pending.
Base: `origin/dev` at `09a4782` (merged #58).

## 사용자 경험

- 자동 동기화를 켜면 앱 실행·복귀, 온라인 복귀, 앱 사용 중 주기적으로
  같은 iCloud 계정의 학습 기록을 동기화한다.
- 오프라인에서도 먼저 기기에 저장한다. 동기화가 재생을 막지 않는다.
- 이어할 위치는 가장 최근 학습 지점을 자동 선택한다. 선택되지 않은
  과거 중단 지점의 별도 복구 목록은 만들지 않는다.
- 완료 기록과 확정된 사이클의 XP는 별도로 합친다. 이어할 위치가 이전
  문장이나 낮은 스테이지여도 XP를 줄이지 않는다. 재전송은 XP를 늘리지 않는다.
- 사용자는 기기별 기록을 선택하거나 충돌을 해결하지 않는다.
- 현재 재생 중인 문장을 원격 변경으로 갑자기 바꾸거나 자동 재생하지 않는다.

## Scope and authority

This is an architectural extension of the native #49 backup path, not a new
backend. Retain SQLite, the private CloudKit transport, account isolation,
conditional publication, and exact pending-asset cleanup authority. No Supabase,
StoreKit change, package payload upload, production schema deployment, uninstall,
or public release is included. #45 remains waiting on the owner's Apple process.

The owner's September 18 decisions supersede two older #50 requirements:

1. Competing unfinished resume snapshots need not remain recoverable or require
   a user choice. Select the most recent deterministically.
2. Current cycle rewards have no daily cap. Preserve historical rewards without
   creating new full-run bonuses or reintroducing retired daily eligibility rules.

Only obsolete resume snapshots may be superseded. Confirmed learning and reward
provenance are durable history, not disposable checkpoints. #49's open live-service
acceptance gates remain open; implementation here does not retroactively close them.

## Existing behavior and chosen approach

`ProgressBackupStore` exports validated v3 snapshots and restores only into an
empty profile. `ProgressSync` currently asks for a local/cloud winner on divergent
snapshots. Its timer primarily publishes pending local changes; a quiet device
does not continuously check for another device's changes. Native publication
already uses a shared recovery head and compare-and-swap (CAS).

Retain that native shared-head protocol and merge validated learning records on
the TypeScript side before conditional publication. A CAS race is an internal
retry condition, not a user-facing conflict. Replacing the whole profile with the
newest backup would lose offline learning; a new per-event CloudKit schema would
expand deployment and migration scope unnecessarily. Neither is selected.

## Durable records and automatic selection

- Keep package version, stage, and run identity on every relevant record. Distinct
  real runs remain distinct even when the stage is the same.
- Introduce versioned synchronization metadata and durable confirmation identity.
  Confirmation identity binds a run, saved unit, and cycle ordinal; transport
  retries and resumed copies of the same confirmation do not create new events.
  Validate immutable run-plan/source-weight bindings before merging.
- Union completion identities and earned-cycle evidence independently of the
  checkpoint winner. Derive rewards from the merged ledger, not a winning snapshot
  or the sum of two cached XP totals. Preserve a language's acknowledged local XP
  during valid same-account merging, subject to the existing integer saturation.
- Record the original learning date for history; synchronization is not study.
  Repeated delivery across midnight must not create a new study day or reward.
- Stamp local learning mutations, not downloads, launches, or uploads. Use a
  persisted logical ordering key with physical time, counter, and random writer
  tie-breaker. Observe remote clocks before stamping subsequent local learning.
  Compare these keys consistently on every device; never use download order.
- Choose one whole resume snapshot per package version/stage. Do not splice audio
  position, phase, group plan, or cycle state from different snapshots. Keep a
  separately ordered latest learning selection for which book/stage to offer.
  Completion history may fence a stale unfinished snapshot of an already completed
  run; it must not reopen that run or earn its rewards again.
- Settings and browsing selection have their own mutation ordering; opening the
  app or receiving remote settings must not make an old checkpoint newer.
- Device clocks cannot prove the real-world ordering of independent offline
  actions when device clocks disagree. Deterministic convergence and XP safety
  are required; perfect offline wall-clock ordering is not promised.

## Migration and validation

Version the backup format; retain v1/v2/v3 decoding. Migrate existing completion
identities, historical awards, per-unit counts, and conservative legacy credit
fences without manufacturing confirmations from audio positions or old counts.
Copies of the same historical run must not add their opaque credited totals;
retain the existing credit once, with a conservative maximum when provenance is
incomplete. Distinct historical runs remain distinct. New confirmation evidence
must remain distinguishable from that already-accounted baseline.

Migration itself earns zero XP and does not make an old checkpoint the latest
learning action. Historical snapshots without mutation timestamps use a stable
fallback below newly stamped learning; their real learning time cannot be inferred.
Test unequal independently migrated copies and mixed-version redelivery, not just
identical imports. Old clients must not silently strip new synchronization history:
unsupported formats fail safely and require updating, while local study survives.

Keep different package versions separate. Do not apply a foreign run plan to
installed audio; an unavailable package remains unavailable without deleting its
history. Reject malformed/oversize payloads and incompatible identity bindings
before mutation. Preserve the existing backup size bound. Corruption or an app
update requirement may be actionable errors, never a local/cloud overwrite choice.

## Synchronization lifecycle

1. Commit checkpoint, confirmation evidence, completion, rewards, mutation order,
   and pending revision atomically to SQLite before any network work.
2. When enabled, run once on app startup/foreground and on detected network return.
   While active, poll every 60 seconds even without local changes. Coalesce triggers
   into one flight; local changes schedule publication without a per-playback request.
3. Fetch the current account-scoped cloud head, validate its payload, merge it with
   the latest local records, and persist the union atomically. Recheck account and
   profile generation after every asynchronous boundary.
4. Publish the merged state against the observed head. On CAS loss, refetch and
   merge again, with at most three immediate attempts per pass. Further contention
   stays pending for a later quiet retry; no spinning or conflict alert.
5. Acknowledge only the exact published revision. A lost reply, newer local edit,
   process restart, stale token, partial fetch, or cleanup failure cannot erase
   pending work or reset local history. Retain the existing native cleanup protocol.
6. Stop active timers when inactive. Do not promise fixed-interval execution while
   suspended/terminated. Foreground and reconnect catch-up provide the baseline.

Use the same merge operation for normal sync, first-device recovery, and manual
refresh. Never implement a second overwrite path that can lower XP. Switching off
sync stops future automatic work without deleting local or remote history.

## Account and player safety

The toggle is per installation/account. On a new device, enabling it automatically
loads that account's available cloud progress. Empty guest state needs no data
choice. Retain explicit first-use consent for importing nonempty guest history;
this is an account-ownership decision, not a synchronization conflict dialog.
Account changes invalidate queued work and preserve profile isolation.

Keep an active player session pinned while learning. Merge durable achievements
without remounting its profile, interrupting playback, or overwriting its in-memory
state. Apply the selected remote resume snapshot at the next safe player entry.
Subsequent actual local learning receives a new stamp; background persistence of an
unchanged old session must not beat a newer remote learning action.

## UI and errors

Rename the primary concept to `자동 동기화`. Explain that progress is available on
other devices using the same iCloud account and that unsynced uninstall loss is
still possible. Remove cloud/local conflict selection and destructive overwrite
confirmation from routine synchronization. A manual refresh must invoke the same
safe merge, not replace the account's records.

Routine success, offline operation, and CAS retries stay quiet. Settings may show
pending/last-confirmed-sync information. Quota, permission, unsupported format, and
local storage failures remain actionable; no raw account identifiers or payloads
appear in errors. Sync never grants/revokes StoreKit ownership or auto-downloads
paid content.

## Verification at the agreed seams

1. **Learning record merge:** use real SQLite and public journal/store interfaces.
   Check idempotence, commutativity, and associativity with duplicate delivery,
   distinct runs, shared-run confirmation overlap, navigation, short grouped-unit
   XP, old/new backup versions, midnight, legacy awards, and XP saturation.
2. **Resume selection:** both arrival orders select the same whole checkpoint;
   stale uploads and relaunch cannot win by arrival time. Tie/clock-regression,
   completed-run, package-version, and active-player cases preserve achievements.
3. **Sync/retry:** two independent local stores and a controlled external cloud
   boundary diverge offline, reconnect in both orders, race CAS, lose replies,
   change account, fail partway, restart, and converge without manual resolution.
   Check no-change polling, startup, foreground, reconnect, disable, and disposal.

Use red-green vertical slices, regular typechecks and focused tests, then the full
TypeScript/native regression suites and an iOS build. Review standards and #50
behavior separately against the pinned dev base. Commit only scoped source/tests/
sanitized docs; never commit commercial packages or private configuration.

Physical acceptance requires two authorized devices on the same designated iCloud
account, with controlled sample learning. Record both reconnection orders,
nondecreasing XP, identical merged completions, latest resume selection, and
repeated sync/relaunch. Simulator fixtures, a compiled build, and #49's earlier
empty-reward restore do not establish this gate. No device reset is authorized.
