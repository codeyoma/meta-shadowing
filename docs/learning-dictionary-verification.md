# Learning dictionary — #79

## Scope

Single-tap system dictionary lookup in audio/video stages 1–10, for visible
original and translated words. Silent stages 11–16 are not enabled by this work.
No dictionary content is extracted or stored. This document contains no private
lesson text, account or device identifiers.

## Automated evidence

- `npm run check` passes, including all 518 core tests,
  package/build-setting checks and TypeScript validation.
- The bundled-JavaScript Debug Simulator build passes. The original #79 pass
  also verified `npm run bundle:ios`.
- Mounted production player tests exercise stages 1–10, including grouped runs,
  saved checkpoints, explicit hint reveal, blocked footer/headphone actions,
  background callbacks and unchanged confirmations.
- Production text tests cover visible and hidden taps, stale revealed-word
  callbacks, per-word accessibility actions, paired dialogue, both layouts,
  separate built-in fonts, 12/48-point sizes and Dynamic Type scaling.
- Public player/dictionary tests cover save and presentation failures, recovery,
  one active sheet, stale scope rejection, cancellation during checkpointing,
  pending autoplay/preparation, extra cycles and explicit resume.
- Ten native iOS Simulator tests use the real Apple tokenizer and dictionary
  controller. They cover punctuation and Unicode offsets, internal apostrophes
  and hyphens, Japanese/Thai segmentation, one sheet, dismissal during opening,
  system-child dismissal, missing terms, detached presenters and shutdown. They
  also verify the full-height drawer and drag handle, the fixed safe-area learning
  button, non-overlapping dictionary content, one-shot button dismissal and
  reopening after accessibility escape closes the drawer. The installed Expo
  touch-gate source is also tested for non-competing gesture behavior and
  active-context-menu detection.
- The native fixture is included in `ci-native-tests`. It verifies UIKit
  presentation, not the availability or correctness of installed definitions.

## Simulator observations

On iOS 27, the rebuilt app opened Apple's dictionary for a tapped original word
and for a tapped Korean translation word. The system showed its normal missing
content screen because no dictionary was installed. Closing returned to the same
phrase and confirmation state without automatic playback or progression.
Interactive downward dismissal of the sheet also returned to that same paused
phrase without advancing its cycle.

Subsequent owner-provided Simulator screenshots show installed dictionary
results. This establishes native content rendering, not offline availability or
physical-device acceptance. No definition content is reproduced here.

The owner-requested presentation uses the existing learning drawer's full-height
form sheet and visible drag handle. Apple's own close control remains; the
duplicate instruction/close row was removed. The fixed bottom “학습 이어하기”
button dismisses the sheet to the paused lesson without replay or confirmation.
Korean dictionary availability is not an acceptance requirement; available
definitions remain controlled by the user's installed system dictionaries.

The app's Debug Simulator build completed. Build output also contains existing
dependency warnings; this work does not claim a warning-free dependency tree.

## Follow-up acceptance checks — 2026-09-25

The following observations use the existing iOS 27 Simulator build. They do not
establish physical-device acceptance. No definition content is reproduced here.

| Check | Result |
| --- | --- |
| Offline lookup | Installed definitions render, but connectivity was not disabled. Offline acceptance remains unverified. |
| Dismissal and progress | The fixed learning button returns to the same paused phrase and unconfirmed cycle, including from a definition detail page. Reopening the app retains the checkpoint and unchanged XP. A fresh mirrored swipe attempt did not dismiss the sheet, so this pass does not add swipe-dismissal evidence. |
| Background and media controls | Going Home while the dictionary is open, then returning through the app icon, closes the dictionary and leaves the same phrase/cycle paused. Physical media interruption, headphone commands and voice monitoring remain unverified. |
| Accessibility | Opening the dictionary with maximum Dynamic Type already selected renders the learning button correctly. Changing to maximum Dynamic Type while the drawer is open clips that button's label; see the defect below. Full VoiceOver operation remains unverified. |
| Layout and appearance | Original-word lookup and fixed-button dismissal work in bubble and list layouts. Light/dark dictionary rendering was inspected. A complete physical-device and scrolling pass remains unverified. |

The focused command below passed all 17 tests. These include mounted player tests
for stages 1–10, grouped runs, blocked controls and stale background callbacks;
they are not substitutes for real headphone or audio-output testing.

```sh
npx tsx --test src/core/dictionary-player.test.ts src/core/learning-dictionary.test.ts src/core/dictionary-text.test.ts
```

### Open defect: text-size change while the dictionary is visible

1. At normal system text size, open a word's dictionary.
2. While the drawer remains open, change Simulator content size to the maximum
   accessibility category.
3. The bottom learning action remains tappable, but its enlarged label is clipped.
4. Dismiss and reopen the dictionary at that same maximum size: the label fits.

This reproduces in light and dark appearance. It is a live text-size-change
layout defect, not a failure on every maximum-size presentation. No application
code was changed during this validation pass.

The Simulator's original light appearance, large content-size category and
bubble layout were restored. Physical testing was blocked because iPhone
Mirroring required the connected phone to be locked. Connectivity and VoiceOver
on the physical phone were not changed.

## Owner confirmation and drawer/theme follow-up — 2026-09-25

After testing the installed physical build, the owner reported that the remaining
items 1 (offline dictionary) and 3 (media interruption, grouped position,
headphone controls and voice monitoring) work. These are owner-reported physical
results, not additional automated or agent-observed hardware evidence.

An initial app-owned handle closed only after finger release. The owner reported
this as laggy, so that workaround has been removed. The dictionary now uses
UIKit's interactive form sheet and system grabber, the same presentation mechanism
as the learning menu. It retains the system close control, fixed learning action
and accessibility escape; no custom pan recognizer or release threshold remains.

The underlying conflict was Expo's window-level `SystemMenuTouchGate`, which
participated even without a popup menu. Disabling only that gate restored native
dictionary dragging with real content. A versioned dependency patch now makes
the gate a non-competing touch observer, retaining its existing event filtering
and popup-menu press-through protection. See [patch maintenance](../patches/README.md).

New native regressions failed before the fix and all ten passed afterward.
The bundled-JavaScript Simulator rebuild and all 517 core tests also passed.
In the rebuilt dark-mode Simulator, a short downward drag returned to the open
drawer; a full downward drag closed it, and another lookup opened successfully.
The fixed learning action also returned to the same paused phrase, first cycle
and pending confirmation. The duplicate instruction/close row remains absent.
The existing learning-options drawer also dismisses with the same downward
gesture. Native CI now installs the locked dependencies and applies patches
before generating the fixture, so it tests the same touch-gate source as the app.

A popup-menu cross-check found a separate existing behavior: tapping the size
stepper outside the font popup dismisses the popup and also changes that size.
It reproduces with the original superclass gesture arbitration restored, as well
as with the patch. The test size was restored. This change does not fix or claim
press-through protection for that popup presentation; it leaves Expo's existing
filtering logic intact.

The dark palette now uses black page/drawer backgrounds and neutral gray cards,
menus, borders, stage paths and stage-number badges. Yellow actions, the orange
current-stage edge and semantic accent colors remain. Light palette values and
the light stage gradient are unchanged. Mounted-component regressions cover
cards, secondary actions, settings, the selected-book summary, stage paths and
stage popovers. Simulator inspection covers the library, settings, player,
dictionary, learning options and font controls, and stage map. Apple's dictionary content remains
system-owned; the app does not inspect or recolor its private subviews.

The revised build is running in the right-hand Simulator preview in dark mode.
It has not been reinstalled on the physical phone in this follow-up.

## Still unverified

- The restored native swipe dismissal on a physical iPhone, full VoiceOver operation/
  focus containment and maximum accessibility text size on that device.
- A complete physical-device pass of the revised palette in both layouts.

These unchecked items remain acceptance gaps. In addition, the live text-size
defect above requires a fix and regression verification. Do not close #79 or
describe all physical/accessibility acceptance as complete until these are resolved.

## Circular learning-options buttons — 2026-09-25

The learning-options header now uses native `Stack.Toolbar.Button` icon items
instead of padded custom views. Simulator inspection confirms circular close
and submenu-back controls. Back returns to the options menu; close cancels
pending sentence selection and dismisses the drawer. Their accessibility labels
and existing no-haptic behavior are retained. A rendered-screen regression
checks those separate actions and the root menu's hidden back control.

The full check suite (518 core tests plus package/build checks and TypeScript),
all ten native dictionary tests, and the bundled-JavaScript Simulator build
pass. This does not mark the dictionary-header drag request complete or imply
physical-device verification of the new controls.

## Native presentation comparison — 2026-09-26

The dictionary and learning options already use UIKit form sheets with a large
detent and the system grabber. The dictionary retains Apple's own interface and
the app-owned fixed learning action; no private view inspection or recognizer
mutation is part of its implementation.

A minimal host using the production presenter reproduced the title-row drag
failure in an automated XCUITest: the sheet remained visible and the completion
callback had not fired. A public-API probe presenting the Apple controller as the
root of a `UINavigationController` added an empty navigation header but did not
fix title-row dragging in Simulator. Forwarding the child's public content
scroll view to the sheet also left the automated reproduction failing. Both
probes were removed; neither is a verified fix or proof of an OS limitation.

The retained UI regression launches the production presenter, taps the fixed
learning action, verifies dismissal completion, reopens, and dismisses again.
All 11 native tests pass, including that UI test and the existing presentation,
tokenization and touch-gate checks. This passing count does not include or claim
a fix for title-row dragging. The subsequent owner decision below resolves the
presentation choice, not the title-row gesture behavior.

## Approved native drawer behavior — 2026-09-26

The owner chose to retain Apple's interface without a duplicate header. The
supported dismissal paths are Apple's close control, the native sheet grabber,
the fixed learning action and accessibility escape. UIKit retains ownership of
gesture tracking, cancelled swipes and animations. No custom pan recognizer,
private view modification or additional navigation container is introduced.

The earlier title-row drag request is superseded, not implemented. On the tested
iOS 27 Simulator, that row still does not dismiss the sheet. This is no longer
an acceptance requirement under the approved design. It does not waive the
separate physical-device/accessibility checks or live text-size defect above.

The existing production UI already matches this choice, so this confirmation
updates the behavior contract and verification record without changing the UI
or learning state. The native suite retains its fixed-action dismissal/reopen
UI test and system-sheet, accessibility-escape and one-shot completion checks.

## PR review follow-up — 2026-09-26

The early user-dismissal path now retains its animation choice until presentation
finishes. Background or shutdown cancellation takes priority and stays
non-animated, regardless of request order. A child lifecycle observer in the
native tests reproduced the lost animation before the fix; it checks UIKit's
actual dismissal lifecycle rather than an internal state flag.

The touch-gate review was checked against the installed Expo 57.0.18 source.
Its menu filtering explicitly excludes touches through `ignore(_:for:)` in both
the event delegate and `touchesBegan`; the gate then fails recognition. It does
not depend on winning recognizer prevention. That path is unchanged, and the
existing popup-detection limitation above remains open.

The failed CI assertion was in the separate rounded video-endpoint test:
AVPlayer's stopped media clock differed by about 1.6 milliseconds, exceeding the
old 0.1-millisecond assertion. The 30-fps fixture now allows less than one frame
of forward clock deviation while still requiring exact selected-time completion,
one ended event, no pause/failure event, stopped playback, and a stable held
position. Video playback code and CI checks are not disabled or bypassed.

Fresh local verification passes: `npm run check` (518 core tests, 25 package/
build checks and TypeScript), all 42 audio/video tests on iOS 26.5, and all 12
dictionary tests on iOS 27. The latter includes the deferred-animation regression,
lifecycle-cancellation priority, and fixed-action dismissal/reopening UI test.

## Owner acceptance and closure — 2026-09-26

After the remaining native checklist was explained, the owner confirmed that it
works and explicitly requested closing #79. Record native/device acceptance as
owner-reported, not as additional agent-observed runs. This includes the reported
lookup, dismissal, state preservation and accessibility/typography checks.

PR #82 has merged into `dev`. The approved system-sheet design and the removal
of the duplicate setup header supersede earlier presentation requests. Apple's
dictionary management interface remains available. Historical observations
above are retained for traceability; this confirmation does not claim a new code
fix or an independently reproduced resolution of the live Dynamic Type finding.

## Menu-style header amendment — 2026-09-26

The owner explicitly approved an additional app-owned native header after the
Apple title-row drag limitation was reproduced again. The sheet now uses a
`UINavigationController` with the lookup term and a native close item, matching
the learning-options navigation mechanism. The unmodified Apple dictionary,
including its own title/close row, remains below it. The bottom learning action
remains outside the dictionary content and within the safe area. No definition
extraction, private-subview modification or custom pan/animation is introduced.

An automated UI regression covers a short cancelled drag, full downward drag
from the new header, completed dismissal, reopening and the new close item.
The original Apple header failed the preceding drag reproduction. The new
header passes with a screen-relative full drag; a shorter fixed-distance gesture
on the tall Simulator can cancel rather than dismiss, as controlled by UIKit.
All 13 native tests pass, including Apple's child dismissal, fixed learning
action, accessibility escape, deferred user animation and lifecycle cancellation.
`npm run check` and the app's Debug Simulator build also pass. These results do
not constitute new physical-device acceptance. Historical no-extra-header
decisions above are superseded by this explicit amendment.

The rebuilt Expo app was also checked with installed internal test material in
dark appearance. Dragging the new header dismissed the dictionary and returned
to the same source position and unconfirmed first cycle, with playback paused.
The original Apple title row remains separate and is not the new drag surface.

### Empty drag header refinement

The owner subsequently requested removal of the duplicate controls and approved
keeping the app-owned navigation bar empty. Apple's title and close control are
now the only word header; the empty bar above remains the native drag surface.
A one-point adaptive gray outline follows the sheet's upper edge and rounded
corners. It is a decorative layer, not a gesture handler or a modification of
Apple's dictionary content. The fixed learning action remains unchanged.
The UI test now checks that the drag bar has no title or buttons and exercises
drag cancellation, full dismissal, reopening and the fixed learning action.
All 13 native tests pass after this refinement, and the Debug Simulator app
build succeeds. In the rebuilt app, the single Apple header and gray upper
outline were visually confirmed in dark appearance. Both dragging the empty
header and tapping Apple's close control returned to the same paused lesson
position. These checks do not add physical-device acceptance for this refinement.

### Remove the empty header

The owner then requested removal of the remaining empty header. The app-owned
navigation bar is now hidden, so the dictionary starts at the content safe area
without navigation-bar spacing. Apple's title and close control, the gray upper
outline, system grabber and fixed learning action remain. The grabber is now the
supported drag surface; this supersedes the empty navigation-bar drag test above
and does not claim that Apple's own title row supports dragging.
All 13 native tests pass with the updated grabber gesture, including cancellation,
dismissal and reopening. The Debug Simulator app builds and runs successfully;
the rebuilt app visually confirms that the extra header space is gone while the
outline, Apple header and fixed learning action remain.

### Align the learning action with the menu footer

The dictionary footer now uses the same bottom spacing as the learning-options
menu: the larger of 16 points and the bottom safe-area inset, plus four points
for the button's lower shadow. It no longer adds 16 points on top of the safe
area. The constraint updates when safe-area insets change; dictionary content
still ends above the fixed button. The native layout assertion checks this
menu-equivalent positioning.

## References

- [Apple system dictionary controller](https://developer.apple.com/documentation/uikit/uireferencelibraryviewcontroller)
- [Apple word tokenizer](https://developer.apple.com/documentation/naturallanguage/nltokenizer)
