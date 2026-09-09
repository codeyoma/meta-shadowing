# Account preferences (issue #18)

This is the first slice of [the cloud-learning beta spec](https://github.com/codeyoma/meta-shadowing/issues/17), not a beta rollout.

## Boundary

- `CLOUD_LEARNING_ENABLED=1` opts the **server** into account preferences. Unset or any other value keeps the legacy browser-backed path. Do not enable on a shared beta deployment yet.
- The beta pass and a server-verified Google identity are required. `/api/learner/preferences` derives ownership from verified claims; the PATCH body account ID only detects a stale tab after an account switch.
- The `learner_preferences` table has default-deny RLS and no `anon`/`authenticated` table or function access. Restricted, security-invoker RPCs run through a server-only repository with the verified owner on every call.
- First read initializes empty overrides, a null selection, and one validated IANA study timezone (UTC fallback). A different device does not change that timezone.
- Unchanged fields inherit the current administrator defaults. Field revisions merge unrelated edits; same-field conflicts reject the entire patch and display the latest server settings for reconfirmation. Retrying an already-applied patch is idempotent.
- The language/lesson pair is one atomic selection field. Screen entry and focus refresh the profile. Navigation carrying the displayed selection is not a new choice; actual choices retain the revision the user saw before a refetch. Neither refocusing an old route nor opening Settings saves an older selection over another device's choice.
- Reads can initialize the profile, so both GET and PATCH enforce the same-origin boundary. Same-account refresh hides preference content while preserving navigation, scroll, and the chosen settings level; an identity change clears the entire account subtree.
- Load failure blocks the account UI. Save failure keeps the pending request in memory for explicit retry/cancel; it is never reported as saved. Account changes discard the old UI and pending request before loading the new account, without carrying the old route selection over.

## Deliberately not included

Server progress, completion history, streaks, session takeover, and MP3 caching belong to the follow-up tickets. Under this flag, stage/player entry displays a preparation notice instead of starting legacy local-storage practice. Legacy history and streak widgets are hidden. No browser learning records or preferences are imported, deleted, or used as cloud fallbacks. In-flight legacy player settings remain their own snapshots.

The flag being off is the rollback for this isolated development slice; it is not a data-migration or production rollback strategy. No hosted database migration or deployment is part of this change.

## Verification

Use Node 24, Docker, the pinned Supabase CLI, and an installed Playwright-compatible Chromium. Use a disposable local Supabase project with all repository migrations applied. Never point integration fixtures at a hosted project.

```sh
npm run typecheck
npm run check:ui
npm test
npm run test:db

# Legacy production integration; flag is explicitly off.
PLAYWRIGHT_PRODUCTION=1 npm run test:integration

# Cloud production integration; the runner explicitly sets the flag to 1.
PLAYWRIGHT_PRODUCTION=1 npm run test:learner-preferences -- --project=mobile
```

The runner defaults to the repository's local stack. `SUPABASE_TEST_WORKDIR` selects a separate disposable Supabase workdir, `PLAYWRIGHT_PORT` selects an unused app port, and `NEXT_DIST_DIR` isolates build output from a running development server. Use `PLAYWRIGHT_CHROME_EXECUTABLE` only if using an existing system Chromium instead of Playwright's installed browser. The production test server creates a temporary local HTTPS certificate; it does not modify system trust. Generated Next.js type files are not implementation changes.

The cloud scenario uses actual local Supabase users and signed sessions: two independent browser contexts for the same account, a third for another account, and an email identity with forged user-editable metadata. It verifies UI saves, administrator-default inheritance, group/rapid fields, selection restore, conflicts, lost acknowledgements, retry, account switches, direct DB denial, and the no-local-storage boundary. It does not test live Google OAuth or physical mobile devices. Browser screenshots and traces stay in the runner's temporary output directory.
