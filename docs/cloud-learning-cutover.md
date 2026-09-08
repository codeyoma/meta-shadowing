# Cloud-only learning cutover (#23)

This is a release-candidate checklist, not authorization to deploy, close issues,
reset a development database, or publish the beta. Continue the gates in
[release.md](release.md) and the [Git workflow](agents/git-workflow.md).

## Data contract

- Supabase is the source for preferences, selection, confirmed progress,
  completion history and study days. Read failures block the view; they are not
  empty histories and never fall back to browser records.
- An active run keeps its server settings snapshot. Account preference edits
  apply to the next run; player settings update the active run with acknowledgment.
- Pending writes and incomplete numeric inputs live only in RAM. Retry an
  unacknowledged operation while the page remains open; reopening restores the
  last server-confirmed point, not unconfirmed work.
- Old browser learning keys are ignored: no import, reconciliation or automatic
  deletion. Existing cloud records are preserved. A new account starts fresh.
- Persistent application data is limited to account-scoped MP3 bytes and minimal
  cache metadata. Actual listening refreshes a 20-day idle expiry. Prefetch does
  not refresh it. Auth cookies remain; no offline lesson service worker exists.
- Logout and account changes revoke old audio handles and hide old learning
  state. MP3 cache cleanup does not delete server records or legacy learning keys.

## Prepare, then expose

1. Keep `CLOUD_LEARNING_ENABLED=0` (or unset) while preparing. In this contract
   build that stops learner entry and returns `503 learning-disabled` for learner
   state APIs. It does **not** restore the old local-storage player.
2. Confirm the approved target privately, inspect migration history and unrelated
   consumers, and back up existing cloud records. Obtain separate authorization
   before any hosted migration or deployment.
3. Reproduce every checked-in migration, in timestamp order, on a **new isolated
   local stack**. Run pgTAP for grants, RLS, preference revisions, leases, fenced
   writes, idempotent completion and study-day behavior. Do not reset an existing
   developer stack. No new migration is required by #23 itself.
4. Apply reviewed compatible migrations to the approved hosted target only after
   authorization. Verify Google identity, beta access, account isolation and the
   server-only secret key. Test-only environment/configuration must not be hosted.
5. Test the exact candidate with the flag enabled in an isolated Preview. Complete
   the automation and physical-device gates below. Record commit and results;
   keep infrastructure identifiers and credentials out of public logs.
6. Enable the server flag for the approved release only after human approval.
   Redeploy when changing build/deployment environment values. Do not infer
   release approval from a successful local test or a ready Preview.

## Stop, defer and roll back

Defer exposure for migration/grant failures, unverifiable account identity,
cross-account data, duplicate completions, old-owner writes, failed saves that
advance the player, or missing required device acceptance. Pause learning with
the flag off if one of these appears after exposure. Already open players must
stop on the next server verification/write; they cannot safely continue offline.

Rollback means keeping entry paused or deploying a previously verified,
schema-compatible **cloud-only** build. Retain cloud tables and completion
records. Do not roll back by enabling browser learning persistence, dropping
tables, undoing additive migrations, or deleting users' records. Restore service
only after reproducing the defect, checking the repair against preserved data,
and repeating the affected cross-device and failure tests.

## Reproduce automation safely

Create a temporary work directory and copy `supabase/config.test.toml`,
`supabase/migrations` and `supabase/tests` into its `supabase` directory. Give it a
unique project ID and unused API/DB/auxiliary ports before starting. The test
config enables local password login only to create trusted fixture sessions;
it is not a production Google policy or evidence of real OAuth working.

Set `SUPABASE_TEST_WORKDIR` to that disposable directory. `NEXT_DIST_DIR` and
`PLAYWRIGHT_PORT` can isolate the test server from a running developer server.
Use Node 24 and run:

```bash
npm test
npm run check:ui
npx --yes supabase@2.116.0 test db --workdir "$SUPABASE_TEST_WORKDIR" --local
npm run test:browser -- --workers=1
PLAYWRIGHT_PRODUCTION=1 npm run test:learner-preferences -- --project=mobile
PLAYWRIGHT_PRODUCTION=1 npm run test:cloud-practice -- --project=mobile
PLAYWRIGHT_PRODUCTION=1 npm run test:mp3-cache -- --project=mobile
PLAYWRIGHT_PRODUCTION=1 npm run test:integration
npm run typecheck
```

The production integration runner builds with that stack's public configuration
and uses loopback HTTPS. Ordinary learner UI regressions now use real Auth/SQL,
not successful persistence mocks. Their stable published lesson IDs require one
worker per disposable database; CI shards have separate databases. Local journal
seeds exist only in explicit stale-value-ignore cases; other setup seeds SQL.

The storage audit instruments browser storage entry points throughout the
cross-device scenarios. Narrow SDK-only exceptions are a transient `lswt-*`
availability probe and the read-only GoTrue debug flag; neither stores learner
data. Next's development debug IndexedDB is exempt only outside production.
Production audit runs must not need that development exception. The source audit
separately rejects application storage calls outside the MP3 cache module.

Stop only the disposable project's stack when done; preserve backups unless the
entire runner is explicitly ephemeral. Never use a blanket stop/reset command.

## Evidence and remaining release gates

### Local working-tree verification — 2026-09-08

Candidate changes are based on `788a966` (#22). These are local results, not
hosted acceptance or authorization to release. No hosted database was changed.

| Check | Observed result |
| --- | --- |
| Fresh isolated migrations and pgTAP | 10 files / 125 assertions passed |
| Full Vitest run | 520 passed, 4 obsolete-fixture failures, 1 skipped; the four failures were corrected and passed in focused reruns, not a second full run |
| Focused unit/source/recovery checks | Latest five-file run: 13 passed; typecheck, shared UI check and production build passed |
| Production HTTPS practice | 52 desktop/mobile all-mode, handoff and failure cases passed; 4 additional read-failure cases passed |
| Production account preferences | Both desktop/mobile cases passed |
| Blocked storage and legacy values | 6 production desktop/mobile cases passed, including account defaults across lessons |
| MP3 and streaming | All 18 desktop/mobile scenarios passed across focused runs; earlier failed timing/access assertions were corrected and rerun |
| Production administration/publication/defaults | 9 passed initially; both version-resume timing failures were corrected and passed in a focused rerun |
| Browser regression sweep | Auth/admin/disabled phase: 44 passed. Learner phase hit its 15-minute bound: 174 passed, 13 failed, 437 did not run. All 13 failures subsequently passed in focused desktop/mobile reruns; the complete sweep has **not** passed yet |

Keep the full regression sweep and the following real-device/hosted gates open.
Do not treat a focused rerun as a clean full-suite result.

Automated coverage is not proof of the following physical/hosted behavior:

| Gate | Required evidence |
| --- | --- |
| Local automation | Source audit, unit tests, pgTAP, real SQL browser regressions, production HTTPS account/preferences/all-eight-mode/handoff/MP3 tests, typecheck and build; record actual results, including failures |
| Google OAuth | Real first login, returning login, logout/relogin and account switch using the approved redirect URLs; fixture-issued Google claims are insufficient |
| iPhone Safari/PWA | Real audio gesture, headphones, install/relaunch, background/foreground, OS suspension, storage eviction and cache refresh/expiry |
| Android Chrome/PWA | The same physical-device scenarios, including long sleep and network switching |
| Hosted Preview | Exact commit, configuration, migrations, RLS, latency/failures, A/B same account and C different account, old-owner fencing and no duplicate completion |
| Release | Existing #11 release gates and explicit human approval; no automatic issue closure or beta publication |

Until these gates have recorded passing evidence, keep release acceptance open.
