# Sentence-analysis dictionary (#86)

## Approved interaction

The owner replaced the original inline-dictionary design with an explicit
dictionary button after native close behavior in the embedded prototype also
dismissed the analysis screen. The inline prototype is not shipped.

- Selecting a token highlights its relations and shows a `사전 보기` button
  immediately after the graph, before the explanations. This reflects the later
  reference UI refinement. Selection alone does not open the dictionary.
  Punctuation remains selectable in the graph but has no dictionary action;
  lookup eligibility uses the same native word tokenizer as the existing drawer.
- The button presents the existing Apple dictionary drawer above analysis.
  Apple's close control and the existing footer dismiss only that drawer;
  the analysis screen and selected token remain available. Neither action
  resumes learning, confirms a cycle, or changes rewards.
- Dictionary definitions are rendered by the existing native module, without
  extraction, caching, logging, private-subview inspection, or external services.
- Repeated taps cannot stack drawers. Leaving analysis, losing authorization,
  changing selection, or backgrounding invalidates the owned request. Returning
  does not restore a stale selection. Direct learning-screen dictionary behavior
  is unchanged.
- The sentence and graph use separate rounded cards. Light mode uses white cards
  on the existing menu gray background; dark mode uses the existing dark palette.
  The native graph-to-dictionary and dictionary-to-explanation gaps are 32 points.
- The source-sentence copy button stays vertically centered and shows a check
  for 1.5 seconds after a successful copy. Copying preserves token selection and
  never copies dictionary content.

## Verification

- `npm run check` passed, including 552 core tests and TypeScript validation.
- Native-host component tests cover on-demand presentation, duplicate taps,
  selection changes, stale completions, failure recovery, background/blur and
  authorization cancellation, source-text copying, and unchanged checkpoint/XP.
  These tests mock the native dictionary boundary; they are not UIKit evidence.
- An iOS 27 Simulator Debug build passed. The opt-in
  `InstalledAnalysisUITests` passed on the installed app with locally supplied
  content: system close, reopen, footer close, analysis visibility and retained
  selection. Public test source does not contain the private lesson text.
- Local package-wide graph checks passed. Simulator inspection confirmed the
  card layout, spacing, horizontal graph scrolling, and centered copy icon.
  Clipboard readback matched the full source sentence without changing selection.
- Physical-iPhone verification, a VoiceOver walkthrough, native large-text and
  missing-result/dictionary-management walkthroughs remain pending. Background
  and authorization cancellation are covered by automated component tests, not
  claimed as new end-to-end native acceptance.

To run the opt-in UI test, install the development app, open a sentence-analysis
list using locally supplied content, and set `ANALYSIS_INSTALLED_UI=1` in the
test runner environment. The test skips by default in content-free CI.
