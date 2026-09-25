# Built-in learning fonts (#76)

## Implementation

The shared learning-screen editor applies and saves independent original and
translation fonts immediately. Its fixed bilingual sample never reads lesson
content. Font reset selects System without changing sizes; size reset preserves
fonts. Both settings entry points use the existing profile-isolated, local-first
settings and backup path. Existing records without font fields remain unchanged.
New empty profiles start with System and sizes 20/18 without creating pending
backup work or prompting to import untouched defaults.

The iOS-only LearningFonts module queries three named regular faces and the
native system designs. Named faces must resolve to the protected system Fonts
directory and must not be downloadable. The simulator uses its runtime's system
directory. Font priority is deliberately not used: iOS can report process
priority for a preinstalled face. No font downloading, font registration,
user-font enumeration, new bundled font asset, or cloud setup is added.

React Native's installed Fabric font implementation maps `system-ui`, `ui-rounded`
and `ui-serif` to `UIFontDescriptor.SystemDesign`. Named choices use their
verified regular PostScript faces at regular weight. Missing glyphs use native
cascading; this does not promise distinct Korean shapes for Latin-focused fonts.
An unavailable choice uses System while retaining the preference for another
device. A native build without this module safely offers System only.

## Automated verification

- Public control and real-route tests cover independent immediate changes, both
  editor entry points, reset, reopening, fixed preview updates, unsupported
  choices, save failures, and last-accepted rapid selections.
- Settings/backup tests cover the curated identifiers, invalid imported values,
  legacy records, SQLite reopen, profile boundaries, and two-client offline
  synchronization through a fake Apple transport. This is not live iCloud evidence.
- Rendering tests cover both layouts, hint accessibility, silent stages 11–16,
  system fallback, unchanged selected sizes, existing appearance, one-time
  accessibility scaling, and unchanged reference-label typography.
- Mounted player regressions cover audio/grouped/reveal checkpoints without
  restarting the focus effect or changing phase, position, speed, cycles or XP.
- The separate iOS test fixture validates the actual built-in catalog and uses
  UIKit/Core Text to lay out mixed Latin/Korean text at 12, 20, 48 and 150 points,
  with no missing-glyph boxes. The native fixture is included in CI.

## Acceptance boundaries

Simulator testing is recorded separately from physical-device testing. Native
Core Text tests do not by themselves prove the app's entire scrolling/layout
matrix, VoiceOver operation, or physical-device behavior.

Physical-iPhone font availability, mixed-text readability, both layouts, large
Dynamic Type, audio/video and silent practice, and repeated menu changes remain
unverified until tested on the device. Live iCloud convergence requires the
separately approved container, signing and test accounts. No physical test,
cloud-account change, reset, public release or real-service pass is implied.
