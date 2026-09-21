# Wired Monitoring Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a development-only, wired-headphones-only native self-monitoring lab for physical iPhone testing before integrating all learning stages.

**Architecture:** Extend the existing LearningAudio module; keep permission, route policy, cancellation and the AVAudioEngine graph native. A small Expo route controls the lab and reads diagnostics without transporting microphone buffers. Suspend Expo playback before the lab acquires the shared session and release the lab before restoring Expo playback capability.

**Tech Stack:** Existing Expo SDK 57, React Native, Swift, AVAudioSession, AVAudioEngine, XCTest, Node/TypeScript tests.

**Spec:** `docs/design/wired-voice-monitoring.md`

## Global Constraints

- iPhone first, iOS 26+; first physical test uses the owner's iOS 27 iPhone and Apple USB-C earphones.
- Live audio only: no recording, saving, uploading, transcription or scoring.
- Allow only an output reported as wired headphones; generic USB remains blocked.
- No automatic microphone restart after disconnection, interruption or a new session.
- Preserve existing learning behavior, access checks, local data and private assets.
- Prototype only: production all-stage/menu integration follows physical acceptance.
- No commit, push, release upload or installation that deletes/replaces user data without the corresponding request.

## Review Focus

1. Permission completes after close/background/unplug: never start a stale request.
2. Route changes during input selection or graph startup: remain muted and stop.
3. Expo deactivation or engine format changes: fail stopped instead of repeatedly reactivating.
4. Missing/denied microphone or malformed persisted gain: clear status and conservative fallback.
5. Module reload/route unmount or Release direct link: capture must not outlive the lab or bypass its development gate.

## Task 1 — Native policy and lifecycle coordinator

**Files:** create `modules/learning-audio/ios/VoiceMonitorPolicy.swift`, `VoiceMonitorController.swift`, and `tests/learning-audio/Tests/VoiceMonitorTests.swift`.

**Interfaces:** Define `MonitorOutput` cases `headphones`, `speaker`, `receiver`, `bluetooth`, `airplay`, `usb`, `other`; `MonitorInput` cases `headset`, `builtIn`, `usb`, `other`. `VoiceMonitorPolicy.allows(_ outputs: [MonitorOutput]) -> Bool` permits exactly one headphones output. `preferredInput(_ inputs: [MonitorInput]) -> MonitorInput?` chooses headset then builtIn only. Native platform classes map actual ports into these types; pure tests must not need real permission.

Define a native `VoiceMonitorHardware` boundary with `outputs`, `inputs`, `requestPermission() async -> Bool`, `start(gain: Float) throws`, `stop()` and `setGain(_ gain: Float)`. The controller exposes `enable() async`, `disable()`, `invalidate()` and `setGain(_ gain: Float)`. State is `off`, `requesting`, `monitoring`, `blocked`, `denied` or `failed`. Use a monotonically increasing request generation, serialize controller transitions, and invalidate permission/start work on disable or lifecycle events. Hardware stop is idempotent.

- [x] Write route tests before implementation:

```swift
XCTAssertTrue(VoiceMonitorPolicy.allows([.headphones]))
for output in [MonitorOutput.speaker, .receiver, .bluetooth, .airplay, .usb, .other] {
  XCTAssertFalse(VoiceMonitorPolicy.allows([output]))
  XCTAssertFalse(VoiceMonitorPolicy.allows([.headphones, output]))
}
XCTAssertFalse(VoiceMonitorPolicy.allows([]))
XCTAssertEqual(VoiceMonitorPolicy.preferredInput([.builtIn, .headset]), .headset)
XCTAssertEqual(VoiceMonitorPolicy.preferredInput([.builtIn]), .builtIn)
XCTAssertNil(VoiceMonitorPolicy.preferredInput([.usb]))
```

- [x] Run the existing LearningAudio XCTest fixture and observe the missing-policy failure.
- [x] Implement the allowlist and preferred-input policy with these exact branches:

```swift
static func allows(_ outputs: [MonitorOutput]) -> Bool { outputs == [.headphones] }
static func preferredInput(_ inputs: [MonitorInput]) -> MonitorInput? {
  inputs.contains(.headset) ? .headset : inputs.contains(.builtIn) ? .builtIn : nil
}
```

- [x] Add deferred-permission tests: call enable, disable/invalidate or remove headphones, complete permission, assert hardware start count is zero. Denied permission must never start. Start failure must stop and produce failed state. Two enable requests cannot produce two running graphs.
- [x] Implement generation checks before permission, after permission, before graph startup and after route-affecting operations. Clamp finite gain to 0...1; use 0.25 for missing/nonfinite persisted gain. Test all boundaries including NaN/infinity. Persist only gain in local UserDefaults, not synced learning settings.
- [x] Re-run native fixture tests. Keep platform-independent policy/tests compilable in the existing macOS fixture; guard AVAudioSession/UIKit code with `#if os(iOS)`.

## Task 2 — Native audio graph and Expo module boundary

**Files:** create `modules/learning-audio/ios/VoiceMonitorEngine.swift`; modify `LearningAudioModule.swift`, `modules/learning-audio/index.ts`, `app.json`; extend native fixture tests.

**Interfaces:** Add development-gated module methods `monitorStatus()`, `enableMonitor()`, `disableMonitor()`, `setMonitorGain(value)`, `playMonitorSample(uri)` and `stopMonitorSample()`. Return this status shape, without PCM, filenames or device identifiers:

```ts
type MonitorStatus = {
  state: 'off' | 'requesting' | 'monitoring' | 'blocked' | 'denied' | 'failed';
  input: 'headset' | 'builtIn' | null;
  output: 'headphones' | 'unsupported' | 'none';
  gain: number;
  sampleRate: number | null;
  bufferSeconds: number | null;
  inputLatencySeconds: number | null;
  outputLatencySeconds: number | null;
};
```

- [x] Add native tests asserting blocked/denied/stopped states never create or start an input graph. Add a Release gate test rejecting enable and sample operations, not just hiding the UI. Define `onMonitorStatus` as the only event; it carries the status above.
- [x] Implement an AVAudioEngine graph: `inputNode -> voiceMixer -> mainMixer -> output`; `samplePlayer -> mainMixer` separately. Start with voice gain zero; unmute to the approved gain only after final route validation. Stop/mute before teardown. No tap copies, recorder, network call or JavaScript buffer queue.
- [x] Configure `.playAndRecord`, `.default`, no Bluetooth/default-speaker options; request a 5 ms preferred buffer and hardware-compatible sample rate while inactive. Activate, inspect available inputs, select headset/built-in, inspect actual output again, and validate nonzero input/output formats. Configure source-file conversion independently of the microphone branch. Show actual session diagnostics, not latency promises.
- [x] Observe route changes, interruption begin, engine configuration change, media-services loss/reset and `UIApplication.willResignActiveNotification` natively. Invalidate intent and stop; never automatically rebuild/restart. Background recovery only refreshes diagnostics.
- [x] Request microphone access only from the explicit enable path. Set the Expo microphone purpose string to `유선 이어폰으로 내 목소리를 실시간으로 듣기 위해 마이크를 사용해요. 음성은 저장하거나 전송하지 않아요.` Keep background recording/playback and Android recording disabled.
- [x] For sample playback, accept only the known installed public sample audio path under `lesson-packages/morning-notes-v1/audio`, using canonical-file checks consistent with LocalAudioInspection. Reject remote URLs, traversal, symlinks escaping the sample directory and private packages. Test rejection before scheduling any file.
- [x] Bridge methods/events through the existing module; do not scaffold a second module. Observe cleanup with OnDestroy/OnAppContextDestroys plus native inactivity notifications. Tests must verify idempotent shutdown and discarded late permission callbacks.

## Task 3 — Development lab and session ownership handoff

**Files:** create `src/core/voice-monitor-lab.ts`, `src/core/voice-monitor-lab.test.ts`, `src/native/voice-monitor.ts`, `src/app/monitoring-lab.tsx`; modify `src/app/_layout.tsx` only to register the test route.

**Interfaces:** A lab coordinator receives a native monitor port implementing the methods from Task 2 and an Expo lease port `{ suspend(): Promise<void>; restore(): Promise<void> }`. Expose `open()`, `enable()`, `disable()`, `close()`; opening never requests permission. Implement the lease with `setIsAudioActiveAsync(false)` before native start; shutdown native first, restore the app's playback-only mode and then `setIsAudioActiveAsync(true)` on exit. No existing player is allowed to run concurrently; enter the lab from a cold development route during the first device experiment.

- [x] Write call-order tests using injected boundary ports: open/suspend must precede native enable; close must invalidate pending work, stop native, then restore Expo; failed suspend cannot enable. Close during permission must never reacquire the session. Restore failure exposes a retry and keeps monitoring off.
- [x] Implement the coordinator with explicit lease ownership and generation cancellation. Never resolve a native failure by blindly flipping Expo `allowsRecording` or sleeping an arbitrary interval. Unexpected session deactivation must fail stopped and remain visible in diagnostics.
- [x] Build a development-only screen with native switch, input/output status, 0...1 voice slider, public-sample play/stop and the separate diagnostic values. Show `버퍼 설정값은 실제 왕복 지연이 아니에요.` below timing diagnostics. Opening the screen leaves its switch off; unsupported/denied states show a specific reason.
- [x] Both the route and native bridge must refuse Release operation. Add route-render tests for nondevelopment mode and permission/unsupported statuses. Access by the existing development URL scheme; no new production menu entry in this milestone.
- [x] On blur/unmount/inactive, close or suspend capture; no PCM or route UID in status/logs. Test repeated cleanup and hot reload. Verify that returning to normal sample learning still plays audio and does not change checkpoints or XP.

## Task 4 — Verification and physical handoff

**Files:** create `docs/wired-monitoring-verification.md`; update this plan's checkboxes with actual evidence, not predicted results.

- [x] Run `npm run check`, `EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npm run bundle:ios`, and `git diff --check`.
- [x] Generate the existing native fixture projects and run the LearningAudio scheme with strict Swift concurrency. Use available Xcode tooling/session defaults; do not invent a device or signing team.
- [x] Build the Debug app and Release compile path. Simulator checks must report unsupported route rather than faking headphones or pretending to measure physical latency.
- [ ] Connect the iPhone and Apple USB-C earphones. Inspect the actual port classifications before enabling capture. If USB is ambiguous, stop and report incompatibility; do not broaden the allowlist.
- [ ] User explicitly enables the switch and grants microphone access. Check input source, conservative gain, simultaneous public sample playback and voice-volume independence. Do not overwrite a differently distributed app or remove user data without explicit approval.
- [ ] Test unplug/replug, lock, app switch, interruption, exiting the lab and restarting it. Confirm microphone stops and does not resume automatically. Note OS route-notification limitations rather than claiming zero leaked samples without evidence.
- [ ] Record sample rate/buffer/input/output diagnostics separately from any measured round trip. If external loopback equipment is unavailable, mark true latency unmeasured and obtain the user's assessment of audible delay; do not record microphone audio to manufacture a measurement.
- [x] Stop at this physical acceptance gate before implementing full all-stage player/menu integration. Report exactly which tests passed, what needs the user's device, and whether existing app audio was restored. Leave changes uncommitted unless requested.
