# M1 verification

## Ticket #40: manual stage flow — 2026-09-12

Passed on **iPhone 17 Pro Max Simulator, iOS 26.5**, in the existing local native
Debug app (Expo SDK 57, with the native audio-rate patch). This verifies the
owner-amended manual-only ticket, not the superseded automatic-confirmation spec.
It is not physical-iPhone acceptance, a new native compile, or offline cold launch.

### Reproducible acceptance and observed results

1. Open the installed controlled twelve-sentence book. Resume the existing Stage 1
   checkpoint (sentence 7, one confirmed cycle). Entry retained the check; audio
   completion left the next confirmation waiting for an explicit tap.
2. Confirm to three, choose Repeat, and confirm two more. The five-cycle decision
   offered Next only. Finish the remaining sentences with explicit confirmations
   and Final Next. The path showed one Stage 1 run and 10 XP; Stage 2 stayed locked.
3. Set the global preference to 3×, stop/relaunch the app, and start another
   Stage 1 run. It began at sentence 1 with 3× and no completed checks; history
   stayed at one. After sentence 2 had two checks, leave through options and set
   the global preference to 0.25×. Re-entry retained the unfinished run's 3×.
4. Change that paused run to 2.8× in its options drawer. Returning retained its
   sentence and checks without automatically playing or confirming. Complete
   all twelve sentences. Stage 1 now showed two runs, Stage 2 unlocked, and no
   next stage started automatically. The header showed 20 XP.
5. Explicitly open Stage 2. Its existing independent checkpoint began at sentence
   1 with 3× and zero checks. Complete all twelve sentences with three explicit
   confirmations each, then Final Next. Stop/relaunch directly from completion.
   The path still showed **Stage 1: 2 runs; Stage 2: 1 run; XP: 20**. No duplicate
   completion or reward was manufactured, and Stage 2 remained available for a
   fresh run. One run is not enough to mark Stage 2 fully complete.
6. The global 0.25× preference survived that relaunch. Restore the original 1×
   preference after testing and leave the app on the stage path. Test completions
   remain in this controlled simulator's local history; no data was erased.

Native runtime UI snapshots and actual audio-finish-driven button availability
were used for the flow above. This is not a new human listening-quality assessment.
Precise one-second timing, cancellation, legacy migration, saved positions and
save-failure behavior also have separate public-player/checkpoint regression tests;
the wider interruption matrix belongs to #41.

### Repair and automated verification

- A new public-player regression first failed because Repeat could expand a
  five-cycle decision to seven through the core action. The core now accepts
  Repeat only at the initial three-cycle decision, matching the existing UI.
- An older presentation test still expected new seven-cycle practice. It now
  checks the five-cycle limit and independently verifies that existing legacy
  seven-cycle checkpoints retain their nodes and cannot be expanded again.
- A full twelve-phrase Player → real SQLite Journal test completes two Stage 1
  runs and one Stage 2 run, including extra cycles and mid-run database reopening.
  It verifies unlocking, saved rates, stage isolation and idempotent Final Next.
- Final result: **64 tests passed, strict typecheck passed, iOS JS/Hermes export
  passed**. Export is not a native compile or Release-build acceptance.
- Independent Standards and Spec reviews of the authorized full native rebuild
  reported no actionable findings. The review baseline is
  `006b6a89ae96fc296f500bdc4fc5198126a85ca5`; precommit review used immutable staged
  trees because all native code was initially uncommitted.
- Staged-content scans and manual review found no embedded credential
  configuration, private keys, hosted project URLs or local user paths.
  Generated native projects, raw logs and private verification files remain
  ignored. These checks are not an exhaustive security assessment.

### Limitations and recovery

The first attempted playback and pause/resume attempt stalled with the footer
disabled. Native logs reported Simulator audio-output start timeouts. Pausing and
relaunching **only the app** recovered playback without changing audio code or
erasing progress; the later full runs completed normally. This suggests a
transient native audio-output/session failure, not a proven root cause. No timer
was added to falsely finish audio. Hardware interruption/output acceptance remains
open, and recurring stalls need a separate native trace.

The current online dependency checks report **Expo Doctor 20/21**, failing only
SDK patch-version alignment: twelve Expo packages have newer expected patches,
including expo-audio 57.0.5 versus the patched/tested 57.0.4. The locked dependency
set was not upgraded, excluded from checks, or silently rebuilt. Upgrade and
revalidate the versioned audio patch plus native build before distribution.

The owner authorized a local commit of the whole rebuild and approved retirement,
not a push, remote CI run, hosted DB/Auth/Storage change, or deployment. #41–#43,
native CI migration, dependency advisories and physical-device M1 gates remain.

## Ticket #39: simulator development loop

Passed on **iPhone 17 Pro Simulator, iOS 26.5**, using Xcode 26.6 and Expo SDK 57.
This is simulator acceptance, not physical-iPhone or complete M1 acceptance.

| Check | Actual result |
| --- | --- |
| SDK-compatible Expo Go | Opened the library, installed the twelve-sentence sample, opened Stage 1, and played to the speaking-confirmation step |
| Own local native Debug app | Compiled, installed and launched successfully without a cloud build or physical-device provisioning; the explicit follow-up build/run reported success in 44 seconds |
| Installation gate | Before installation, a direct player deep link displayed the unavailable state with no playback control; returning to the library and installing enabled practice |
| First-sentence playback | English text and Korean translation matched; native playback reached `말했어요` with `0 / 3회 완료`, correctly awaiting learner confirmation |
| Audible output | The owner explicitly confirmed hearing the complete first sentence from Simulator; this is human confirmation, separate from automated playback-event evidence |
| Fast Refresh | Temporary library headings appeared in both Expo Go and the native Debug app without recompilation, then the original heading was restored |
| Local checks | Fresh run: 21 tests, strict typecheck, dependency alignment, 21/21 Expo Doctor checks, and iOS JS/Hermes export passed |

Repeat the steps in [simulator development](simulator-development.md). The two
build types have separate storage; the sample was installed independently in each.
After native playback, returning to the lesson displayed phrase 1 with 0/3 cycles,
without treating audio completion as learner confirmation.

### Findings and recovery

- The initial simulator launch timed out during its first startup. After the
  simulator became ready, Metro also exposed a concrete localhost mismatch:
  IPv6-only listening while Expo Go used IPv4. The documented IPv4-first command
  made the IPv4 status endpoint reachable and the app launch succeeded. No app
  logic change or weakened test was needed.
- The first cold native build exceeded the automation tool's five-minute response
  timeout but continued compiling. It was allowed to finish; a subsequent
  incremental build/run returned `BUILD SUCCEEDED`, installed and launched the
  app. An incomplete app directory was not treated as a successful build.
- Native build warnings remain for duplicate `-lc++` linkage and a Hermes
  dependency script without declared outputs. No fatal native or JS error was
  observed in this smoke flow. These warnings were not suppressed.
- Runtime logs contain Expo delegate notices for unused background callbacks
  and an iOS Simulator accessibility duplicate-class warning. No background
  capabilities were enabled merely to silence them; broader lifecycle and
  accessibility acceptance remain in #41/#43 and the physical-device gate.
- Independent review caught SDK 57's default clean prebuild behavior. Rebuild
  instructions now explicitly use `--no-clean`, with preservation guidance.
- No production behavior was modified in this ticket. Temporary Fast Refresh
  edits were reverted; existing package/player tests remain strict.

Only sanitized results are recorded here. Raw logs, simulator identifiers, app
containers and screenshots remain local. No commit, push, remote CI run, hosted
DB/Auth/Storage mutation, or deployment was performed.

## Historical local verification — 2026-09-11

- 21 tests pass using Node's test runner through TypeScript execution.
- Real SQLite transactions: checkpoint reload, stage isolation, unique completion
  history, transaction rollback on a failed history insert, and disk-backed
  database close/reopen with an unfinished speaking timer.
- Player: manual/auto confirmation, Repeat/Next, interruption during audio
  preparation, paused time, save-failure gating, and audio-failure retry.
- Audio boundary tests: pause releases native handles and remembers position;
  native interruption pauses the engine; errors during pending seeking reject;
  cancellation during asynchronous configuration creates no late player, and a
  cancelled old seek cannot interrupt its replacement player.
- All twelve shipped speech files match their size and SHA-256 manifest; native
  package boundary rejects missing, damaged, unsafe-path or interrupted assets.
- Strict TypeScript check passes.
- Expo dependency alignment and all 21 Expo Doctor checks pass.
- iOS JavaScript/Hermes export succeeds, including the twelve speech assets.
- Local iOS project generation succeeds. No microphone permission or background
  audio capability was added. Native Debug compile/run evidence is recorded above.
- Independent source review identified three native-audio lifecycle/preparation
  issues; regression coverage and release-on-pause handling were added. Focused
  re-review found all three addressed and reran the five audio-boundary tests.
- A pattern-based privacy scan of 33 new text files found no credential/private-key
  patterns or local user paths. This is not a guarantee against every secret format.
- CocoaPods was installed as a local build prerequisite. Physical-device signing
  and installation remain untested.

## Not yet verified

- Interruption/resume matrix (#41), Release-build offline launch and reinstall
  scenarios (#42), and accessibility acceptance (#43). The #40 stage/settings
  pass above does not complete these tickets.
- Physical installation and device acceptance, including screen lock, calls,
  headphones/Bluetooth and actual native audio interruption ordering.
- Native SQLite/file persistence and storage-full behavior on a physical iPhone.
- VoiceOver, large text, light/dark appearance, contrast, reduced transparency,
  safe areas, and playback quality. Source and domain tests do not prove these.

## Dependency advisory gate

`npm audit` reports 13 moderate affected dependency entries (zero high/critical),
rooted in two advisories:

- `decode-uri-component` through Expo Router's `query-string`: malformed-input
  denial of service. The available fixed decoder changes to ESM; a blind override
  is not a verified compatible fix for the older CommonJS consumer.
- `uuid` through Expo's Xcode project-generation tooling: buffer bounds checking
  in v3/v5/v6. The inspected Xcode consumer calls v4, but that observation is not
  a blanket security clearance for the dependency tree.

Do not use `npm audit fix --force`: the suggested Expo/Router downgrades would
replace the selected SDK generation. Resolve or explicitly assess these before
external distribution. The prototype imports no hosted credentials or auth code.

## Device acceptance checklist

1. Open library; incomplete installation cannot start learning. Install the sample
   and verify every clip is spoken and matches its displayed sentence.
2. Start stage 1. Audio ending alone must not increase confirmed cycles. Confirm
   three times, Repeat exactly twice, then Next. Waiting must never confirm a
   cycle, including after restoring an old automatic-mode checkpoint.
3. Pause mid-audio, lock/unlock, switch apps, then return: no automatic sound.
   Tap resume and verify the same unfinished cycle and position. Repeat while
   waiting for speaking confirmation; inactive time must not complete it.
4. Force-quit and reopen: recover only the latest durable checkpoint, paused,
   without extra confirmation or duplicate completion history.
5. In a standalone build, enable airplane mode and relaunch; installed content,
   playback and progress work without Metro or a server.
6. Complete a stage, reopen it, and verify a fresh run is possible without losing
   history. Stage 2 has independent progress. Delete/reinstall the package and
   verify progress and completion history remain.
7. Exercise headphones/audio-session interruptions, missing/corrupt package files
   and constrained storage. Errors pause safely and offer retry; ordinary saves
   and connectivity changes produce no notifications.
8. Check VoiceOver focus and labels, large text, safe areas, light/dark mode,
   reduced transparency and the selective glass controls.

M1 closes only after the real-device acceptance evidence is recorded. No remote
CI, deployment, hosted data mutation, commit, or push was performed for this check.
