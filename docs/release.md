# Meta Shadowing release checklist

Issue #11 prepares an **online-only** mobile PWA. Passing local checks is not a hosted release. Do not close the release gate until the exact Vercel deployment and approved Supabase project pass the hosted checklist below. Follow [the Git workflow](agents/git-workflow.md): feature PRs target `dev`; releases reach `main` only with explicit user approval and passing release gates.

## Runtime and environment

Use Node 24 and `npm ci`. The Node major is pinned in `package.json`; Vercel uses the matching supported major. See [Vercel Node versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions).

Configure these independently for Vercel Preview and Production:

| Variable | Purpose | Exposure |
| --- | --- | --- |
| `BETA_PASSWORD` | Shared learner entrance password, at least 12 characters | Server only |
| `LEARNER_COOKIE_SECRET` | At least 32 random characters for signing the 30-day learner cookie | Server only |
| `NEXT_PUBLIC_SUPABASE_URL` | Approved project's HTTPS API origin | Public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Modern `sb_publishable_` key | Public, RLS constrained |
| `SUPABASE_SECRET_KEY` | Modern `sb_secret_` key for server catalog/signing/lifecycle operations | Server only |

Keep local values in ignored `.env.local`, not source control, logs, screenshots, or issue comments. Never set `ADMIN_TEST_*`, `ADMIN_SUPABASE_INTEGRATION`, or `SUPABASE_INTEGRATION_*` in Vercel. Test fixtures and test administrator authentication are disabled in production independently of these flags.

Run `npm run verify:env` in the intended environment. It checks missing values, key placement, signing-secret length, URL shape, and test-only variables without printing values or contacting a hosted project. A pass checks **configuration shape**, not credential validity or RLS. An unconfigured checkout must fail this command. After changing Vercel values, create a new deployment; existing deployments do not inherit the change. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

Recommended Vercel settings: Next.js framework, repository root, Node 24, Production Branch `main`, install command `npm ci`, build command `npm run verify:env && npm run build`, default Next.js output directory. Hosted Preview checks must use explicitly disposable lesson data and preserve other consumers of the selected database. Automated destructive integration tests run only against local Supabase, never a hosted database.

## Database and administrator gate

Follow [administrator setup](admin-setup.md) on the user-selected **Yòmá's Projects** project (`zjfzrtzwegqmmhgwgrwp`, Seoul). Inspect existing Auth, Storage and migration history before applying changes; the empty `public` table inventory alone does not establish that the whole project is unused. Review and apply every migration, including `20260906090138_release_explicit_grants.sql`, only after conflicts with other consumers are resolved.

- New-project Data API access must use explicit grants; do not enable broad automatic exposure to work around a `42501` error. Both grants and RLS are required. See [Supabase's default-grant change](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).
- `lesson_drafts` and `session_defaults` must have RLS enabled. Anonymous users have no application-table grants. Authenticated draft access remains owner + signed `app_metadata.role = admin`, with only the existing draft-content column-update whitelist. No browser role may delete/truncate drafts, attach triggers, or invoke lifecycle RPCs. Server lifecycle functions retain explicit `service_role` execute grants.
- `lesson-audio` must be private, with 4 MB per-file and MP3/M4A/WebM MIME restrictions. Storage policies allow the administrator's mutable draft folders only. Validate anonymous and non-admin denial as well as successful administrator upload; RLS enabled alone is not enough.
- Provision the single administrator through a trusted dashboard. Resolve any conflicting existing application use before changing project-wide sign-up settings. Authorization belongs in `app_metadata`, never user-editable metadata. Add only the intended `/auth/confirm` URLs, preserve unrelated applications' required redirects, and verify real email delivery in that environment.
- For new free projects using default SMTP, email template customization may be unavailable. Use the default Magic Link flow, or configure supported SMTP before choosing a customized typed-OTP template. See [Supabase email-template limits](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

## Repeatable local verification

Run from the MVP worktree. Use the installed Chrome executable only if the normal Playwright browser is unavailable; on this Mac, set `PLAYWRIGHT_CHROME_EXECUTABLE` to `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. Do not install browsers or stop unrelated user browsers as part of a test retry.

```bash
npm ci
npx --yes supabase@2.116.0 start
npx --yes supabase@2.116.0 migration up --local
npm run test:db
npx --yes supabase@2.116.0 db advisors --local --type all --level warn --fail-on error
npm test
npm run test:browser
npm run build
npm run typecheck
PLAYWRIGHT_PRODUCTION=1 npm run test:integration
```

The integration runner reads credentials from the **local** Supabase stack and refuses a non-loopback API URL. With `PLAYWRIGHT_PRODUCTION=1`, it rebuilds with the local public settings (Next.js embeds these at build time), starts a real Next.js production server with test mode off, and creates/cleans temporary users, lessons and Storage objects. An OpenSSL-generated, one-day certificate enables loopback HTTPS so production `Secure` cookies are exercised without weakening application authentication. Only the test context ignores certificate trust; no system certificate is installed, and temporary key files are removed immediately after loading. The selected port and the following port must both be free. The publication test follows the real signed media redirect; lifecycle tests exercise rollback-safe failure/retry. Default browser tests use isolated development fixtures and must not be pointed at production.

Run only one `next dev` for this worktree at a time. Reuse the known server for manual QA or stop your own server before CI browser runs. Capture screenshots outside the repo. Review mobile (390×844 and 375×667), tablet (768×1024), desktop, and native concept sizes (852×1846, 853×1844, 1506×1045). Compare with the [UI contract and fidelity ledger](design/meta-shadowing-ui.md).

## Device and PWA gate

- Manifest: `/manifest.webmanifest`, standalone display, root scope/start URL, stable app ID, online-only description. `/icons/192` and `/icons/512` return correctly sized PNGs; `/icons/180` is the Apple touch icon. These public assets must not require the beta cookie.
- On HTTPS, install from regular Android Chrome and iPhone Safari home-screen menus. Verify launch, safe areas, landscape/portrait, headphones and real audio. Headless/incognito checks are not an actual home-screen installation. Chromium's incognito-context installability result is expected to report `in-incognito`.
- Practice holds a Screen Wake Lock only while actively learning, including manual audio speaking windows. Pause, settings, hidden tab, completion and navigation release it. Returning to the tab does not silently restart practice. Test low-power/permission denial, OS release, unsupported browsers, and explicit resume. The fallback explains device auto-lock settings; the app remains usable. See [Screen Wake Lock behavior](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API).
- Audio preloads only a bounded current/next window. Current media uses native preload; next media uses a temporary in-memory Blob. Preload is a browser hint, not a guarantee. Playback remains synchronous with the user's gesture. Failed prefetch cannot count a listen; failed/corrupt playback stops and retry obtains a fresh source. Buffers are aborted/revoked on replacement, completion or leaving the player.
- No service worker, offline lesson/audio download, or Cache Storage persistence is implemented. Transiently buffered audio is not an offline lesson. Unpublishing prevents new signed URLs, but cannot recall bytes already delivered; leaving/reloading clears the player's buffers.
- Verify keyboard Space/R/S/arrows, visible focus, semantic selection states, ≥44px touch controls, long bilingual text, 64px first-word hints, and non-overlapping controls. Short phones use an in-flow dock, reachable by scrolling, to avoid covering practice actions.

## Hosted release gate — requires an approved target

1. Confirm the selected Supabase project, Vercel team/project, Preview environment, and exact commit. Set Vercel Production Branch explicitly to `main` before enabling Git auto-deploy; other branches must remain Preview-only. Creating a Vercel project or incurring costs requires approval. Do not trigger an initial Production import of the planning-only `main` branch.
2. Apply reviewed migrations, configure Auth/Storage and the five environment values, and run the configuration check in the build. Record the commit SHA, deployment URL, build result and environment name, **never values**.
3. Deploy a Preview and wait for Vercel `READY`. Check runtime logs, not only build logs. Verify unauthorized learner/admin routes remain protected, beta password success/failure, true admin Magic Link/OTP, and non-admin rejection.
4. With authorized disposable data in the isolated preview environment, validate bilingual text/audio, publish, open the learner catalog, play a signed recording, run all eight levels, resume, and check history. Verify version replacement and unpublish. Permanent deletion needs an explicitly disposable target and confirmation.
5. Run the physical-device/PWA gate above. Reopen from the home screen, background/resume, disconnect/reconnect, and test a failed recording without incrementing completed cycles.
6. Record results and any blockers. After explicit release authorization, open the `dev -> main` PR, pass CI and the human `release-approval` gate, then merge. Vercel's approved Git integration deploys `main` automatically; verify that deployment and repeat production smoke checks. A successful local build or a Vercel `READY` status alone is insufficient.

## Verification status (2026-09-06)

Local checks use Node 24.19.0, Next.js 16.3.4, Playwright 1.58.2, installed Chrome 152, and Supabase CLI 2.116.0:

- Unit suite: 104 tests passed. Typecheck and optimized production build passed.
- Final mobile/desktop browser suite: 109 tests passed and 23 were intentionally skipped (20 cases gated on the separate local-Supabase integration setup, plus three mobile-only assertions skipped in the desktop project). The focused PWA/accessibility suite passed all 14 checks.
- Database suite: 41 assertions passed; all five migrations are applied locally.
- Real-Supabase production integration: 10 tests passed over loopback HTTPS, including publication, version replacement, denial, unpublish and deletion recovery.
- Viewport/state screenshots covered entry, home, setup, audio/rapid players and administrator import, including native-size tall player proportions and short-phone controls. No app console errors/warnings, framework overlays, blank screens or horizontal overflow were observed. Regular-profile Chromium reported no installability errors; a physical installation is still required.
- Local advisors reported zero errors and six existing `auth_rls_initplan` performance warnings. The policy definitions already wrap Auth reads in scalar subqueries. Read-only `EXPLAIN` as `authenticated` confirmed `InitPlan` nodes for both application tables' read policies. These warnings are recorded, not represented as a clean advisor result or suppressed by changing authorization.
- The hosted environment preflight correctly fails in this unconfigured checkout: all five required values are absent. Its four isolated configuration tests pass without printing values.
- Required review against the pre-#11 commit `edbb670`: Standards has zero remaining findings. Spec has one remaining P1 finding for the incomplete hosted-release acceptance below; the keyboard-scroll and native tall-player findings were fixed and rechecked.

The initial local verification did not create, link or deploy hosted resources. The user subsequently selected **Yòmá's Projects** as the Supabase target and approved the `main`/`dev` workflow. Vercel project setup, hosted credentials/migrations, a deployment URL, real email delivery and physical iPhone/Android installation remain **pending**, so #11's hosted-release acceptance remains open.
