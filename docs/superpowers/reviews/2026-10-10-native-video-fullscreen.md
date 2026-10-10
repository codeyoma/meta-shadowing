# Native video fullscreen implementation and verification

Date: 2026-10-10. Branch: `codex/native-video-fullscreen`. Base: `9f5751d`.

Related issues: [spec #129](https://github.com/codeyoma/meta-shadowing/issues/129), [fullscreen #130](https://github.com/codeyoma/meta-shadowing/issues/130), [captions #131](https://github.com/codeyoma/meta-shadowing/issues/131), and [tools #132](https://github.com/codeyoma/meta-shadowing/issues/132).

## Implemented scope

The existing stage-based native video lesson now has a button-only landscape presentation. One lesson-scoped orientation owner and one persistent video/text subtree reuse the existing transport, learning runtime, and checkpoint owner. Ordinary browsing, audio, and silent stages remain portrait. Video uses aspect fit; captions and learning controls remain accessible without auto-hiding controls.

Fullscreen captions use the source member selected by successful native preparation or seeking. They do not advance from an independent timer. A retained frame from a different plan, unit, or cycle cannot disclose the next caption. Portrait retains the entire unit. Existing hints, subtitle reveal, typography, and dictionary eligibility remain in the shared text presentation.

Direct landscape tools open through the existing pause/save and remote-command gate. Rate, fullscreen text sizes and eligible group sizes use compact popovers; general options, the method guide and analysis keep their sheets. Tool dismissal stays paused in landscape. Leaving, completion, and access invalidation release orientation ownership.

The later owner-approved changes below also add continuous playback for overlapping
grouped video ranges, independent persisted fullscreen text sizes, a horizontally
docked thumb control, shared quarter-step rate editors with a stable numeric slot,
and transparent floating XP receipts without reserved footer space. Single-phrase
source boundaries, explicit confirmation and durable credit remain unchanged.

## Initial feature verification (before the overlay refinement below)

- Baseline: 375 Swift package tests passed before the feature.
- After implementation and caption review fix: 377 package tests passed across all six packages, with no skipped tests accepted by the result validator.
- CI configuration: Debug and Release project generation passed from a clean source snapshot without local identity or signing configuration.
- Actual iOS 27 UI: the fullscreen journey verifies button-only rotation, final-member captions, visible controls, rate and analysis tools, paused return, portrait restoration, and zero additional XP. The latest focused run passed in 40.718 seconds.
- Actual native video: all six transport tests passed, including exact selected-segment boundaries, gap skipping, final frames, replay, cancellation, stale caption identity, and disposal.
- Durable flow: all nine LearningFlow tests passed, including unchanged paused checkpoint, remote-command gating, and zero credit for compact tools.
- Hint-state UI: the focused video journey passed, including explicit reveal across presentation changes, background return remaining paused, and no XP on exit. Existing audio hint cases remain unchanged.
- Complete native gate: all 184 compiled cases passed, with zero failures or skips: 107 native integrations, 40 UI cases in one selection, and 37 in the other. The validator matched the complete compiled inventory; the inspected master test products remained unchanged. This includes the final fullscreen, hint/background, and largest-text video journeys on the final implementation.
- Debug and Release product inspections, fictional downloader build, and runtime-inspection guard all passed. The deployment minimum remains iOS 26.0 and the device family remains iPhone-only. No account or real service was accessed by those checks.
- Complete native gate elapsed time: 1,413.01 seconds (23 minutes 33 seconds), including builds and validation. This is a local run duration, not a performance target or hosted-runner benchmark.
- The tested native source files were byte-compared with the working implementation after the full gate; they match. The two dedicated pre-push simulators were shut down by the lease supervisor; the separate W2 preview was not changed.

These are local results, not hosted CI or release acceptance. Raw diagnostics and generated media stay outside version control.

## Review and corrections

Independent review found one P2 issue: a missing matching frame fell back to member zero, so next-unit captions could precede the new video frame. The implementation now suppresses unmatched captions while retaining subtitle reveal state. A native regression covers absent identity, plan/unit/cycle mismatch, cancelled preparation, successful replacement, and disposal. Re-review found the issue resolved and no new concrete defect. A final read-only review also found no concrete defect in the corrected caption layout or its hint/background regression test.

The initial landscape options UI test used an application-wide swipe that did not scroll the actual options list. The test now scrolls the observed collection view; the same exit and durable-credit assertions pass without a product workaround or extra timeout.

An additional hint-stage journey exposed a partially clipped subtitle switch after the portrait-to-landscape resize. A default anchor and a mode-only scroll reset did not fix it: the mode changes before native rotation settles. The caption area now uses real stack layout and resets scrolling when the actual geometry changes as well as when presentation changes. The dedicated normal-player journey passes without weakening the toggle or visibility assertions. One already-failed intermediate run was interrupted after repeated XCTest animation-idle waits; that run is not counted as passing evidence.

The working-folder configuration script initially encountered transient generated build files while copying sources. The clean tracked-source snapshot passed the unchanged script; this was not treated as an application failure or hidden by changing CI checks.

## Acceptance boundaries

- Craig was not found in the permitted resources inspected during design. Generated public fixtures establish automated behavior, not Craig-specific acceptance.
- Physical-device orientation-lock, sound, and headset checks remain unverified; no physical installation was performed.
- Denied or stale system geometry callbacks have code-level ownership/revision protection but no injected denial test. Actual accepted orientation changes are covered on iOS 27 Simulator; iOS 26 runtime fallback has not been exercised on a device.
- No production video distribution, accounts, cloud services, reference-app behavior, persistence schema, or CI policy was changed.
- The initial implementation request excluded commit, push and PR creation. The
  owner subsequently authorized a feature PR after fresh tests pass. Merge and
  issue closure remain outside that authorization; issues stay open pending acceptance.

## Owner-approved fullscreen overlay refinement

The subsequent owner review replaced the separate fullscreen text/footer areas
with centered, white, shadowed captions on compact translucent backing and a
bottom thumb dock. The dock starts on the right, follows horizontal dragging and
snaps left or right. Cycle dots move with it. The owner declined a separate
play/pause button; existing learning actions, portrait layout, hint and dictionary
rules remain unchanged. Side placement lasts only for the mounted lesson. VoiceOver
positioning actions and reduced-motion snapping are included.

Verification for this refinement is separate from the initial 184-case full gate:

- All 377 host package tests passed without skips.
- Four iOS 27 UI journeys passed on the final product code. They cover an enabled
  button dragged both ways without confirmation, three/five-cycle actions and
  durable XP, button-only orientation, paused tools, hint continuity after
  fullscreen/background changes, and actual large-caption scrolling without
  moving the video or controls.
- All 26 selected native cases passed in the final native run, without failures
  or skips: six reward rendering cases, five player layout cases, nine flow cases
  and six video transport cases.
- Independent review found that the retained landscape reward frame could leave
  portrait bounds after completion and that white XP lacked contrast over bright
  video. Real hosted pixel tests first reproduced both failures. The receipt now
  clamps to current geometry and has a video-only glyph shadow, not a badge.
- The video pixel heuristic distinguishes strong glyph contrast from faint shadow
  fringes; existing non-video density checks are unchanged. A temporary neutral
  filled-badge mutation still failed the unchanged 0.65 density limit (0.7087).
  That mutation was removed, then all 26 native cases passed on restored source.
- Direct simulator inspection confirmed the actual overlay layout and left/right
  docking with the cycle count still zero. The browser mirror was refreshed with
  the verified product. The preview uses generated public test video.

The full native gate and Release/product checks were not rerun after this
presentation refinement. The earlier complete gate is historical evidence, not
an exact-source pass for the new overlay. Physical-device acceptance remains open.

## Direct toolbar and independent fullscreen typography amendment

The next owner-approved refinement replaces the fullscreen dialog with six
visible controls: learning options, method guide, playback rate, fullscreen font
size, sentence analysis, and exit fullscreen. Tool navigation still uses the same
pause/save gate. The primary thumb action stays anchored when Repeat appears;
Repeat and additional cycle dots expand inward on either dock side. Toolbar and
dock margins are four points inside the available safe layout.

Fullscreen original and translated caption sizes are stored separately from
ordinary sizes in the existing profile preferences and backup format. Font
families remain shared. Older preferences seed the new fields from the previous
video typography once; subsequent edits and resets do not couple the size pairs.
The landscape-only editor puts size controls before its long preview, leaving
the ordinary editor's ordering unchanged.

Independent read-only review found no remaining concrete defect in these changes.
No commit, push, remote service mutation, or physical-device installation was
performed. Full-gate and release evidence above predates this amendment.

Final focused verification for this amendment:

- All 386 host package cases passed across six packages, without failures or
  skips. New regressions cover independent decoding/reset, strict size limits,
  SQLite reopening, backup restoration, and profile isolation.
- All 28 selected iOS 27 native/UI cases passed, without failures or skips, in
  140.1 seconds. The three real UI journeys cover direct tools, paused return,
  independent size editing, fixed main-action geometry on both dock sides, and
  unchanged confirmation/XP. The remaining cases cover flow, rendering, and
  localization behavior.
- The rendering regression failed when fullscreen captions were temporarily
  made to use ordinary sizes. That mutation was removed before the passing run.
- Earlier UI runs exposed offscreen lazy editor fields. The fullscreen editor
  now places controls before its long preview; the UI test scrolls to offscreen
  portrait fields before reading them. No assertion or timeout was weakened.
- A subsequent Debug build passed with the owner's local video package included
  for the dedicated simulator preview. Private source media remains outside
  version control. This is not production distribution or physical acceptance.

## Compact quick-setting popovers

The owner approved icon-anchored popovers for playback rate and fullscreen text
sizes, plus a group-size popover visible only in video stages 7–10. The group
control edits the active run, never future-run defaults. Full options, guide and
analysis remain sheets. The shared preference save boundary serves both layouts;
popover errors retain an accessible retry action.

- The missing popup and grouping control first failed real UI regressions. After
  implementation, the focused UI/flow selection passed all 14 tests without
  failures or skips. It covers independent typography, saved regrouping, failure
  rollback/retry, outside-tap dismissal, unchanged defaults and XP, and stage
  boundary checks at 1, 6, 7 and 10.
- Review identified a pending-presentation race when fullscreen exits while the
  initial pause/save awaits. A deterministic SQLite pause gate reproduced the
  invisible-menu failure. Presentation revisions and toolbar-lifetime cleanup
  now reject the late result; the regression passes, including subsequent menu
  access and explicit resume. Read-only re-review found no remaining actionable
  issue in the cancellation paths.
- All 386 host package tests passed across six packages without failures or skips.
  This focused verification does not replace the complete native pre-push gate
  or physical-device acceptance.
- Final source passed 25 selected iOS 27 tests in 173.6 seconds, without failures
  or skips: four UI journeys, 11 flow tests, six rendering tests and four
  localization tests. An earlier separate selection also passed both existing
  ordinary-editor retry and active-run-summary journeys.
- Largest-text inspection found compressed numeric fields in the compact editor;
  accessibility sizes now stack the label over its value and stepper. Toolbar
  symbols remain within 44-point targets, while text continues to scale. Native
  swiping worked; XCTest's nested-popover visible-frame and oversized-caption
  hit-point queries did not. The test uses observed on-screen geometry and still
  requires real saved 21/19 values, reachable group/rate controls, paused return,
  and unchanged cycle credit. These assertions pass in the final selection.

## Normal-screen quick settings and level labels

The owner approved the same compact speed and group-size popovers in normal
learning. The header order is level, speed, optional group size, then analysis.
Group size is available only in stages 7–10 for audio and video. Both layouts use
`Lv N` for the method guide; silent reveal-speed editing keeps its existing sheet.
Both headers cancel pending presentations when their anchors disappear.

- Three focused regressions failed before implementation: the missing normal
  group control, speed popover, and four-control layout. The first implementation
  selection then passed 20 tests with no failures or skips.
- Final iOS 27 verification passed 27 selected tests in 146.7 seconds, with zero
  failures or skips: four UI journeys, 12 flow tests, seven rendering tests and
  four localization tests. Coverage includes shared portrait/fullscreen values,
  audio rate save failure and retry, unchanged global defaults, silent-stage
  routing, group-stage boundaries, largest-text popup controls, and nonoverlapping
  normal headers at standard and accessibility text sizes.
- All 386 host package tests passed across six packages. Read-only review found
  no additional actionable issue in this extension. These focused checks do not
  replace the complete native gate or physical-device acceptance.

## Quarter-step rate indicators and floating XP toasts

The owner approved lower slider indicators everywhere playback rate is edited,
and removing the permanent feedback slot above the cycle strip. One shared
`RateEditorView` now uses a 0.25–3× stepped slider, twelve lower tick marks and a
live value underneath. General settings, lesson options and both popup layouts
keep their original save scopes and rollback/retry paths.

Normal cycle controls retain only 4 points above them instead of 36, giving the
lesson 32 more points. XP text has a transparent background and floats at a random
content position chosen once per committed reward. Bounds avoid the top tools
and bottom controls and adapt when the viewport rotates. Existing half-second
fade, announcements, noninteractive overlay and explicit-credit rules remain.

- Eight pre-change rendering regressions failed for missing indicators, the
  reserved footer gap and the old action-anchored reward position. All 15 selected
  rendering tests passed after the first implementation.
- Focused review found that random placement could put black text over dark
  inline video. All video lessons now use the existing white glyphs and dark
  shadow, not only fullscreen. Re-review found no outstanding scoped issue.
- A new UI test incorrectly expected an exact 1.25× result from a 36% XCTest
  slider drag. The failure attachment showed a valid 1.5× result. Apple's
  [slider automation API](https://developer.apple.com/documentation/xcuiautomation/xcuielement/adjust%28tonormalizedsliderposition%3A%29)
  explicitly promises only best-effort positioning. The test now requires a real
  intermediate quarter-step value, exact saved reopening, endpoint editing and
  unchanged global defaults. Literal snapping boundary cases have separate coverage.
- No system accessibility settings were changed. Reduce Motion's existing runtime
  branch is retained; this increment does not claim a system-enabled Reduce Motion
  session or physical-device acceptance.
- Final verification passed 20 selected iOS 27 tests in 94.2 seconds with zero
  failures or skips: two UI journeys, ten layout/rate tests and eight reward tests.
  The corrected intermediate-rate persistence test passes. The earlier expanded
  selection also passed the audio reward sequence, long-video layout, failed-rate
  save/retry and largest-text fullscreen popup journeys. All 386 host package
  tests passed. The full native pre-push gate was not run for this bounded UI change.

### Owner correction: current rate on the right

The owner subsequently requested the current rate beside the slider instead of
below it. The shared control now uses a two-column layout: slider and value on the
first row, quarter-step ticks under the slider only. The value column sizes to its
content while the slider fills the remaining width. This also prevents the popup
from collapsing the slider to its intrinsic width. Compact popup height follows
the shorter layout; rate bounds, saving, retry and preference scopes are unchanged.
The regression caught a collapsed slider under an initial grid implementation;
a full-width horizontal control row now preserves usable track width. Exact
vertical alignment is checked with rendered view geometry because accessibility
bounds also include the lower decorative ticks. Final selected iOS 27 verification
passed 12 tests in 94.3 seconds with no failures or skips, including largest-text
fullscreen controls and intermediate/maximum rate saving and reopening.

### Owner correction: stable numeric slot

The owner observed that the right-hand value still changed the track width when
its formatted length changed. A minimum width was insufficient. The shared
control now reserves the current-font width of four numeric characters plus the
multiplier and overlays the actual value, right-aligned. The sizing sample is
hidden; accessibility exposes only the current rate. Dynamic Type changes the
reserved width, but changing rate does not.

A pre-fix rendered regression reproduced shifting labels, tracks and tick marks.
Final selected verification passed 13 iOS 27 tests in 101.1 seconds with zero
failures or skips. It checks seven rates across normal/compact editors and both
standard/accessibility text sizes, plus live editing, durable reopening and the
largest-text fullscreen popup journey. No storage behavior or rate bounds changed.

## PR preparation review

Two independent read-only reviews inspected the complete staged feature against
`9f5751d`, split between media/domain/persistence and UI/lifecycle. Neither found
an actionable defect. Fresh host verification passed all 386 package cases;
clean-source Debug/Release configuration generation, actionlint and the relevant
shell checks also passed. The complete native pre-push gate must still validate
the exact pushed commit; its final result belongs in the PR verification summary.

Nonblocking coverage gaps remain: injected orientation denial/stale callbacks,
fullscreen numeric keyboard dismissal, caption scrolling across member changes,
mixed connected-range/gap playback, and coordinator-level overlap frame restore.
Static review is not runtime evidence for those combinations. Physical-device,
real-service and release acceptance remain outside this PR. Private source media,
local configuration, generated products and the unrelated tools directory are
excluded from the commit.
