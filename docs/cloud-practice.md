# Server-confirmed practice (#19–21)

This is a gated development slice of #17, not a public beta release. Keep
`CLOUD_LEARNING_ENABLED` unset unless testing the cloud path. Deploying the SQL,
enabling hosted traffic, and physical Google/mobile acceptance require separate approval.

## Behavior

- The verified Google account UUID owns one current checkpoint, per-run history,
  and study dates in its stored timezone. Browser learning records are neither
  read, migrated, updated, nor deleted in cloud mode.
- All eight levels, manual/automatic audio, grouped audio, and rapid display use
  the same server-confirmed path, including explicit device takeover.
- Pressing **계정 학습 시작** atomically acquires a 30-second account lease.
  The instance UUID exists only in memory; a run URL never grants ownership.
  Foreground checks run every eight seconds, on focus, and immediately before
  resuming paused playback.
- Another active instance is blocked. Normal exit releases ownership; an offline
  or disconnected owner expires. Every checkpoint, renewal, and release verifies
  the run, instance, and generation using server time.
- **이 기기에서 이어 학습** opens a confirmation. Cancel performs no write.
  Confirm transfers the current run, actual settings, and latest committed
  checkpoint in one transaction. A confirmation for an older generation cannot
  steal a newer owner. If another lesson/stage is active, first navigate to that
  run; browsing itself never takes ownership. Refresh creates a new RAM instance.
- A connected previous device stops on its next ownership check and shows an
  ownership-loss notice. Offline/background playback stops locally; returning
  requires server verification. This is not an instantaneous remote mute.
  Successful start/takeover/checkpoint receipts are revalidated before enabling
  their player transition, including retries whose original response was lost.
- The existing three/five-repeat player rules remain intact. Confirmed practice
  records the current unit; advancing and jumping wait for server acknowledgment.
  The completion screen is not confirmed until the final transaction succeeds.
- The database derives unit offsets from the published entries. Group tails merge
  only within their section, matching the existing player. A partial recording or
  incomplete repeat never advances to the next group. Rapid tokens remain segmented
  on the server; a delayed timer consumes at most one complete line before saving.
  Save waits discard timer overshoot instead of skipping unseen lines.
- Checkpoints include an operation UUID and expected revision. Retrying the same
  payload returns its original result; changing its payload, using an old revision,
  or writing to a completed run is rejected. Operations are retained with account
  data so a later retry cannot resurrect a completed run.
- Active time is a cumulative value. Pauses, settings, background time, and save
  waits are excluded. Only confirmed practice earns a study date, not visits,
  jumps, or a completion click by itself.
- Completion preserves the published name/version and actual run settings.
  Practice settings are revision-checked, idempotent changes to the current run.
  Account preferences affect new runs, not the run being resumed. Group size stays
  fixed for a run so saved group boundaries cannot change. Replaced versions
  cannot be resumed; old completion history remains available.
- Failed saves retain their operation only in memory. Retry temporary errors;
  reauthenticate for auth changes, return to lessons for lost ownership or version
  changes. Refresh loads the last server checkpoint, never a browser journal.
  Internal exits warn about unconfirmed saves; page unload warnings/releases are
  best-effort, backed by lease expiration.

## Security boundary

`GET /api/learner/practice` reads the account journal and active generation (never
the owner's instance ID). `POST` accepts start, takeover, checkpoint, renew, and
release commands. The server verifies Google identity,
beta access, same origin, body shape, and the stale-account guard. It never accepts
a caller-supplied owner, unit plan, or starting settings snapshot. Validated in-run
settings patches cannot change group size. The database transaction locks the
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
concurrent acquisition/takeover/checkpoint/completion, cancellation, pending-save
retry before and after commit, delayed acknowledgments, ordinary exit, real lease
expiration, history, and streaks. The takeover scenario runs independently in
manual mode; final all-mode takeover acceptance remains part of #23. Browser
emulation and injected visibility events are not physical iOS/Android or hosted
OAuth proof.
