# Native Video Fullscreen Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement the owner-approved slices in this session. Do not commit, push, merge, or close issues without a separate request.

**Goal:** Extend the existing video lesson with deliberate landscape presentation, active-member captions, and the existing learning tools.

**Architecture:** Keep LearningFlow, its runtime, transport and checkpoint ownership unchanged. A scene-scoped orientation owner drives button-only presentation. The native video transport exposes the active source-member identity; the existing text presentation renders that member without inventing a second playback clock.

**Tech Stack:** Swift 6, SwiftUI, UIKit public scene geometry, AVFoundation, Swift Testing, XCTest UI automation.

**Spec:** [Approved design](../specs/2026-10-10-native-video-fullscreen-design.md), published as https://github.com/codeyoma/meta-shadowing/issues/129.

## Global Constraints

- iPhone only; iOS 26.0 minimum, iOS 27 Simulator verification.
- Only buttons change fullscreen mode. Preserve video aspect ratio, fixed controls, stage rules, hints, manual confirmation and durable credit.
- No public delivery change, live accounts, private media publication, physical install, schema migration, or Expo modification.
- Work in the current folder on a new feature branch, as requested. Leave the unrelated tools directory unchanged.
- The approved three-ticket breakdown is the execution sequence. Keep implementation evidence distinct from the product spec.

## Review Focus

- Orientation ownership must not outlive the lesson or affect another scene.
- A denied or stale rotation request must not leave a mismatched layout or reset playback.
- A pending member seek must not display captions for a frame that has not arrived.
- Hidden original words must stay hidden to accessibility and dictionary lookup after fullscreen changes.
- Large text, paused menus and leaving while landscape must preserve reachable controls and the saved checkpoint.

### Task 1: Button-only fullscreen learning — #130

**Files:** Add App/Player/LessonOrientation.swift and App/Player/VideoLearningView.swift under native-ios. Update LearningPlayerView.swift, MetaShadowingApp.swift, project.yml and existing PlayerUITests.swift.

**Interfaces:** LessonOrientation owns isFullscreen, rotation failure and the connected UIWindowScene. VideoLearningView consumes the existing LearningFlow and NativeLearningRuntime; it does not create either. It exposes existing LearningControlsView actions unchanged.

- [x] Add a normal-player UI journey that enters landscape with a button, keeps fullscreen when physically rotated, returns with a button and verifies unchanged cycles and XP.
- [x] Run that journey before implementation; expect failure because the fullscreen action is absent.
- [x] Add scene-scoped orientation and one persistent video-learning subtree with aspect-fit rendering and fixed controls. Restore portrait on exit, completion and access invalidation.
- [x] Run the journey and existing fixed-video/large-text tests; require actual landscape geometry and no credit on switching.

### Task 2: Active-member captions — #131, blocked by Task 1

**Files:** Update VideoSegmentTransport.swift, LearningUnitPresentation.swift, LearningContentView.swift, VideoLearningView.swift and their existing native/package/UI tests.

**Interfaces:** VideoSegmentTransport exposes observable active-member state, updated only after a successful native seek or preparation. LearningUnitPresentation.make accepts an optional member filter without changing the supplied session.

- [x] Add presentation tests for paired member text, hints, invalid member rejection and unchanged session. Add assertions to native gap/boundary/pause/replay tests for active member identity.
- [x] Run the new tests and observe the missing behavior before implementation.
- [x] Render only the active source member in landscape; retain the whole unit in portrait and the same unit-scoped reveal state across presentation changes.
- [x] Run host presentation tests, native selected-segment tests and the grouped-video UI journey, including large captions and final-frame retention.

### Task 3: Landscape tools and safe return — #132, blocked by Task 1

**Files:** Extend VideoLearningView.swift and existing PlayerUITests.swift/LearningFlowTests.swift as needed; reuse LearningOptionsView and reference presenters.

**Interfaces:** The compact menu calls existing LearningFlow.presentOptions(_:) for rate, analysis and menu. All pausing, saving, reference authorization and exit behavior remains with LearningFlow.

- [x] Extend the fullscreen UI journey to open speed/analysis/settings, dismiss paused in landscape and exit to portrait with no extra credit.
- [x] Observe failure before adding the compact menu.
- [x] Add the menu, using existing option routes and recovery behavior. Keep fullscreen ownership through temporary tools.
- [x] Run relevant UI/media/lifecycle tests, all host package suites, configuration/product checks and complete local native regression. Review the full diff independently before reporting verified scope.

## Execution Record

- 2026-10-10: Owner approved the test boundary, three slices and current-folder feature branch. Spec #129 and implementation issues #130–#132 published with ready-for-agent. Native blockers: #131 and #132 are blocked by #130. Parent issue remains open and unchanged after publication.
- Baseline: 375 host Swift package tests passed. Craig was not found in scoped installed resources; automated verification uses generated public fixtures.
- Ruling: No commits or pushes are part of this request; preserve the working changes for review. The approved ticket plan is executed directly without another product interview.
- Initial fullscreen verification, before the later overlay refinement: 377 host package tests and all 184 compiled native cases passed, with zero failures or skips. The complete native gate took 1,413.01 seconds and included Debug/Release product inspection, fictional downloader build, runtime inspection guard, 107 integrations and 77 UI cases across two dedicated simulators. The tested native source files matched the implementation at that point. See the [implementation and verification record](../reviews/2026-10-10-native-video-fullscreen.md) for corrections and remaining acceptance boundaries.
- Subsequent owner-approved overlay refinement: centered video captions and a compact bottom dock movable only left/right; no additional play/pause control. Four focused UI cases, 26 native cases and 377 host package tests passed. The initial complete gate predates this refinement and was not rerun; the verification record distinguishes these scopes.
- PR preparation: the owner authorized committing and pushing the accumulated
  amendments and opening a feature PR into `dev` after fresh verification. Run the
  complete local native gate against the exact pushed commit, retain lightweight
  hosted CI, and leave merge and issue closure for separate acceptance. The PR
  records final gate results; earlier counts above remain historical evidence.
