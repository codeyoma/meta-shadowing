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

## References

- [Apple system dictionary controller](https://developer.apple.com/documentation/uikit/uireferencelibraryviewcontroller)
- [Apple word tokenizer](https://developer.apple.com/documentation/naturallanguage/nltokenizer)
