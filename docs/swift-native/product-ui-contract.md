# Native product UI (W5 / #96)

## Implemented boundary

The normal Swift app now presents Books, Stages and Settings. Language selection
offers English, Japanese, Chinese, German, Spanish and French; empty languages
stay empty and have separate XP/streaks. Browsing selection and learning selection
remain distinct. Sixteen stage entries use the existing domain unlock policy.
Debug permits stage selection for development without writing completion records;
Release does not assume verified TestFlight access.

The bundled Morning Notes manifest and twelve unchanged original audio files are
validated before learning. The app does not load private/reference installations
or contact a hosted service. The catalog is injected, allowing generated video,
silent and long-text journeys through the same normal UI in isolated Debug tests.

One LearningFlow owns each mounted runtime. Entry uses the domain's stage-entry
behavior. Menu entry settles a durable pause before showing native sheet navigation.
Rate, grouping, reveal speed and sentence selection use the coordinator's restricted
paused-edit API; that API cannot resume, confirm or reopen the headset gate.
Global defaults and active-run settings keep separate persistence scopes.
Closing, dismissal and foregrounding never confirm learning.

The app retains the W4 bundled launch animation/haptics. No launch opt-out menu is
added. Core Haptics, live wired monitoring and native transports remain owned by
LearningMedia, not views. Closing a pending catalog load cancels its generation
without blocking dismissal; a late writer is revoked before publication.

## Text, navigation and observation

LearningUnitPresentation consumes the domain's hint and reveal policies. Matching
complete quoted utterances are paired; mismatches remain intact. Only the current
unit is rendered in the player. All Sentences is the explicit full-text reference
surface and selecting a source retains prior confirmations without earning XP.

Masked text retains layout but supplies an explicit accessibility representation
containing only permitted visible text. Transparent glyphs and a parent label
alone were insufficient in the iOS 27 accessibility tree; the regression test
checks the real tree rather than only a string projection.

Independent original/translation fonts and integer sizes are persisted through
the existing preferences boundary. Invalid numeric drafts never replace saved
values. Font reset leaves sizes unchanged; size reset writes 20/18. Fixed bilingual
previews contain no lesson text. Dynamic Type scales each chosen base size once.

Controls observe a semantic projection excluding writer-version/position churn.
Only the cycle timeline and silent-text subtree observe time samples. Browsing,
header and settings state have no runtime dependency. A native Observation test
verifies that a position-only update does not invalidate the controls.

The stage list has exactly sixteen rows and is deliberately eager. A lazy version
rendered the final stages without exposing them to accessibility on iOS 27;
the normal player UI regression covers reaching a late silent stage.

## Recovery and deferred capabilities

Bootstrap, preference, media and checkpoint errors have explicit recovery actions.
Failed confirmation stays uncredited until retry commits; recovery stays paused.
Returning to stages and opening the lesson again obtains the current durable
checkpoint if an obsolete writer cannot recover. No generic error path resets data.

Installed syntax, relation graphs and Apple dictionary remain #97. StoreKit,
hosted downloads, purchase restore, private CloudKit and scoped reset operations
remain #98. Their navigation entries report this boundary. Bundled content is
read-only; there is no destructive substitute for removing a hosted download.
These unfinished integrations are not claimed as passing acceptance.

## Verification record

Package verification on Xcode 27 / Swift 6 passed: LearningDomain 53,
LearningPersistence 27, AppFoundation 38 and LearningMedia 46 tests (164 total).
Targeted iOS 27 checks passed for normal bundled audio, grouped video, silent
reveal, sentence selection, failed-save retry/relaunch, language selection,
typography persistence, cancelled opening and narrow runtime observation.
The largest Dynamic Type hidden-text/control journey and the
sufficient-description/trait accessibility audit passed.

Full-scheme, Debug/Release product checks and independent review are recorded
after the final candidate is verified. This paragraph is not a full-suite pass.
Accessibility-tree tests are not a claim about VoiceOver's spoken output or
physical tactile/routing behavior. Unobserved manual checks stay explicit.

[Physical acceptance #103](https://github.com/codeyoma/meta-shadowing/issues/103)
remains separate: the owner confirmed launch haptics; the other wired microphone,
headset, interruption and learning-feedback checks are still pending. No phone
installation, account access, cloud operation, purchase, push or release was
performed for this implementation.
