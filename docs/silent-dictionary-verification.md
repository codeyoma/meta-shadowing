# Silent-stage dictionary verification (#80)

Baseline: `28d4a3c`, the latest #79 follow-up supplied for this work. This does
not imply that the upstream pull request has merged.

## Automated verification — 2026-09-26

`npm run check` passes: 534 core tests, 25 package/build checks, and TypeScript.
The initial completed-stage integration tests failed before enabling lookup.
The final tests execute the real player screen, lifecycle hooks, player, silent
clock and local progress store; native host APIs and time are test boundaries.

- Stages 1–10 retain their dictionary, hint and checkpoint behavior.
- Stages 11–16 reject touches and accessibility actions during paused or active
  incomplete reveals, including the first/second-language boundary. Elapsed
  partial-word timing continues; no rejected request opens later.
- Boundary tests stop one millisecond before completion, then cross the exact
  completion deadline. Separate even-stage cases fail the real SQLite write at
  completion and require recovery before any lookup target becomes available.
- Completed reveals support word touch and accessible activation. Dismissal
  keeps Next available and preserves the checkpoint. Background invalidation,
  revoked access and a callback during advancement cannot revive lookup.
- Native audio allocation is forbidden in silent-stage fixtures. Footer and
  remote confirmation are blocked behind the sheet; lookup does not confirm.
- Save/presentation failures retain completed silent checkpoints, without
  confirmation credit. Existing single-sheet and lifecycle tests remain green.
- Both layouts retain language order, selected fonts, 12/48-point extremes and
  2x font scale. Stages 15–16 never mount original-word targets. Stale completed
  text callbacks become inert on the next incomplete reveal.

## Native Simulator

iPhone 18 Pro / iOS 27 Debug build and launch pass. Existing dependency and
AppDelegate warnings remain; no new native code is introduced by #80.

- Stage 11: an original word opens a real installed Apple dictionary result.
  The fixed learning action dismisses to the same phrase with Next available.
- Stage 13: translation appears before the original. A translated word opens
  a real installed dictionary result; Apple's close control returns to the same
  paired phrase and enabled Next action.
- Stage 15: only translation is visible and accessible. A translated word opens
  a real installed dictionary result. The fixed learning action returns to the
  same translation-only phrase and enabled Next action.

These native smoke checks used the dark bubble layout. The active-reveal timing
matrix and alternate layouts are established by automated tests, not by these
three native smoke checks.

## Remaining device acceptance

The earlier #79 physical-phone approval does not establish #80 acceptance.
Physical iPhone stages 11, 13 and 15, full spoken VoiceOver operation and focus
restoration, offline/missing results, both appearances and maximum Dynamic Type
remain separate manual checks. Automated host fixtures do not prove native
layout, actual spoken output or dictionary installation behavior.

The inherited #79 live Dynamic Type sheet-footer limitation remains recorded in
`learning-dictionary-verification.md`; this change does not claim to fix it.
