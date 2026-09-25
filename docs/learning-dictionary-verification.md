# Learning dictionary — #79

## Scope

Single-tap system dictionary lookup in audio/video stages 1–10, for visible
original and translated words. Silent stages 11–16 are not enabled by this work.
No dictionary content is extracted or stored. This document contains no private
lesson text, account or device identifiers.

## Automated evidence

- `npm run check` and `npm run bundle:ios` pass, including all 512 core tests,
  package/build-setting checks and TypeScript validation.
- Mounted production player tests exercise stages 1–10, including grouped runs,
  saved checkpoints, explicit hint reveal, blocked footer/headphone actions,
  background callbacks and unchanged confirmations.
- Production text tests cover visible and hidden taps, stale revealed-word
  callbacks, per-word accessibility actions, paired dialogue, both layouts,
  separate built-in fonts, 12/48-point sizes and Dynamic Type scaling.
- Public player/dictionary tests cover save and presentation failures, recovery,
  one active sheet, stale scope rejection, cancellation during checkpointing,
  pending autoplay/preparation, extra cycles and explicit resume.
- Six native iOS Simulator tests use the real Apple tokenizer and dictionary
  controller. They cover punctuation and Unicode offsets, internal apostrophes
  and hyphens, Japanese/Thai segmentation, one sheet, dismissal during opening,
  system-child dismissal, missing terms, detached presenters and shutdown. They
  also verify the full-height drawer and drag handle, the fixed safe-area learning
  button, non-overlapping dictionary content, and one-shot button dismissal.
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

## Still unverified

- Offline lookup with a downloaded dictionary, separately from the observed
  installed-definition and missing-dictionary results.
- Interactive swipe dismissal on a physical iPhone, full VoiceOver operation/
  focus containment and maximum accessibility text size on that device.
- Physical audio/video interruption, grouped member position, wired-headphone
  commands and voice monitoring while the dictionary is open.
- A complete physical-device pass in both layouts and light/dark appearances.

These are acceptance gaps, not evidence of feature failure. Do not close #79 or
describe physical/offline acceptance as complete until they are observed.

## References

- [Apple system dictionary controller](https://developer.apple.com/documentation/uikit/uireferencelibraryviewcontroller)
- [Apple word tokenizer](https://developer.apple.com/documentation/naturallanguage/nltokenizer)
