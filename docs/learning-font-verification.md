# Built-in learning fonts (#76)

## Implementation

The separate “폰트 설정” menu in Settings and in-practice options applies and
saves independent original and translation fonts immediately. The two selectors
show their current fonts side by side and open native popup lists. This editor
also contains text sizes, the fixed bilingual preview, and both reset actions;
the “학습 화면” editor only changes bubble/list layout. The sample never reads lesson
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
  First-word stages also exercise a real player blur/refocus boundary: a revealed
  answer survives font editing for the same run and phrase, but not a new phrase.
- The separate iOS test fixture validates the actual built-in catalog and uses
  UIKit/Core Text to lay out mixed Latin/Korean text at 12, 20, 48 and 150 points,
  with no missing-glyph boxes. The native fixture is included in CI.

## Observed results (2026-09-25)

- `npm run check`: 520 tests passed, zero failures; type checking passed. This
  includes 495 core tests and 25 build/package checks after review fixes.
- `npm run bundle:ios`: passed. The final Debug Simulator app also built and
  launched with embedded JavaScript. One existing private-video preparation
  script warning remained; no new font-module compiler warnings appeared.
- Native font fixture on iPhone 18 Pro Simulator, iOS 27.0: two tests passed,
  zero failures. Mixed-script layout ran at all four parameterized sizes.
- Actual app: all six choices appeared; original Georgia and translation Apple
  SD Gothic Neo updated the fixed preview independently at 20/18. Relaunch
  retained them and stage 1 bubble text used them while navigation/counters
  retained their existing typeface. Both editor routes were opened.
- After the menu refinement, both Settings and in-practice options opened the
  separate font editor with existing values. The learning-display editor showed
  only bubble/list controls. All 520 checks and the Debug Simulator build passed.
- Actual app: font reset switched the preview to System while keeping 21/18;
  size reset restored 20/18. Light appearance and the original system content
  size were restored after dark/max-accessibility-size checks. Those checks
  preceded the popup-menu refinement; the current selectors open native lists.
- Review: separate Standards and Spec reviews completed. The naming/shared
  font-style cleanup and same-phrase reveal retention finding were fixed and
  rechecked. These results are local, not a remote CI or physical-device pass.

## Acceptance boundaries

### Follow-up interactive verification (2026-09-25)

The latest local Debug build was installed over the existing app on an iPhone
16 Pro Max running iOS 27.0. App data was not removed. Physical interaction used
iPhone Mirroring. The simulator was an iPhone 18 Pro running iOS 27.0.

1. **Font catalog and mixed scripts:** all six choices appeared on the physical
   device. Georgia original text and Apple SD Gothic Neo translation text
   applied independently, with readable English/Korean and an untruncated,
   wrapping long selector label. The simulator additionally exercised Rounded,
   Serif, Avenir Next and System selections. The native fixture was rerun: two
   tests passed with no failures or skips, including all six faces and mixed
   scripts at 12, 20, 48 and 150 points.
2. **Sizes and layout:** the simulator displayed 12/12 text in both bubble and
   list lessons and disabled the decrement controls at the lower bound. The
   physical device displayed 48/48 in both layouts without overlapping the
   navigation or cycle controls in the observed phrase. Native font popups were
   exercised in dark appearance at the simulator's largest accessibility size;
   the last menu choice remained reachable by scrolling. This is representative
   coverage, not every font/size/layout combination. The entire 48-point preview
   at maximum Dynamic Type and physical-device Dynamic Type remain unverified.
3. **Learning state:** the physical audio lesson retained its phrase and two
   completed cycles through typography and layout changes. Simulator stage 5
   kept an explicitly revealed answer after font editing; silent stage 11 kept
   its displayed text after reset changes. A grouped video stage retained its
   group, completed cycles and revealed text after selecting Serif. The video
   remained fixed while the complete bilingual text could be scrolled beneath
   it. No completion action was pressed; displayed XP was unchanged on both
   devices. Physical video/silent coverage and audible output quality were not
   independently verified in this run.
4. **Persistence and reset isolation:** physical force relaunch retained Georgia
   and Apple SD Gothic Neo. Both Settings and the in-lesson menu showed those
   saved choices. Font reset preserved 21/18 sizes; size reset restored 20/18.
   The simulator also verified font reset preserving 12/12 and size reset
   preserving a non-System font. Existing backup/profile tests were rerun as
   part of the 520 passing checks; no live iCloud claim is made.
5. **Current native menus and lifecycle:** current selectors, long names,
   checkmarks and accessibility labels were inspected. A physical lifecycle
   failure was found, described below. VoiceOver spoken output was not tested.

The full automated check was rerun: 520 tests passed, zero failures, and type
checking passed. The physical Debug build succeeded. These automated passes do
not override the failed interactive lifecycle case.

### Earlier finding: in-lesson preferences stopped applying after background return

Reproduced on the physical iPhone with the latest local build:

1. Open an audio lesson, then Learning Options > Font Settings.
2. Send the app to the Home Screen while leaving that editor open.
3. Bring the existing app back without terminating it.
4. Press the original-size increment button. The displayed size remains 20
   instead of becoming 21. In an earlier occurrence, edited numeric values
   reverted to their saved values when editing ended.

Closing and reopening the in-lesson editor restored editing; the stepper and
numeric entry then applied normally. The first occurrence followed a Mirroring
disconnect, but the failure was subsequently reproduced by a deliberate
Home/return cycle. Native menu navigation still responded. This run establishes
the user-visible failure, not its root cause. Inspect access/profile validity
refresh and the editor's rejected-save handling before changing those guards.
No lifecycle-specific code fix or new regression test was added in this run.

### Owner acceptance and PR verification (2026-09-25)

After the remaining physical VoiceOver and maximum Dynamic Type checks were
explained, the owner reported that the feature also worked on the physical phone
and requested issue cleanup and a PR. This is owner-reported device acceptance,
not an independently observed VoiceOver or exhaustive layout result.

The owner was separately asked to leave the in-lesson font editor open, go to
the Home Screen, return, and change the font size. They explicitly confirmed
that this case worked too. The earlier lifecycle observation was not reproduced
in that owner retest and is retained above for traceability, not presented as a
code fix. Reopen investigation if it recurs.

Before publishing the PR, `npm run check` was rerun with 520 tests passing, zero
failures, and successful type checking. `npm run bundle:ios` also passed again.
The implementation and recorded verification are ready for PR review based on
the automated evidence and the owner's physical-device acceptance.

### Cleanup and remaining limits

Both devices were restored to displayed System/System, 20/18, and bubble view.
The simulator's original light appearance and `large` system content size were
restored. The physical system appearance and text-size settings were not changed.
The interactive test run performed no purchase, account change, cloud reset,
GitHub update, commit or release. Testing may create resumable, uncompleted
sessions but did not confirm cycles or award XP.

The independent visual/accessibility coverage limits above remain explicit;
owner acceptance does not make native Core Text tests proof of VoiceOver
operation or every scrolling combination. Live iCloud convergence remains a
separate, approved service-acceptance task.
