# Swift-native W4 Media and Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task by task. Preserve the owner's sequential main-agent execution choice; do not delegate implementation. Use `/tdd` at the proposed seams below after plan approval, then `/code-review` for independent Standards and Spec reviews. Steps use checkbox syntax for tracking.

**Goal:** Implement #95: native audio queues, bounded/grouped video, wired monitoring and headset controls, lifecycle-safe transport, and launch/cycle haptics without Expo dependencies or changes to learning credit.

**Architecture:** Add a local `LearningMedia` Swift package that consumes the W3 controller and transport values. Main-actor resource owners control AVFoundation, MediaPlayer and Core Haptics; pure timeline/policy values remain independently testable. One coordinator serializes learning commands, executes each accepted transport request once and rejects obsolete work. The app composes those services; domain and SQLite packages never import media frameworks.

**Tech Stack:** Swift 6 language mode and strict concurrency, AVFoundation/AVFAudio, MediaPlayer, Core Haptics, ImageIO, Core Animation, Swift Testing, XCTest/XCUITest, XcodeGen, Xcode 27 and iOS 27 Simulator.

**Spec:** Owner-approved local `docs/superpowers/specs/2026-09-27-swift-native-migration-design.md`, current `docs/learning-contract.md`, GitHub #95 under #91, and `docs/swift-native/learning-storage-contract.md`. The local umbrella design is not staged or published by this plan.

Status: Owner approved the plan and test seams on 2026-09-28 (Asia/Seoul); sequential implementation is in progress. #93 and #94 are completed; #101 is merged into `dev`. The current request authorizes implementation and local commits, not push, PR creation, merge, release, physical app replacement or account access. No full W4 completion or hardware acceptance is claimed until verification is recorded.

## Global Constraints

- Keep all current product features and learning behavior. Current owner updates override historical M1 rules. W4 supplies media services and a synthetic integration surface, not W5's finished product screens.
- Keep the current iPhone-first iOS 26+ deployment scope. Verify on iOS 27 Simulator; never silently use iOS 26.5. Retain Swift 6 strict concurrency without warning suppression.
- Android will be a separate, later Kotlin-native implementation. No shared runtime, new backend, Supabase, production deployment or public release.
- No performance metrics, benchmark collection or measured improvement targets. Cancellation, bounded work and explicit resource ownership remain requirements.
- Preserve the Expo application and its reviewed native modules as the behavioral reference. Copy/adapt selected Swift services into the new package with provenance; do not compile Expo wrappers or duplicate module source trees wholesale.
- Existing learning data is test data; migration of existing records is not a release requirement. Do not scan, reset, replace or import the reference installation. Use injected, disposable fixture roots.
- Media completion is not confirmation. Only an explicit accepted user action can grant credit; headset presses are user actions, not playback callbacks. Save failure, restore, import, position, interruption and teardown grant no XP.
- No recording, microphone-buffer export, network media, private text or account data in diagnostics. Monitoring is a native live-through graph only.
- Use the existing dedicated simulator and fictional CI identity. Physical installation requires explicit target/replacement authorization; presence of a connected phone is insufficient. Do not claim a blocked hardware check passed.
- Preserve every unrelated dirty/untracked file. Never read, modify, stage or remove the unrelated file named `-`.
- Keep the current branch per `/implement`. At execution start fetch `origin/dev`, inspect its delta and fast-forward only if safe for existing work. Do not rewrite history or silently change branches. PR #101 is already merged and must not be presented as a new W4 PR.
- Preserve all four required Swift CI check names, branch policy and human release gate. No Expo/npm application checks, custom issue-closing automation or remote ruleset changes.

## Review Focus

1. A route change or exit during asset loading, a group seek or a queued save must stop output immediately and prevent delayed restart. Tasks 1–4 test cancellation before/after suspension and pause priority.
2. Exact group boundaries must resume the next included source, without gaps, duplicated end events or extra credit. Tasks 1, 2 and 4 test literal timelines and real media.
3. Denied/pending microphone permission, manual OFF and unplug/replug must not create surprise capture. Task 3 tests connection-scoped intent and the single initial-permission retry.
4. A lost commit reply, retry or state reread must not duplicate haptics, and a failed recovery pause must not lose the pending feedback event. Tasks 5 and 7 test committed evidence, not XP deltas alone.
5. Slow artwork, Reduce Motion or interruption must not trap startup or replay the launch sequence. Tasks 6 and 7 test exactly one 2.4-second cycle, cancellation and ready-app escape.

## Approved TDD seams

1. **Transport:** typed prepare/play/pause/dispose plus emitted position/end/failure events, tested with real local audio/video fixtures. Test doubles only at the external AVFoundation/time boundary.
2. **Learning integration:** public coordinator actions and reopened `LearningStore` snapshots, including pause/retry, session replacement and no-credit media completion. Do not assert private queue layout or SQL rows.
3. **Device interaction:** typed route/permission/lifecycle inputs and public monitor/remote-action outputs. Inject OS events for deterministic rules; verify real device behavior separately.
4. **Feedback and launch:** immutable pulse/frame schedules, committed feedback events and observable start/cancel/finish behavior. Fake time/hardware availability, not the learning reducer or store.

## Ownership and file map

Paths are relative to the worktree root. Source files listed below live in `native-ios/Packages/LearningMedia/Sources/LearningMedia/`; focused portable tests live in its `Tests/LearningMediaTests/` directory. iOS framework integration tests live in `native-ios/Tests/MediaIntegrationTests/` and run in a new `NativeMediaIntegrationTests` host-based target in the existing project/scheme.

- `MediaAssetCatalog.swift`, `SelectedMediaTimeline.swift`, `MediaTransport.swift`: validated installed-source references, selected-time mapping, typed platform boundary.
- `AudioQueueTransport.swift`, `VideoSegmentTransport.swift`: AVQueuePlayer and the adapted bounded-video player. No global shared player.
- `LessonAudioSession.swift`, `VoiceMonitoring.swift`, `VoiceMonitorEngine.swift`, `VoiceMonitorVoicePath.swift`, `LessonRemoteControl.swift`, `LessonRemoteState.swift`: one session owner, monitor intent/graph and remote-control lease.
- `LearningMediaCoordinator.swift`, `SilentRevealClock.swift`: ordered controller interaction, one-shot transport effects, checkpoint sampling and cancellation.
- `HapticPattern.swift`, `NativeHapticPlayer.swift`, `LaunchPlayback.swift`, `LaunchArtwork.swift`: platform-neutral schedules plus owned hardware/animation execution.
- `native-ios/Packages/AppFoundation/Sources/AppFoundation/CommittedLearningFeedback.swift` and `LearningController.swift`: feedback derived from successfully observed commits, with no Core Haptics dependency.
- `native-ios/App/{LaunchGateView,LaunchArtworkView,SyntheticMediaProbeView}.swift`, `MetaShadowingApp.swift`: launch integration and a Debug-only media probe. `LaunchArtworkView` is a narrow UIKit/Core Animation bridge, not a WebView.
- `native-ios/Tests/{MediaIntegrationTests,AppUITests}/`, `native-ios/project.yml`, `.github/workflows/ci.yml`, product/configuration guards and native documentation: verification and wiring.
- Reuse the unchanged files in `assets/brand/` through explicit XcodeGen resource entries; no whole-directory resource import or asset redraw/conversion.

## Shared interfaces and decisions

- `MediaAssetCatalog.init(scope: LearningScope, sourceCount: Int, root: URL, sources: [MediaSource]) throws` binds source-array indices to one authorized scope. `MediaSource` is `.audio(file: URL)` or `.video(file: URL, start: Double, end: Double)`. Require exactly `sourceCount` ordered entries and match the current plan before resolution. Reject remote URLs, mixed media kinds within a package, nonfinite/invalid bounds and canonical paths escaping the supplied root. The caller supplies validated installed assets; this does not grant ownership or implement W7 delivery. An injected async access validator is rechecked after preparation and immediately before starting output.
- `SelectedMediaTimeline.init(durations: [Double]) throws`, `locate(_ seconds: Double) throws -> Location` and `position(member: Int, localSeconds: Double) throws -> Double` represent 1...4 positive finite member durations and expose `duration: Double`. `Location` contains `member` and `localSeconds`. Exact boundaries select the next member; the total duration selects the end of the final member. Invalid member indices/nonfinite positions throw; finite local playback samples are clamped to the selected member's bounds. Video offsets are applied separately to validated source segments.
- `PreparedMediaRequest` contains `token: TransportToken`, ordered `sources: [MediaSource]`, `positionSeconds: Double` and `rate: Double`. `MediaPosition` contains selected `seconds` and `duration`. All crossing values are `Sendable`; AVPlayer and AVAudioEngine objects remain on their owner.
- `@MainActor MediaTransport: AnyObject` exposes `prepare(_ request: PreparedMediaRequest) async throws`, `play(token: TransportToken) throws`, `pause() -> MediaPosition?`, `dispose()`, and `onEvent: (@MainActor (MediaTransportEvent) -> Void)?`. Typed events pair the token with `.position(MediaPosition)`, `.ended(MediaPosition)`, `.failed(MediaFailure)` or `.interrupted(MediaPosition)`. `MediaFailure` exposes bounded categories (`unavailable`, `invalidAsset`, `timedOut`, `accessDenied`), not raw paths or OS error descriptions.
- `@MainActor LearningMediaCoordinator` consumes a concrete `LearningController`, catalog, access validator and the platform transport factory. `perform(_ event: LearningEvent) async -> LearningMediaState`, `retrySave() async -> LearningMediaState`, `suspend(_ reason: SuspensionReason)`, `setContext(_ context: LessonInteractionContext)` and `close() async` are its public actions. `suspend` stops hardware synchronously; its owned command lane flushes the captured position and pause after any already-committing operation. `close` waits for this safe drain before revoking the lease; failed saves remain explicitly recoverable while still mounted.
- `LessonInteractionContext` carries foreground, temporary-menu, access and lesson-complete flags. `SuspensionReason` distinguishes user pause, menu, inactivity, route change, interruption and failure. Updates never imply autoplay. The coordinator derives main/Repeat availability from the current committed state; no UI-provided XP or arbitrary "actionable" permission overrides.
- `LearningMediaState` contains the committed controller state, media position/phase and a typed media error. A fast media-position view value is separate from the durable snapshot. Save the latest playing position at most once per second, plus exact pause/member/end boundaries. One save is in flight; coalesce intermediate positions but never drop a terminal event. This interval is a recovery policy, not a zero-loss guarantee.
- `CommittedLearningFeedback` contains `commandID: UUID` and `kind` (`cycle(Int)` or `repeatChoice`). Add one-shot `feedback: [CommittedLearningFeedback]` to `LearningControllerState`. Ordinary `state` reads return no effects. Keep command provenance through retry and continuation; do not infer feedback from aggregate XP, which may saturate or change through synchronization.

### Task 1: Native audio queue and selected-time boundary

**Files:** New `LearningMedia/Package.swift`; media catalog, timeline, transport and audio files above; `SelectedMediaTimelineTests.swift`, `MediaAssetCatalogTests.swift`, and iOS `AudioQueueTransportTests.swift`/`MediaFixtureFactory.swift`. Add the integration-test target and package dependency to `native-ios/project.yml` with this first runnable slice.

**Interfaces:** Produce the catalog/timeline/transport interfaces above. `AudioQueueTransport` implements `MediaTransport` using original files, never an exported concatenation. Package tests may run on macOS for pure values; all iOS adapters must also compile and execute in the iOS target.

- [ ] **RED:** Write `exactBoundarySelectsNextAudioMember`: durations `[1.0, 2.0, 0.5]` give total `3.5`; positions `1.0` and `3.0` select members 1 and 2 at zero, and `3.5` selects member 2 at `0.5`. Reject zero/negative/NaN/infinite duration, empty/five-member lists, negative or over-duration position. Run `swift test --package-path native-ios/Packages/LearningMedia --filter SelectedMediaTimelineTests`; expect missing behavior, not an environment failure.

  ```swift
  @Test func exactBoundarySelectsNextAudioMember() throws {
      let timeline = try SelectedMediaTimeline(durations: [1.0, 2.0, 0.5])
      #expect(timeline.duration == 3.5)
      #expect(try timeline.locate(1.0).member == 1)
      #expect(try timeline.locate(1.0).localSeconds == 0)
      #expect(try timeline.locate(3.0).member == 2)
      #expect(try timeline.locate(3.5).localSeconds == 0.5)
  }
  ```

- [ ] Implement the immutable timeline and catalog validation. Add `catalogRejectsEscapedSymlinkAndNetworkURL`, missing/empty/undecodable audio and mismatched-source-count cases using disposable files. Decoder preflight/file work must not synchronously block the main actor; no reference package scan.
- [ ] **RED:** Add real-fixture tests `queuePlaysSelectedSourcesOnce`, `pauseSeekReentryKeepsSelectedPosition`, `replacementDuringPreparationCannotStart`, `failureDoesNotReportEnd`. Generate short distinguishable tone files locally for transport assertions; labels explicitly say these are fixtures, not speech-quality acceptance. Run only the new integration tests on the dedicated iOS 27 Simulator.
- [ ] Implement a queue of at most four AVPlayerItems, pitch-preserving rate `0.25...3.0`, precise selected-position seek, and a fresh remaining queue when seeking/replaying consumed items. Use asynchronous readiness with a cancellable 15-second deadline; every timeout/cancellation removes candidates and completes waiters exactly once. No busy-loop readiness polling. Track durations by source identity, not only current queue index after automatic removal. Native AVFoundation end observations remain authoritative when periodic callbacks are delayed or absent.
- [ ] Verify rate and selected-position semantics, one end event after the last member, stale callback rejection and disposal. Remove all item/KVO/time/notification observers on pause/replacement/disposal as applicable; retain no periodic work while paused. Run `swift build --package-path native-ios/Packages/LearningMedia` and the focused pure/iOS suites before the task commit.

### Task 2: Bounded and grouped video without Expo bindings

**Files:** `VideoSegmentTransport.swift`; adapt reviewed logic from `modules/learning-audio/ios/{LessonVideoPlayer,VideoSegmentTimeline}.swift` without editing the reference; `VideoSegmentTransportTests.swift` and native fixture generation.

**Interfaces:** Same `MediaTransport`; add main-actor `attach(_ layer: AVPlayerLayer)` and `detach(_ layer: AVPlayerLayer)` for the eventual native surface. Layer attachment is presentation only and never starts playback.

- [ ] **RED:** `groupedVideoSkipsSourceGaps` uses segments `[0,1]`, `[3,5]`, `[7,7.5]`: duration `3.5`, selected positions `1` and `3` seek media positions `3` and `7`. `pauseDuringMemberSeekCannotRestart` pauses/replaces before a deferred transition seek completes. `duplicateBoundaryCallbacksEndOnlyOnce` injects both AV end paths. Run the focused iOS suite; observe failures before adapting production code.
- [ ] Adapt the reviewed native service into a non-singleton owner with typed events and the shared token. Keep `forwardPlaybackEndTime`, track validation, exact source seek, pitch behavior, disabled external playback and one original audio track. Replace its 10 ms readiness loop with a cancellable readiness observation. The retained final frame remains visible until replay/replacement; a stopped/ended transport must not create a zero-time replacement frame.
- [ ] Preserve selected time during in-flight gap skipping and reject late old-member callbacks after cancellation. Keep the positioned old player visible until a new candidate is decoded and sought. Stop/dispose remove observers from the exact player that created them; replacing a layer never transfers observer ownership accidentally.
- [ ] Run single-source/grouped/partial-group fixture tests, corrupt/no-audio/no-video asset tests, rate changes while paused and exact-end replay tests. Add `missingPeriodicCallbackStillHonorsNativeEndBound`: dropped UI sampling cannot permit playback through an excluded gap. Run strict-concurrency iOS build and product dependency guard. Commit the bounded video slice with reference files unchanged.

### Task 3: Audio-session ownership, wired monitoring and remote commands

**Files:** Session, monitoring, voice-graph and remote files in the ownership map; `LessonAudioSessionTests.swift`, `VoiceMonitoringTests.swift`, `LessonRemoteStateTests.swift`, and iOS `NativeLifecycleTests.swift`. Adapt reviewed Swift monitor/remote services and preserve attribution. Do not include `LearningAudioModule`, `LessonVideoView`, `MonitorSampleFiles` defaults or `TestBuildAccess` as hidden dependencies.

**Interfaces:** `@MainActor LessonAudioSession` owns `acquirePlayback() throws`, `acquireMonitoring() throws`, `releaseMonitoring()`, `close()`. `VoiceMonitoring.update(_ context: LessonInteractionContext)`, `setEnabled(_ enabled: Bool) async`, `setGain(_ gain: Float)` and `close()` expose typed status. `LessonRemoteControl` publishes the existing one-shot owner/revision actions; the coordinator in Task 4 revalidates them before issuing commands.

- [ ] **RED:** Port policy behavior through public interfaces: `permissionGrantAfterExitDoesNotStart`, `manualOffSurvivesForegroundUntilReconnect`, `onlyInitialPermissionCancellationMayRetryOnce`, `interruptionNeverAutoRestarts`, `playbackCleanupDoesNotDeactivateLiveMonitoring`, `retiredGraphCannotInvalidateReplacement`, `headsetRevisionCanBeConsumedOnce`. Use OS-boundary doubles for permission, route, audio session and time; no microphone capture in automated tests. Run focused package/iOS suites.
- [ ] Centralize session category/activation so audio and video cannot deactivate an active monitor. Preserve playback-only versus play-and-record modes and the 4x microphone-only gain path (`20 * log10(4)`), independent `0...1` control and fresh `0.25` value. No capture/file recording/networking; do not create a hardcoded sample-player branch at graph start. The existing demonstration capability may use an explicitly supplied validated sample through the shared media path.
- [ ] Keep capture restricted to exactly `.headphones`; prefer headset mic, then built-in mic. Speaker, receiver, Bluetooth, AirPlay and generic USB remain unsupported. Start only in an eligible foreground lesson with permission. Existing capture may continue through temporary menus/background/lock; these states cannot start capture. Exit, completion, access loss, interruption, route loss and media-service reset stop it. Remove graph-specific configuration observers at each stop, not only final shutdown.
- [ ] Preserve MainActor ownership across callback boundaries, weak/current-graph checks and a permanent closed generation. No non-Sendable AVAudioEngine capture in an unisolated callback, no unchecked conformance used to silence the compiler. Keep callbacks bounded and generation-validated after suspension.
- [ ] Preserve generic Now Playing metadata, play/pause/toggle as main action and next-track as Repeat. Keep the shared one-shot revision gate and `0.35`-second debounce; no application double-click timer. Consume but ignore unavailable actions; background/menu/unsupported route cannot confirm. End removes every command target and Now Playing ownership. Restoring transport ownership starts neither capture nor playback.
- [ ] Run portable policies plus injected iOS notification tests, repeated start/stop observer cleanup and cancelled permission tests. Physical headset dispatch/capture remains explicitly unverified until Task 8 hardware acceptance. Commit only Swift-native changes.

### Task 4: Controller integration, reliable suspension and silent reveal

**Files:** `LearningMediaCoordinator.swift`, `SilentRevealClock.swift`; `LearningMediaCoordinatorTests.swift`, `SilentRevealClockTests.swift`, and real-store coordinator integration tests. Consume `LearningController`, `LearningPlan`, `TransportRequest` and `RevealTimeline` without moving learning rules into media.

**Interfaces:** Public coordinator interface defined above. `SilentRevealClock.start(token:elapsedSeconds:duration:WPM:)`, `pause() -> Double` and `cancel()` use injected monotonic time/sleep at the clock boundary and emit the same typed progress/end events without constructing a media driver.

- [ ] **RED:** Test `mediaEndLeavesZeroXPAndNeedsConfirmation`, `scenePauseDuringSaveCannotAutoplayContinuation`, `oldSeekCannotPublishIntoNewPlan`, `pauseFlushesLatestPositionBeforeRevoke`, `saveFailureStopsOutputAndRetryStaysPaused`. Use the real controller and temporary SQLite store. In a suspended-save case, an interruption arriving during explicit confirmation must prevent its follow-on prepare from playing, preserve any legitimately committed credit, and persist stopped state after the in-flight result.
- [ ] Implement one ordered command lane; actor isolation alone does not guarantee ordering. Discard repeated requests already executed, gate callbacks by full token, coalesce only replaceable positions, and retain end/interruption until the current commit completes. Stop hardware and invalidate launch/prepare work synchronously before awaiting storage. Revalidate owner, activity and access before consuming returned effects. On save failure, show only durable progress and retain the original retry identity; do not confuse failure with successful pause.
- [ ] Handle `.prepare` with cancellable `delayMilliseconds` (1000 on audio stage entry/new phrase, zero on Repeat/another cycle), `.stop` idempotently and `.restoreFrame` without starting sound. Enforce a single owner across old/new profiles and plans. Capture position before retiring the driver; close drains safely and revokes only the owned learning lease. Background/foreground/menu dismissal never calls resume implicitly.
- [ ] **RED:** `silentStageNeverOpensAudioOrVideo`, `partialWordTimingSurvivesPause`, `foregroundDoesNotAdvanceReveal`, `completedRevealNeedsManualConfirmation` cover stages 11...16. At 150 WPM, 0.2 elapsed seconds remains half a word; changing to 300 preserves that fraction at 0.1 seconds through the domain event. Empty text still uses the existing minimum one-word duration. Run focused coordinator/clock tests.
- [ ] Drive reveal at its next word deadline using monotonic elapsed time, not a continuously polling timer. Pause saves fractional-word progress, cancels the clock and freezes hidden text. Completion emits one playback-ended event and exposes the completed reveal; no confirmation or XP occurs until the user action. Initial silent entry has no artificial audio delay. Independently authorized wired monitoring/headset ownership may exist, but silent timing itself never acquires media or microphone resources.
- [ ] Route accepted headset actions through the exact same guarded command path as visible controls; next-track only invokes an actionable third-cycle Repeat. Add a real-store test for a duplicate press, menu-open press, and an explicit accepted confirmation. Run all focused suites plus AppFoundation regression tests and commit.

### Task 5: Committed cycle feedback and isolated native haptics

**Files:** `CommittedLearningFeedback.swift`, `LearningController.swift` and controller tests; `HapticPattern.swift`, `NativeHapticPlayer.swift`, `HapticPatternTests.swift`, `CommittedFeedbackTests.swift`; adapt reviewed `modules/learning-haptics/ios/{CycleHapticPlayer,LaunchHaptics}.swift` with no Expo `Record` type.

**Interfaces:** `CommittedLearningFeedback` and controller `feedback` defined above. `HapticPulse.init(time: Double, intensity: Float, sharpness: Float) throws` validates a Swift value. `HapticPattern.cycle(_ ordinal: Int) -> HapticPattern?`, `.repeatChoice` and `.launch` provide immutable `pulses: [HapticPulse]` schedules; unsupported cycle ordinals return nil. `@MainActor NativeHapticPlayer.prepare()`, `play(_ pattern: HapticPattern)`, `stop()` own one engine/player. Launch and learning use separate instances.

- [ ] **RED:** `failedSaveAndMediaEndEmitNoFeedback`, `successfulRetryEmitsOnce`, `lostReplyRetryDoesNotDuplicateFeedback`, `stateReadAndRestoreAreQuiet`, `recoveryPauseFailureRetainsUnemittedFeedback`, `saturatedXPStillAllowsNewConfirmationFeedback`. Assert one event keyed by the original command after successful committed observation, and none from replayed commands or restored state. Include confirmed third-cycle Repeat (feedback even when already-confirmed decision adds optional practice) and already-confirmed Next (no extra feedback).
- [ ] Generate feedback within the controller from the accepted event and before/committed source progress. Retain the original receipt/feedback candidate through retry's additional pause and through automatic cycle continuation; emit only once when the committed result can be safely published. Media never manufactures this effect. The coordinator consumes it once; navigation/teardown may discard obsolete feedback but never replay it later.
- [ ] **RED:** Assert cycle 1/4 intensities `[0.45,0.70]`, cycle 2 `[0.45,0.45,0.70]`, cycle 3/5 `[0.45,0.45,0.70,0.25]`, Repeat `[0.45]`; times use 0.08-second spacing and sharpness 0.5. Launch times `[0.24,0.66,0.89,1.39,1.81]`, intensities `[0.90,0.60,1.00,0.90,0.60]`, sharpness 0.15. Do not double the already-doubled launch values or equate parameters with perceived strength.

  ```swift
  @Test func thirdCycleKeepsItsFourPulseRhythm() throws {
      let pattern = try #require(HapticPattern.cycle(3))
      #expect(pattern.pulses.map(\.time) == [0, 0.08, 0.16, 0.24])
      #expect(pattern.pulses.map(\.intensity) == [0.45, 0.45, 0.70, 0.25])
      #expect(pattern.pulses.map(\.sharpness) == [0.5, 0.5, 0.5, 0.5])
  }
  ```

- [ ] Adapt a haptics-only engine with `CHHapticEngine(audioSession: nil)`, auto shutdown, silent unsupported/error fallback and at most one pattern per player. Do not change the lesson's audio session. Stop/reset/inactivity/exit discard pending feedback permanently. Preserve existing device-local learning-feedback behavior without adding a settings menu; launch ignores obsolete application opt-outs. No tap sound or stacked success haptic.
- [ ] Run controller/package pattern tests and native Core Haptics fixture construction on iOS 27. Hardware feel/alignment is not a Simulator assertion. Commit after focused builds/tests pass.

### Task 6: One-shot native launch artwork and synchronized feedback

**Files:** `LaunchArtwork.swift`, `LaunchPlayback.swift`, `LaunchPlaybackTests.swift`, `LaunchArtworkTests.swift`; app `LaunchGateView.swift`, `LaunchArtworkView.swift`, `MetaShadowingApp.swift`; explicit unchanged brand resources in `native-ios/project.yml`.

**Interfaces:** `LaunchArtwork.decode(url: URL) async throws -> LaunchArtwork` returns validated frame/duration values using ImageIO outside UI rendering. `@MainActor LaunchPlayback` owns `startWhenReady(reduceMotion: Bool)`, `interrupt()` and completion state. A narrow view adapter displays the first frame and reports actual presentation readiness before starting the one-shot animation and haptic schedule.

- [ ] **RED:** On iOS 27, `suppliedArtworkDecodesSeventeenFrames` must decode all frames of the unchanged WebP and assert delays `[0.24,0.09,0.14,0.08,0.11,0.13,0.10,0.08,0.18,0.10,0.14,0.08,0.13,0.09,0.12,0.14,0.45]`, totaling 2.4 seconds. This was observed in a read-only macOS ImageIO check while planning, not yet verified on iOS. A one-frame result is a failed acceptance check, not permission to remove animation or silently add a decoder dependency.
- [ ] Decode only bundled artwork, preserve originals byte-for-byte and bound storage to 17 frames. Use a Core Animation discrete frame sequence with cumulative frame times; a UIImageView equal-duration frame list would change mouth timing. Release decoded frames when launch no longer needs them. Do not redraw, re-encode, download or introduce a WebView/JavaScript runtime.
- [ ] **RED:** `launchRunsOnceAfterBothImagesDisplay`, `slowBootstrapNeverReplays`, `reduceMotionSkipsDelayAndHaptics`, `inactivityCancelsWithoutReplay`, `missingArtworkAllowsReadyAppAfterFiveSeconds`, `lateReadyCallbackCannotRestart`. Use external time and presentation-readiness seams with literal 2.4- and 5-second limits; run the focused launch tests.
- [ ] Preserve the centered 160-by-160-point puppy on white and uncropped 220-by-(220*2/3)-point wordmark, with its image box 58 points above the screen bottom. Launch completion gates only animation; application readiness remains owned by bootstrap and its recoverable error UI. An image failure, timeout or reduced motion must not mask a ready application. Interruption marks the animation finished, cancels feedback and never starts a second sequence on foreground.
- [ ] Prepare launch haptics while assets load, start the schedule only after visual playback begins, and stop on completion/failure/inactivity. Keep the launch and cycle players separate. Native clocks do not establish perceptual sync by themselves; record physical verification separately. Run native decoding/schedule tests and existing launch/navigation UI tests before committing.

### Task 7: Runnable synthetic slice, Swift-only CI and product guards

**Files:** App `SyntheticMediaProbeView.swift`, `MetaShadowingApp.swift`; `native-ios/Tests/AppUITests/NativeFoundationUITests.swift`; `native-ios/Tests/MediaIntegrationTests/`; project/package wiring, `.github/workflows/ci.yml`, `native-ios/scripts/{verify-native-product,test-ci-configuration}.sh`, `native-ios/README.md`, `docs/native-ci.md`, new `docs/swift-native/media-feedback-contract.md`.

**Interfaces:** Debug-only `--ui-test-learning-media` and existing UUID-based `--ui-test-probe-id` select an isolated workspace, never an arbitrary supplied path. Media fixtures are generated for that workspace or embedded in the test bundle only. Add native integration tests to the existing `MetaShadowingNative` scheme; CI keeps the same required jobs.

- [ ] **RED:** Add UI tests `testMediaEndDoesNotConfirm`, `testExplicitConfirmationSurvivesMediaRelaunch`, `testBackgroundStopsAndRestoresPaused`, and `testSilentProbeUsesRevealWithoutPlayback`. Exercise real short audio/video through the coordinator and real SQLite; never implement a button that calls playback-ended as a substitute for AVFoundation. Retain the W2/W3 tests. Run each new UI test separately while implementing.
- [ ] Add a clearly labeled probe for audio, grouped video, silent reveal, monitor status and cycle feedback. Use only public-safe fixtures and explicit user actions. It must expose actionable media/save failures and retry without adding finished W5 screens or granting installed-content ownership. All probe hooks/assets remain absent from Release; reusable media and launch services remain available to Release composition.
- [ ] Add `swift test --package-path native-ios/Packages/LearningMedia` to `ci-quality` and the actual iOS media integration target to `ci-native-tests`. Do not mark iOS-only adapter tests passed merely because macOS conditional code was excluded. Run `actionlint`, `node --test scripts/check-branch-policy.test.mjs` and the clean-checkout CI configuration guard; preserve release approval and fictional identity.
- [ ] Extend product guards to check that Release contains no probe identifiers/fixture media, contains required unchanged launch artwork, and embeds no Expo/React Native/JavaScript runtime. Add the microphone usage description and audio background capability only to support the documented live wired-monitoring behavior; lesson playback/reveal still stops on inactivity. Do not add cloud, purchase or signing entitlements.
- [ ] Run the full final validation matrix below after all code and review corrections. Document exact outcomes and separate device-only limits. Commit task-sized changes on the requested current branch after verifying author/committer no-reply identity and inspecting exact staged paths for public privacy.

### Task 8: Acceptance, independent review and handoff

**Files:** `docs/swift-native/media-feedback-contract.md` and this plan's completion state. Review fixed point: latest integrated `dev` captured before execution (observed during planning: `6dcb830fce6e045980ceb28264a6fc09cd6387ef`); obtain owner agreement with this plan, then re-resolve and record the actual base before code changes.

- [ ] Use `/code-review` after implementation: separate read-only Standards and Spec reviewers compare the implementation against the pinned base and #95/current contracts. Review the five failure modes above. Implement no reviewer request blindly; reproduce/justify findings and rerun the affected tests. Keep the two reports separate.
- [ ] Record actual native fixture results for grouped audio/video, observer/resource release, pause/reentry, corruption/failure, interrupted preparation and stale callback rejection. Report what was observed, not just that a source file exists or compiles.
- [ ] For physical acceptance, first obtain explicit authorization for the exact new-target installation/replacement and disposable local profile. With the owner, verify wired audio/voice-only gain, permission denial/grant, single/double headset presses, unplugging, real interruption, lock/background/foreground, stopped output, five launch pulses and cycle feedback. No accounts, cloud operations, purchases or private content are needed. Without that session, report each hardware item as pending; simulated notifications are not proof of real routing or tactile perception.
- [ ] Map all eight #95 checkbox items to their evidence. Code and Simulator completion may be reported with explicit pending hardware observations; do not close the issue or mark hardware verification complete without the relevant evidence and separate closure request. No PR, push, merge, automatic issue closure or release in this invocation.

## Final validation matrix

Run focused tests throughout; run the complete applicable suite once at the end, repeating affected tests after corrections. Swift builds are typechecking. Use XcodeBuildMCP for simulator builds/tests per the iOS skill, configured to the existing dedicated iOS 27 Simulator; shell equivalents below document reproducible commands. Keep device IDs and local paths out of committed evidence.

```sh
swift test --package-path native-ios/Packages/LearningDomain
swift test --package-path native-ios/Packages/LearningPersistence
swift test --package-path native-ios/Packages/AppFoundation
swift test --package-path native-ios/Packages/LearningMedia
node --import tsx scripts/swift-learning-reference.ts --check
actionlint .github/workflows/ci.yml
node --test scripts/check-branch-policy.test.mjs
bash native-ios/scripts/test-ci-configuration.sh
xcodegen generate --spec native-ios/project-ci.yml
```

The TypeScript oracle is local-only and uses existing dependencies; it is not restored Expo CI. With `NATIVE_SIM_ID` set to the dedicated iOS 27 device:

```sh
xcodebuild test -project native-ios/MetaShadowingNative.xcodeproj \
  -scheme MetaShadowingNative -configuration Debug \
  -destination "platform=iOS Simulator,id=$NATIVE_SIM_ID" \
  -derivedDataPath native-ios/DerivedData -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO
xcodebuild build -project native-ios/MetaShadowingNative.xcodeproj \
  -scheme MetaShadowingNative -configuration Release \
  -destination "platform=iOS Simulator,id=$NATIVE_SIM_ID" \
  -derivedDataPath native-ios/DerivedData CODE_SIGNING_ALLOWED=NO
bash native-ios/scripts/verify-native-product.sh \
  native-ios/DerivedData/Build/Products/Debug-iphonesimulator/MetaShadowingNative.app
bash native-ios/scripts/verify-native-product.sh \
  native-ios/DerivedData/Build/Products/Release-iphonesimulator/MetaShadowingNative.app
git diff --check
```

Focused iOS tests use `-only-testing:NativeMediaIntegrationTests/<SuiteName>` or the individual XCUITest selector with the same scheme/destination. Confirm test summaries include executed iOS adapter tests, not zero tests or skips. Existing source fixtures under `tests/learning-audio/` and `tests/learning-haptics/` guide parity; unchanged Expo-linked lanes are not reintroduced to CI.

## Self-review and approval handoff

All #95 deliverables map to Tasks 1–6; lifecycle and no-credit invariants map to Tasks 3–5; native integration/CI evidence maps to Task 7 and physical observation/reporting to Task 8. Each review-focus risk has named tests. Interfaces preserve the W3 controller boundary and do not give media reward authority. Full product screens, installed-content services and release remain W5/W7/W8 work.

This plan was self-reviewed for scope, interface consistency, test seams and privacy, then approved by the owner. Preserve sequential execution. Implementation progress and evidence are tracked during execution; the required final code review remains pending.

Apple references checked during planning: [AVQueuePlayer](https://developer.apple.com/documentation/avfoundation/avqueueplayer), [time-observer cleanup](https://developer.apple.com/documentation/avfoundation/avplayer/removetimeobserver(_:)), and [haptics-only audio-session initialization](https://developer.apple.com/documentation/corehaptics/chhapticengine/init(audiosession:)). The latter supports using a nil session for haptics-only playback; it does not prove device timing or feel.
