# Silent stages 11–16 — local verification

## Scope

Owner-approved behavior on 2026-09-20: silent cumulative word reveal in target/
Korean, Korean/target, and Korean-only order; one S1–S4 level stays selected for
the run. The header opens the level selector instead of audio rate. See
`learning-contract.md` for timing, checkpoint, and confirmation semantics.

Implementation starts from merged `dev` at `0db217e`. No private lesson assets,
account operations, device deletion, or release changes are included.

## Automated evidence — 2026-09-20

- Clean baseline: 351 core tests passed before changes.
- Final `npm run check`: 366 core, 8 build-setting, 3 free-package, and 10 paid-
  package tests passed; TypeScript passed.
- `EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npm run bundle:ios`: passed.
- New coverage exercises all six routes, language order, cumulative prefixes,
  unchanged text/whitespace layout, hidden accessibility labels, Korean-only
  answer exclusion, S selection, fractional-word speed conversion, interruption,
  cancellation/disposal, completed-reveal reentry, and failed-save recovery.
- Real temporary disk-backed SQLite is closed/reopened; backup is restored
  twice into another database. S4, partial timing and confirmation XP survive
  without duplicate awards. These are local database tests, not live CloudKit.
- Screen JSX evaluation verifies the fixed-header S selector and that all six
  silent routes construct a clock without invoking the native audio factory.
- Independent read-only review found no blocking code issues. It did not certify
  real iOS accessibility, device lifecycle scheduling, or live-service acceptance.

Reproduce:

```sh
npm run check
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npm run bundle:ios
```

## Native build and remaining checks

The initial Debug simulator build encountered a stale generated Pods project:
the recently merged package-delivery identity file was not included in Sources.
`pod install` regenerated that project and restored the missing source entry;
no package-delivery source or tracked dependency versions were changed.

The subsequent Debug build and launch succeeded on an iOS 27 simulator. The
build still emitted dependency/build warnings; this was not a warning-free run.
An existing Metro process had stale module resolution, so runtime checks used a
fresh isolated development server without stopping the existing browser server.
The installed bundled sample was used; no private lesson or account was needed.

- Stage 11: observed an English prefix while Korean remained hidden, then both
  complete lines; header displayed S1 and opened the speaking-speed sheet.
- Stage 13: observed complete Korean above a still-growing English prefix.
- Stage 15: observed Korean only, S1, and the manual next-cycle control.
- S1/S2 option cards were visually inspected. Choice callbacks for all four
  levels, speed conversion and persistence are automated-test evidence; native
  S4 tapping was not verified because the automation snapshot omitted radio
  targets. Physical VoiceOver remains a separate acceptance check.
- A direct deep link to another player while a form sheet was open exposed a
  header `setOptions` update loop. Header options/callbacks now retain identity
  across navigation-only renders, covered by a regression test. The loop did
  not recur, but this cross-modal deep-link path can still remain on loading
  with native screen-controller warnings. It is not accepted as working;
  representative stage checks were repeated from a clean app launch.

Physical-device VoiceOver, Dynamic Type, background/foreground behavior and
actual iCloud convergence remain unverified. Existing acceptance ticket #61
remains open; automated fixtures do not mark any of its live checks as passed.
All devices must update before exchanging newly supported stage checkpoints.

## Single-pass refinement — 2026-09-20

- Stages 11–16 now hide cycle nodes and Repeat. One completed reveal followed
  by explicit confirmation awards 3 XP and advances; the last unfinished unit
  completes the stage. Stages 1–10 retain their existing rules.
- `npm run check`: 374 core, 8 build-setting, 3 free-package and 10 paid-package
  tests passed (395 total), followed by TypeScript. Recovery tests cover direct
  and pinned writers, disk reopen, repeated backup import, and two-database
  merging. Legacy 1-XP receipts retain their value; migration/retries give no XP.
- All Sentences expands the current section, centers below the native sheet
  header after variable-height row measurements settle, and cancels bounded
  positioning retries when the user scrolls or changes an accordion section.
  Render-boundary tests cover layout updates, unmeasured-row recovery and
  cancellation; they do not simulate UIKit.
- iOS 27 simulator, installed public sample: cycle nodes were absent; one
  confirmation changed phrase 3/12 to 4/12 and visibly showed +3 XP. In All
  Sentences, phrase 3 was centered below the header; manual scrolling continued
  to later phrases without snapping back. No physical-device or live-iCloud
  acceptance is claimed by this check.

## PR handoff verification — 2026-09-20

- The next phrase in stages 11–16 starts without the audio-stage one-second
  pause. A real silent-clock regression test covers all six stages; the audio
  player delay tests remain unchanged and pass.
- Final `npm run check`: 375 core tests plus 21 build/package tests (396 total)
  and TypeScript passed. The iOS JavaScript/assets export also passed.
- Physical-device and live-service checks remain tracked separately in #61.
