# 쇄도잉 — native iPhone prototype

Fresh React Native / Expo / TypeScript implementation. The legacy web application
is retired on this branch; its Git history and prior workspaces remain intact.
Supabase data and hosted services have not been modified.

## Current scope

The product roadmap is [iPhone first, Android later](docs/apple-only-foundation.md).
The current build and #44–#52 acceptance target iOS 26.0 or later. Android is a
planned expansion, not implemented support or a gate for the iPhone phase.
Its billing, delivery, identity and cross-platform ownership/sync require later
decisions. Shared learning contracts remain separate from Apple service adapters.
The Supabase/email-OTP proposal is superseded and must not be used.

#44 provides explicit package/version learning context. #45 implements StoreKit 2
purchase/restore and #49 implements private CloudKit progress backup/recovery.
Real Apple sandbox and CloudKit device acceptance remain open; local tests do not
prove them. Apple-hosted commercial delivery remains separate work (#46–#48).
See [purchase setup](docs/storekit-purchases.md) and
[CloudKit setup and limits](docs/cloudkit-progress.md) before testing these services.

- Icon-only Books / Stages / Settings native tabs, with a shared language flag,
  level/XP bar and streak header. Player remains outside the browsing shell.
- Per-language XP; first completed stage per book/day can reward its required
  2/3 repetitions. Extra practice is allowed without XP; levels grow gradually.
- Subtitle shadowing, stages 1 and 2, explicit manual speaking confirmation only.
- Playback speed slider from 0.25× to 3× in 0.05× steps.
- Three confirmed cycles; Repeat adds two; Next never skips required confirmation.
- Twelve original example sentences, Korean translations, and local test speech.
- Complete package validation with SHA-256 before learning, stored in the native
  documents directory rather than a browser cache.
- SQLite checkpoints, current audio/cycle/timer restoration and unique completion
  history. Native audio is released on pause; resume requires a tap.
- Local settings and quiet normal operation; actionable errors use system alerts.
- 쇄도잉 branding, owner-supplied logo/icon, and solid yellow/orange primary
  controls. Native header chrome follows the OS; see [DESIGN.md](DESIGN.md).

This is **not yet a completed phone-tested milestone**. See
[verification](docs/verification.md) and the [roadmap](docs/native-rebuild.md).
Remaining methods, dictionary/syntax, commercial delivery, multi-device
reconciliation and additional platforms are deferred. Purchase and backup
implementations are present but not yet fully accepted on real Apple services.

## Run locally

Start with the [iPhone Simulator guide](docs/simulator-development.md) for the
Expo Go smoke test, our own local Debug build, Fast Refresh and recovery. A
physical phone is not needed for the #44 foundation; physical-device acceptance
remains a later M1 gate.

Use Node 24+ and the locked dependencies:

```sh
npm ci
npm run check
npm run bundle:ios
npm start
```

Use our local Debug iOS build for the full playback range. Expo Go cannot include
the project's native audio patch and still caps playback at 2×. No Expo account,
EAS build, TestFlight upload, or hosted backend change is required.
Open the development session, then choose **샘플 레슨 설치**.

For our own local Debug iOS build:

```sh
npx expo prebuild --platform ios --no-clean
npm run ios
```

`npm ci` applies the versioned `expo-audio` iOS rate-limit patch through
`patch-package`. Rebuild the native client after dependency changes; Fast Refresh
alone cannot update native modules. See `patches/README.md`.

Physical-device builds require compatible Xcode tooling, an unlocked trusted
iPhone, and valid signing/provisioning. Generated `ios/` and build output are
ignored; keep signing credentials and team identifiers out of tracked files.

The bundled sample is a controlled installation source, **not the commercial
download service**. Expo Go and our local Debug build depend on Metro for
development JavaScript. A Release build with an embedded bundle is needed to
establish independent offline launch acceptance. #44 verifies sample continuity;
#48/#52 cover hosted recovery and end-to-end acceptance. #42/#43 were deleted
by explicit owner request, not completed.
After installing the sample, learning reads device files and SQLite only.
Uninstalling the app may remove the package and all unsynchronized local progress.
The optional #49 backup can recover only confirmed synchronized progress; its
real-device clean-install acceptance is still pending.

## Development and recovery

- [Learning contract](docs/learning-contract.md): behavioral requirements and tests.
- [Roadmap](docs/native-rebuild.md): M0–M6 and preservation boundaries.
- [Verification](docs/verification.md): passes, limitations, and device checklist.
- Test speech can be regenerated on macOS with `npm run prepare:audio`. It uses
  local system speech and is for personal, noncommercial prototype testing only.
  Clear production voice/content rights separately before distribution.
- Feature PRs target `dev`. [Native CI](docs/native-ci.md) validates domain/SQLite
  behavior, the iOS bundle, native service fixtures and a Release Simulator build.
  Required checks and privacy review must pass before merge; never bypass them.

No commit, push, deployment, or Supabase mutation is part of this local milestone.

## Deployment policy: native iOS only

Vercel is no longer a deployment target. The retired web application and its
GitHub Actions workflow are already absent from this native branch. Do not add
Vercel build jobs, deploy commands, tokens, or web-preview requirements.

The root `vercel.json` is only an opt-out: `git.deploymentEnabled: false` disables
automatic Git deployments for all branches carrying this configuration. Removing
deployment files alone does not disconnect an existing Vercel Git integration.
See [Vercel's Git configuration](https://vercel.com/docs/project-configuration/git-configuration#turning-off-all-automatic-deployments).
Local `.vercel/` link metadata is ignored and must not be committed.

This opt-out does not delete historical deployments, disconnect the hosted Git
integration, or change GitHub branch protections. Old commits and branches without
the opt-out are not covered. Fully removing the integration requires a separate,
project-scoped disconnect in Vercel; do not uninstall a shared integration from
other repositories. Required GitHub checks are managed separately from deployment
checks and must not be bypassed or replaced with fake passing results.
