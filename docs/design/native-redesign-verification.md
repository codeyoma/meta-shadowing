# Native visual refresh verification

Scope: Library, Lesson/stages, Player and Settings. The owner approved a
code-first Simulator implementation using the existing DESIGN.md palette.
This is a visual refresh, not M1 acceptance or a new learning feature.

## Automated checks

- Unit tests: 22 passed, 0 failed, 0 skipped.
- Typecheck: passed.
- Expo dependency compatibility: passed.
- Expo Doctor: 21/21 checks passed.
- iOS JavaScript/assets export: passed. One bundled Nunito ExtraBold font
  (about 132 KB), one original illustration (about 1.2 MB), and the 12 controlled
  sample audio files. The Nunito barrel import was removed to avoid bundling
  unused font weights.
- Contrast regression tests retain a 4.5:1 minimum for the semantic text/surface
  pairs in both themes. Primary actions use navy text on Owl green; white text
  on that green did not pass.
- Illustration provenance: the shipping PNG contains the generation prompt,
  with a matching prompt sidecar. The provenance scan found no missing prompt.

## Simulator checks

Device: iPhone 17 Pro Max, iOS 26.5, 440 × 956 point viewport.
Normal text setting: Large. Accessibility text setting: Accessibility Extra Large.

- Installed the controlled sample through the Library, then opened a stage.
- Playback advanced to the manual speaking phase. Confirming one cycle showed
  1/3, then began the next listen. Pausing, leaving and reopening restored the
  same saved sentence and confirmed-cycle count.
- Changed mode and speed, closed and reopened Settings, and verified persisted
  choices. Restored manual mode and 1× speed afterward.
- Inspected all four screens in light and dark appearance. Captures with
  incomplete rendering immediately after an OS appearance change were rejected
  and retaken after the live view finished updating.
- Inspected larger text in all four screens, including scrolled Lesson,
  Settings and Player content. Explicit font-scale measurement keeps text and line
  height in sync; text is not capped. Compact speed choices become full rows.
- Inspected native accessibility labels and selected radio states. Completion
  markers use text/check symbols as well as color.
- No routine save-success or connectivity notifications were introduced.

Local device captures are kept under the ignored `.impeccable/review/` directory:
`phone-{library,lesson,player,settings}-{light,dark}.png`,
`phone-library-large.png`, `phone-lesson-large.png`,
`phone-lesson-large-scrolled.png`, `phone-settings-large.png`,
`phone-settings-large-scrolled.png`, `phone-player-large.png`, and
`phone-player-large-scrolled.png`.

## Limits and follow-up

- This pass did not run full VoiceOver traversal, physical-iPhone acceptance,
  a smaller-phone viewport, iPad, Android, or a fresh native compilation.
  The existing development client ran the current Metro bundle; the new direct
  font dependency was already included in that client's native pods.
- Changing the OS text size while Settings remained open sometimes retained
  the previous speed-choice arrangement. Text resized and wrapped without being
  clipped. Reopening Settings applied the correct compact or stacked arrangement;
  the selected value was preserved.
- Dependency audit reported 13 moderate, 0 high and 0 critical advisories in
  Expo tooling/router dependency chains. Suggested incompatible downgrades were
  not applied. A before-change audit was not recorded, so this pass does not
  establish when those advisories entered the dependency tree.
- No commit, push, deployment, hosted database change or issue closure was made
  as part of this visual refresh.

## Finish review

The independent review identified two presentation issues: fixed-height stage
numeral badges at accessibility sizes, and painted rectangular inserts inside
native header buttons. The badges now size to their contents and the extra
header paint is removed while retaining the labeled 44-point hit target.
The correction batch passed all 22 tests, typecheck and iOS export again.
The final reviewer disposition is `ship` for those two scored fixes, with no
fix-batch regressions identified. This is not a production-release or physical
device acceptance claim. The reviewer used the owner-pinned direction and native
craft references; no separate visual quality-bar image was supplied.

The review also exposed a screenshot-tool presentation discrepancy: some controls
appeared absent in tool-rendered images although reopening the original files
showed them. The final disputed Player capture was replaced with a settled,
fully scrolled capture, and the reviewer confirmed its contents and matching hash.

Native `DESIGN.md` and `.impeccable/design.json` now record the finished system.
Independent documentation validation confirmed 24 colors against the source
palette, eight component previews, resolved token references, valid YAML/JSON,
sidecar schema version 2, and the canonical section order. The legacy design
guide remains unchanged.
