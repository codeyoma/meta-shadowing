# Server-confirmed manual practice (#19)

This is a gated development slice of #17, not a public beta release. Keep
`CLOUD_LEARNING_ENABLED` unset unless testing the cloud path. Deploying the SQL,
enabling hosted traffic, and physical Google/mobile acceptance require separate approval.

## Behavior

- The verified Google account UUID owns one current checkpoint, per-run history,
  and study dates in its stored timezone. Browser learning records are neither
  read, migrated, updated, nor deleted in cloud mode.
- Levels 1–3 in manual mode are enabled. Automatic, grouped, and rapid modes
  stay gated until #20. The explicit takeover action belongs to #21.
- Pressing **계정 학습 시작** atomically acquires a 30-second account lease.
  The instance UUID exists only in memory; a run URL never grants ownership.
  Foreground checks run every eight seconds, on focus, and immediately before
  resuming paused playback.
- Another active instance is blocked. Normal exit releases ownership; an offline
  or disconnected owner expires. Every checkpoint, renewal, and release verifies
  the run, instance, and generation using server time.
- The existing three/five-repeat player rules remain intact. Confirmed practice
  records the current unit; advancing and jumping wait for server acknowledgment.
  The completion screen is not confirmed until the final transaction succeeds.
- Checkpoints include an operation UUID and expected revision. Retrying the same
  payload returns its original result; changing its payload, using an old revision,
  or writing to a completed run is rejected. Operations are retained with account
  data so a later retry cannot resurrect a completed run.
- Active time is a cumulative value. Pauses, settings, background time, and save
  waits are excluded. Only confirmed practice earns a study date, not visits,
  jumps, or a completion click by itself.
- Completion preserves the published name/version and resolved run settings.
  Preference changes affect new runs, not the run being resumed. Replaced versions
  cannot be resumed; old completion history remains available.
- Failed saves retain their operation only in memory. Retry temporary errors;
  reauthenticate for auth changes, return to lessons for lost ownership or version
  changes. Refresh loads the last server checkpoint, never a browser journal.
  Internal exits warn about unconfirmed saves; page unload warnings/releases are
  best-effort, backed by lease expiration.

## Security boundary

`GET /api/learner/practice` reads the account journal. `POST` accepts start,
checkpoint, renew, and release commands. The server verifies Google identity,
beta access, same origin, body shape, and the stale-account guard. It never accepts
a caller-supplied owner or settings snapshot. The database transaction locks the
account row and the published lesson version before mutating learning state.

All four learning tables use default-deny RLS, with direct `PUBLIC`, `anon`, and
`authenticated` grants revoked. RPC functions use `SECURITY INVOKER`, empty
`search_path`, explicit execution revokes, and minimal service-role grants.

## Local verification

Use Node 24 and the disposable local Supabase stack. Do not point fixtures at a
hosted project. `SUPABASE_TEST_WORKDIR` selects a separate local stack; set
`PLAYWRIGHT_PORT` and `NEXT_DIST_DIR` to avoid touching a running developer server.

```sh
npm run test:db
npm run test:cloud-practice -- --project=mobile
PLAYWRIGHT_PRODUCTION=1 npm run test:cloud-practice -- --project=mobile
```

The integration test uses independent browser contexts with local Auth sessions,
real persistence and RPC calls. Only the audio transport uses a small recording
fixture. It exercises acknowledgments lost after commit, cross-account denial,
concurrent acquisition/completion, ordinary exit, real lease expiration, history,
and streaks. Browser emulation is not physical iOS/Android or hosted OAuth proof.
