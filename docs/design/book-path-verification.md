# Compact books and stage path verification

## Persistent repetition stars

- Owner confirmed earned stars remain filled across days. Stars read the same
  durable full-run counts as stage completion: two for stages 1–10, three for 11–16.
- A new test failed before implementation and then passed for zero/partial,
  one-run, stage-10/11 boundary, complete and excess-run cases.
- All 42 tests and typecheck passed. Simulator screenshots verified two-star
  and three-star layouts with existing zero-completion data. Filled-state logic
  was tested without inserting fake completion records into the user's device.

## Latest owner-requested revision

- Sentence and chapter counts share one slash-separated row; book cards include a progress track. The stage overview also shows its completed-stage count on the right.
- Nodes use flattened coin geometry, a raised edge and clipped diagonal shine.
- Supersedes the original no-gating scope below: Stage 2 is locked until Stage 1 has two completed full runs. Existing checkpoints remain intact. The path, resume selection and player route enforce the same rule; completed stages remain available for review.
- Overview completion now requires the stage's full repetition requirement (two for 1–10, three for 11–16), rather than a single run. XP policy is unchanged.
- All 41 tests and typecheck passed. Simulator inspection confirmed the combined metadata, progress track, stage count and coin styling. Tapping locked Stage 2 stayed on the path. No progress was advanced.

## Original layout scope (historical)

- Compact horizontal book cards with four metadata rows and ownership-aware actions.
- Dark book overview, saved-position resume banner and sixteen-node winding path.
- Existing learning, local records and XP rules remain unchanged. Stages 1–2 remain playable; 3–16 remain unavailable.
- Missing chapter metadata displays a dash. No paid catalog entries or payment integration were added.

## Checks

- All 40 core tests passed, including distinct-stage progress, resume selection and purchase/download/resume action selection.
- TypeScript checking passed after the final layout adjustments.
- Live iPhone 17 Pro Max Simulator: inspected the compact book card and stage path, including the disabled future-stage accessibility targets.
- Opened the overview resume action: the existing first sentence and 1/3 confirmed cycles were retained, with playback paused and Continue available. Returned using the player back button without advancing learning.
- Replaced `toSorted` with sorting a filtered copy after the live Hermes runtime exposed missing support; the test environment alone did not catch this incompatibility.

## Limits

- Purchase/download/resume selection is unit-tested; no real purchase was attempted. The current controlled catalog contains only an owned sample.
- No physical-device, full Dynamic Type matrix or comprehensive screen-reader audit was performed for this layout change.
- No completion records were fabricated, no hosted database changes were made, and no commits or pushes were performed.
