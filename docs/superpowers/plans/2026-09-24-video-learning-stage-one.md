# Video Learning Stage One Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete #67: install a prepared private video package and learn stage 1 offline without changing existing audio learning.

**Architecture:** Keep the current Player and journal as the only authorities for cycles, confirmation, and XP. Add a validated video package variant and an AVPlayer-backed segment adapter behind the existing AudioPort contract. Expose a passive inline native video surface; native code owns file verification and bounded playback, not React timers.

**Tech Stack:** Existing Expo 57 / React Native / TypeScript application, Expo native modules, Swift, AVFoundation, CryptoKit, native files, and SQLite. iOS 26+ only. No new hosted service.

**Spec:** `docs/superpowers/specs/2026-09-24-video-learning.md`, issue #67, and `docs/learning-contract.md`.

## Execution status — 2026-09-24

Tasks 1 and 2 are implemented with core, preparation, filesystem and native
playback tests. Task 3 is wired and covered by automated checks and an arm64
iOS Simulator build; its interactive simulator demonstration remains pending.
The original checklist below remains the acceptance reference, not a claim that
unperformed device checks passed. See `docs/video-learning-verification.md` for
the exact evidence and review resolutions. The explicit `implement` invocation
authorizes the local commit; no push, PR or issue closure is included.

Execution refinements: the passive native view attaches to the single owner-scoped
controller rather than taking a redundant owner prop. Installation reuses the
library's existing material card, so no download-preview change is needed. An
optional AudioPort frame-restoration hook preserves a saved decision without
autoplay or reward changes.

## Global Constraints

- Start from current `origin/dev`; use `codex/video-learning`; preserve the untracked scratch file.
- Do not commit, push, merge, or release without the corresponding user request.
- Preserve the complete original video without cutting or re-encoding.
- Use supplied corrected English and final Korean unchanged; do not substitute source Korean or ASR text.
- No private payloads, source identifiers, local paths, or hashes in public output.
- First delivery is explicitly prepared local content; no general importer or remote repository access.
- Preserve audio-package keys, journal formats, ownership checks, cycles, confirmation, and XP.
- Until #68/#69 land, enable only stage 1 for a video package, including direct routes.
- Generated native iOS files are not the source of truth; changes must survive prebuild.
- Each implementation step follows a failing behavioral test, then minimal implementation, then regression verification.

## Review Focus

1. A large video must be copied and hashed incrementally, never materialized as one JS byte array.
2. A seek completing after navigation, pause, or replacement must not start obsolete playback or report completion.
3. A segment end must hold the frame without playing excluded speech or awarding progress.
4. Missing, malformed, truncated, or symlinked media must not become a ready package or escape its storage root.
5. Private content must be absent from default and release build resources, logs, test reports, and JS bundles.

## Baseline and execution boundary

Latest dev at preparation: `255a7b3`. Existing `npm test`: 412 passing, zero failing.
The native checkout is already isolated; no additional worktree is needed.
This document plans the first vertical slice only. #68–#70 retain their approved
scope and native GitHub blocking links. Their implementation plans follow when
their prerequisites are working, rather than guessing at unbuilt interfaces.

## Intended file responsibilities

- `src/core/video-package.ts`: strict prepared-manifest decoding and immutable video identity.
- `src/core/video-package.test.ts`: valid/invalid metadata and stage availability behavior.
- `scripts/package-video.ts`: explicit local ZIP/video preparation, checksum matching, ignored output.
- `scripts/package-video.test.ts`: run preparation against temporary synthetic inputs and inspect outputs.
- `src/core/learning-context.ts`: common text-bearing package shape plus audio/video narrowing, with old package identities unchanged.
- `src/core/video-playback.ts`: AudioPort adapter, relative segment time, cancellation and event validation.
- `src/core/video-playback.test.ts`: Player integration, errors, cancellation, and bounded timeline behavior.
- `modules/learning-audio/ios/LocalVideoPackage.swift`: native streaming installation, validation, measurement, removal, and local file resolution.
- `modules/learning-audio/ios/LessonVideoPlayer.swift`: bounded AVPlayer owner and generation-scoped callbacks.
- `modules/learning-audio/ios/LessonVideoView.swift`: AVPlayerLayer surface, no playback controls.
- `modules/learning-audio/ios/LearningAudioModule.swift` and `modules/learning-audio/index.ts`: typed native package/player bridge and view registration.
- `src/native/video-package.ts`: narrow native package actions; no private JS imports.
- `src/native/video.ts` and `src/components/lesson-video.tsx`: bridge adapter and passive inline surface.
- `src/native/catalog.ts`, `src/native/package.ts`, `src/native/package-storage.ts`: dispatch only the recognized video variant to its own actions.
- `src/app/(tabs)/index.tsx`, `src/app/(tabs)/lesson.tsx`, `src/app/download-preview.tsx`, `src/app/player.tsx`: install/readiness, stage gating, and player composition.
- `plugins/with-local-video-package.js`: explicit opt-in debug resource preparation; default/release excludes private payloads.
- `tests/learning-audio/Tests/LocalVideoPackageTests.swift`, `tests/learning-audio/Tests/LessonVideoTests.swift`, `tests/learning-audio/project.yml`: actual filesystem and AVPlayer tests using generated fixtures.
- `docs/video-learning-verification.md`: measured results, private preparation instructions with placeholders, and unperformed device checks.

## Task 1: Prepare and install a validated local package

### Interfaces

Keep existing audio manifests valid without adding an audio discriminator to
persisted data. Narrow audio-only callers instead of fabricating audio files
for video phrases. The new wire format is explicit:

```ts
export type VideoManifest = {
  kind: 'video'; schemaVersion: 1;
  id: string; version: number; title: string;
  media: { file: 'video/source.mp4'; bytes: number; sha256: string; duration: number };
  phrases: { id: string; start: number; end: number; text: string; translation: string }[];
};
export type VideoPackage = { language: 'english'; delivery: 'localVideo'; manifest: VideoManifest };
// Null input means no optional package; invalid non-null input is an error.
export function readVideoPackage(json: unknown): VideoPackage | null;
export function videoStageAvailable(stage: number): boolean;
```

Native package methods exposed by LearningAudio:

```ts
readonly localVideoManifest: string | null;
videoPackageStatus(): Promise<{ installed: boolean; busy: boolean; bytes: number }>;
installVideoPackage(): Promise<void>;
removeVideoPackage(): Promise<void>;
```

All three methods resolve the same native build-pinned package, not arbitrary
paths or JS-supplied descriptors. Source material lives in ignored `private/`;
the opt-in development resource bridge is separate from GitHub transport.

- [ ] Write manifest tests before the decoder. Begin with a valid fictional
  package, then duplicate IDs, overlapping/reversed/out-of-range intervals,
  nonfinite values, invalid version/hash/path, empty final text, and null input.
  Literal expected behavior:

  ```ts
  assert.equal(readVideoPackage(null), null);
  assert.equal(videoStageAvailable(1), true);
  assert.equal(videoStageAvailable(11), false);
  assert.throws(() => readVideoPackage(JSON.stringify({ kind: 'video', schemaVersion: 1 })));
  ```

- [ ] Run `npx tsx --test src/core/video-package.test.ts`; establish red because
  decoding and video stage policy do not yet exist. Introduce typed empty
  scaffolding only as needed to turn import failures into behavioral failures.
- [ ] Implement strict decoding and package narrowing. Validate every record,
  preserve supplied strings, reject ambiguity, and keep old packageKeyOf output.
  Treat text-bearing phrases as the common LearningContext input; only audio
  installation and audioUri require audio-file metadata.
- [ ] Write preparation tests using temporary ZIPs and synthetic bytes. Verify
  duplicate manifest entries, checksum mismatch, and an existing output version
  fail without publishing output. Verify copying preserves exact bytes.
- [ ] Implement `scripts/package-video.ts`: enumerate ZIP names; read only the
  single expected JSON member; validate source schema/languages, media checksum,
  timestamps and final text; reject excluded/unsupported sample input instead of
  guessing. Map corrected English to text and final Korean to translation.
  Stream hash/copy the original MP4 into a temporary ignored package directory;
  atomically publish only after validation. Do not print input data or paths.
- [ ] Write native installation tests using a small real temporary file. Verify
  checksum and byte mismatch, path/symlink rejection, interrupted copy, readiness
  only after verification, operation serialization, and removal preserving journal data.
- [ ] Implement native installation with bounded reads and incremental CryptoKit
  SHA256. Resolve standardized paths under the fixed source/destination roots;
  reject symlinks. Copy to staging, verify, then atomically publish readiness.
  Preserve a previously verified version if staging fails. Reverify local media
  before declaring ready after relaunch, off the main thread.
- [ ] Test build-resource preparation by running the plugin on a temporary
  generated project. With opt-in absent, no content resource is added. With
  opt-in present, copy only the prepared manifest/media for Debug; Release omits
  both and exposes no native manifest. Never interpolate unescaped input paths
  into shell build phases. Reject unsupported build configuration rather than
  falling back to including private content.
- [ ] Wire catalog, install/readiness, measured storage, and removal through the
  recognized video package. Keep existing bundled/hosted/paid branches intact.
- [ ] Run core tests, preparation tests, plugin tests, native file tests, and
  `npm run typecheck`; default catalog and old checkpoints must remain unchanged.

## Task 2: Play a bounded segment without changing learning authority

### Interfaces

The native controller uses a session owner and monotonically increasing request
generation. Events are ignored unless both match the current JS adapter.

```ts
export type VideoStatus = {
  owner: string; generation: number;
  phase: 'ready' | 'playing' | 'paused' | 'ended' | 'failed';
  position: number; duration: number;
};
export interface VideoBridge {
  prepare(owner: string, generation: number, phrase: number, position: number, rate: number): Promise<void>;
  play(owner: string, generation: number): void;
  pause(owner: string): void;
  dispose(owner: string): void;
  subscribe(listener: (event: VideoStatus) => void): { remove(): void };
}
```

`position` and `duration` are relative to the learning segment, not the movie.
Native code resolves the phrase from its verified manifest. JS cannot command
arbitrary media URLs or edit phrase boundaries. The adapter implements the
existing AudioPort; it never writes progress or emits XP itself.

- [ ] Write adapter tests with a controlled bridge implementing the interface.
  Test prepare/start/rate, pause during pending seek, disposal, replacement,
  duplicate ended events, error after partial playback, and stale ready/ended.
  A segment from 10 to 12.5 seconds must report duration 2.5 and restore saved
  position 0.75 at native absolute time 10.75.
- [ ] Run `npx tsx --test src/core/video-playback.test.ts` and record expected red.
- [ ] Implement generation-scoped adapter state. Cache native relative time for
  synchronous AudioPort.position(), reject pending preparation on cancellation,
  and bound loading/seek waits. Deliver ended once only for the active segment.
  Keep pause separate from disposal so a paused view can hold its frame.
- [ ] Add real AVPlayer tests using a generated short movie with distinct visual
  frames and audio. Verify segment stop, exact-seek resume, paused last-frame
  retention, repeat from start, invalid media failure, and cancellation while
  preparing. No private video is a committed fixture.
- [ ] Implement LessonVideoPlayer using a single AVPlayer and AVPlayerLayer.
  Validate readiness, seek to segment.start + relativePosition, set native end
  bounds, and pause at completion. Keep the item attached while awaiting
  confirmation. Check owner/generation in every asynchronous callback and remove
  all observations on replacement/disposal. Use the existing lesson audio-session
  configuration; do not create an Expo audio player for a video package.
- [ ] Reuse existing foreground/menu pause notifications to stop video immediately.
  Do not deactivate the shared audio session on segment completion or temporary
  pause; microphone and remote ownership remain with their existing services.
- [ ] Run native tests and existing audio tests. Record seek/end precision from
  actual native evidence; never use a JS polling interval as proof of a hard stop.

## Task 3: Complete stage 1 through the actual learning screen

### Interfaces

`LessonVideo` takes the controller owner as a prop and renders only its native
surface. PlayerScreen selects exactly one original-media adapter. Existing
WordRevealContent and audio packages retain their current code paths.

```tsx
{videoOwner !== null && <LessonVideo owner={videoOwner} />}
<SpeechContent phrases={presented} active={state.phrase} view={speechView} unitLabel={unitLabel} />
```

The snippet uses PlayerScreen's existing text props. Insert the video surface
without replacing the existing text tree.

- [ ] Write Player/journal integration tests for stage 1 using the real session
  reducer and SQLite writer with the video adapter. Completion events alone earn
  zero XP; each explicit confirmation earns once; repeated callbacks and resume
  earn nothing; Repeat after cycle three adds exactly cycles four and five.
- [ ] Add route-policy tests: video stage 1 permitted by the existing stage-access
  policy, stages 2–16 unavailable until their tickets land, malformed keys rejected,
  existing audio stage access unchanged. Add render tests proving one passive
  video surface above text and no fullscreen/scrubbing/PiP controls.
- [ ] Run targeted tests and observe red before wiring screen and stage policy.
- [ ] Insert the inline surface into current-unit content and select the video
  adapter for the recognized video package. Keep the Player engine, saved
  checkpoint writer, controls, subtitle components, and error/save guards intact.
  Video failure uses an actionable video-specific message and never confirms.
- [ ] Ensure focus cleanup pauses and invalidates pending requests. Dispose on
  leaving the lesson; do not destroy the paused frame for a temporary drawer.
  The existing stage-entry replay policy remains distinct from drawer return.
- [ ] Run `npm run check`, preparation/plugin tests, native playback tests, and
  an iOS export with private content opt-in disabled. Inspect artifacts to verify
  no private payloads were included. No commit or push is part of this step.
- [ ] Build the opt-in local simulator app and prepare the supplied sample using
  explicit local inputs. Demonstrate install, offline stage-1 playback, all three
  confirmations, replay, rate adjustment, restart, corrupt/missing-media failure,
  and menu return. Do not install on a physical phone without the user's request.
- [ ] Document exact tests and observed results in `docs/video-learning-verification.md`.
  Mark physical monitoring/headset tests unperformed. Leave #67 open until its
  simulator demonstration and all other criteria have evidence.

## Self-review and handoff

- The plan implements #67 as one end-to-end slice; internal task ordering is not
  a replacement for the approved vertical issue breakdown.
- Native installation owns large-file integrity and storage; the learning engine
  retains reward authority. No generic importer or new service is introduced.
- The five Review Focus cases are covered by Tasks 1–3, including actual native
  boundary tests rather than source-text assertions.
- A native view and native package bridge are new application code. Their actual
  Expo signatures and Swift concurrency isolation must be checked against installed
  SDK sources before writing them; no generated iOS project edit is authoritative.
- Await implementation-plan review and execution-method selection required by
  the writing-plans workflow. Recommend native execution for this first tightly
  coupled slice, followed by independent branch review.
