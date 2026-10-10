# Native stage-based video learning

## Problem Statement

Learners need to watch source video while following the same stage-based practice they already use for audio. The existing native video surface does not offer a landscape learning presentation. Learners should not have to choose between seeing the speaker clearly and retaining captions, cycle feedback, and explicit learning actions.

## Solution

Extend the existing installed-video lesson, not a separate video-watching mode. Portrait keeps the video fixed above the current learning unit. An explicit fullscreen button enters landscape with aspect-fit video, the active source member's original and translated captions, and always-visible learning controls. An explicit exit button returns to portrait. Physical rotation alone changes neither mode. A compact landscape menu opens the existing speed, sentence-analysis, and learning-options flows.

## User Stories

1. As a learner, I want to select a video book and stage through the normal library flow, so that video practice uses my existing learning history.
2. As a learner, I want the video fixed above the portrait text, so that scrolling a long unit does not move the speaker away.
3. As a learner, I want the portrait view to retain the whole learning unit, so that grouped practice remains understandable.
4. As a learner, I want a fullscreen button to enter landscape, so that I can deliberately enlarge the video.
5. As a learner, I want an exit-fullscreen button to return to portrait, so that the return is predictable.
6. As a learner, I want physical device rotation alone to leave the presentation unchanged, so that moving the phone does not interrupt my preferred mode.
7. As a learner, I want the original video aspect ratio preserved, so that faces, mouths, and embedded text are not cropped.
8. As a learner, I want the learning actions and cycle indicator always visible in landscape, so that I never need to reveal hidden controls.
9. As a learner, I want landscape captions above the controls, so that controls do not obscure the learning text.
10. As a learner, I want landscape captions to follow the actual active source member, so that grouped playback does not show unrelated text.
11. As a learner, I want both original and translated captions, so that I can compare pronunciation and meaning.
12. As a learner, I want hint-only stages and explicit subtitle reveal to keep their existing rules, so that fullscreen does not disclose hidden answers.
13. As a learner, I want long captions and accessibility text sizes to remain readable and scrollable, so that the feature does not require small text.
14. As a learner, I want entering and leaving fullscreen to retain my unit, cycle, rate, playback position, and phase, so that presentation changes do not restart practice.
15. As a learner, I want fullscreen changes to award no XP or completion, so that only my explicit confirmations count.
16. As a learner, I want the existing repeat and next rules in landscape, so that I cannot bypass unfinished playback.
17. As a learner, I want grouped video to skip excluded source gaps with synchronized captions, so that I practice only the selected members.
18. As a learner, I want the last member's frame and captions held after playback ends, so that I can finish speaking before confirming.
19. As a learner, I want a compact landscape menu for speed, analysis, and learning settings, so that those tools do not require leaving fullscreen.
20. As a learner, I want tools to pause and save before opening, so that reference interactions preserve my checkpoint.
21. As a learner, I want dismissing tools to leave the same lesson paused and in landscape, so that dismissal never resumes or confirms accidentally.
22. As a learner, I want app interruptions and access loss to retain existing recovery rules, so that fullscreen does not weaken safety or persistence.
23. As a learner, I want leaving the lesson to restore normal portrait browsing, so that fullscreen affects only this lesson.
24. As a learner, I want silent stages 11–16 to remain text-only, so that a video book does not introduce media into silent practice.
25. As a learner, I want existing audio lessons unaffected, so that this addition does not change familiar audio behavior.
26. As a learner using assistive technology, I want named controls, adequate hit targets, and hidden-text privacy, so that fullscreen remains usable without exposing concealed words.

## Implementation Decisions

- Extend the native learning presentation and its existing LearningFlow. Retain one runtime, one native video transport, and one durable checkpoint owner across presentation changes.
- Keep stage rules, grouping, selected-segment timing, explicit confirmation, XP receipts, access guards, and persistence formats unchanged. No schema migration is planned.
- Use a lesson-scoped presentation state for portrait versus landscape fullscreen. Request supported orientation through public iOS APIs; do not manipulate device orientation through private APIs or sensor-driven mode changes.
- Scope landscape support to the active video lesson, including its temporary tools. Other screens and audio/silent lessons remain portrait. Release orientation ownership on lesson exit, completion, or invalidation. Surface an actionable orientation failure without resetting learning.
- Render native video with aspect fit. Preserve the transport across SwiftUI layout changes instead of preparing a second player.
- Drive landscape captions from the active member of the bounded video timeline, not wall time. Preserve member identity at exact boundaries, gap skips, pause, repeat, seeking for checkpoint restoration, and rate changes. Hold the final member after completion.
- Reuse the existing paired-text typography, first-word hints, subtitle reveal, dictionary eligibility, learning controls, and menus. Portrait continues to show the saved whole unit. Landscape uses an accessible bounded caption area above persistent controls.
- Preserve pause/checkpoint and no-auto-resume semantics for tools. Opening reference tools does not reveal hidden practice text except through the existing explicitly permitted analysis screen.
- Keep the iPhone-first scope, iOS 26.0 deployment minimum, Swift 6 concurrency discipline, and iOS 27 Simulator verification.
- Implement three complete vertical slices: fullscreen learning; active-member captions blocked by fullscreen; landscape tools blocked by fullscreen. Each slice includes its behavioral tests.

## Testing Decisions

- The owner approved the existing normal learning flow and durable checkpoint boundary as the primary seam. Test public actions and learner-visible results, not private method structure.
- Extend existing video UI journeys to verify actual landscape geometry, fixed controls, button-only transitions, menu return, and unchanged learning credit. Do not replace native orientation evidence with a mocked Boolean.
- Reuse media integration coverage for selected segments, gap skips, final frames, pause, resume, and interruptions. Add deterministic caption boundary assertions at the existing observable media/presentation boundary where UI timing would be brittle.
- Exercise single and grouped units, hint stages, long text, large accessibility sizes, menu dismissal, backgrounding, and portrait restoration. Run the host package suites and relevant native/UI checks; retain the full local pre-push native gate and lightweight hosted CI policy.
- Use generated public video fixtures for repeatable automated verification. Check Craig only if it is available in the permitted learning resources. Its absence must be reported, never replaced with a claim that Craig was tested.
- Report simulator verification separately from physical-device orientation-lock, sound, and headset acceptance. Do not install on a physical device without explicit authorization.

## Out of Scope

- Streaming, new public video delivery, import/upload flows, purchases, account changes, cloud mutations, and backend analysis.
- Free watching, arbitrary scrubbing, Picture in Picture, auto-hiding controls, or cropping video to fill.
- Sensor-driven fullscreen entry or exit, changes to stage completion or XP, and video in silent stages.
- Android, iPad-specific design, physical-app replacement, release, merge, or issue closure.

## Further Notes

### Owner-approved presentation amendments (2026-10-10)

The following requirements supersede the initial compact-menu and shared-size
presentation above. Learning, orientation, and explicit confirmation rules stay
unchanged.

- Overlay captions and controls on the video. Keep the main learning action in a
  compact bottom thumb dock, draggable horizontally between the two safe edges.
- Show six direct top controls in this order: learning options, method guide,
  playback rate, fullscreen font size, sentence analysis, and exit fullscreen.
- Speed and fullscreen font size open small icon-anchored popovers. In grouped
  video stages 7–10 only, add a group-size button between font size and analysis;
  its 2/3/4 choices affect the active run, not future-run defaults. Outside taps
  dismiss popovers without resuming. Other tools retain their sheets. A pending
  popover must not survive removal of its fullscreen anchor.
- Keep the main action's position and size unchanged when Repeat appears. Repeat
  and additional cycle dots expand toward the center from either dock side.
  Use a four-point margin within the safe layout.
- Save original and translated fullscreen caption sizes independently from
  ordinary-screen sizes. Font families stay shared. Editing or resetting either
  size pair must preserve the other pair, including across relaunch and backup
  restoration. Older saved preferences initialize the fullscreen pair once from
  the prior video presentation; later changes are independent.
- Extend the existing profile preference payload and backup whitelist without a
  storage schema migration. Existing strict validation remains in place.
- Verify these changes through focused persistence, native rendering, and real
  UI tests. The long complete native gate remains a separate acceptance step.

The owner approved the testing boundary and three-ticket dependency graph before publication. The existing native offline video capability is reused; this specification does not claim new production video distribution. Craig was not found in the scoped repository and dedicated simulator installed resources inspected during design. Automated fixture results do not establish Craig-specific acceptance. This issue records the product contract; implementation and verification evidence must be tracked separately.
