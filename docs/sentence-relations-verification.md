# Word-relation graph — #85

## Scope

The existing analysis detail now contains ordered target tokens and POS labels in
a horizontal scroll view. Selection highlights direct connections only, with
head-to-dependent arrows, grammatical labels and Korean explanations. Indices
distinguish repeated words. ROOT has no self-arrow; unsupported labels remain
visible in the explanation card. No constituency spans or dictionary are added.

Relation names follow the original [Google Natural Language label vocabulary](https://docs.cloud.google.com/natural-language/docs/morphology), not interchangeable Universal Dependencies aliases.
Arrows use measured native token centers and separate vertical lanes. Native view
borders draw the paths without new dependencies. The semantic explanation cards
provide the same relationships without relying on color or decorative arrows.

## Automated verification

- Red/green checks cover repeated tokens, direction, root and punctuation handling,
  missing selection, unknown labels and invalid heads. Crossing/long-distance
  source links retain identity without invented transitive connections.
- The actual browser component supports token selection, selected accessibility
  state, relationship descriptions, Back, selection reset and Close.
- A review found insufficient top clearance for the highest arrow label at large
  Dynamic Type sizes. A red/green component regression checks label bounds at
  font scales 1, 1.5 and 3; the clearance now scales with the label.
- The real analysis route with SQLite preserves its entire checkpoint and XP
  through graph selection and sentence navigation. Existing authorization and
  reveal-independent entry tests remain in the full suite.
- The optional private-package check loads the installed DUO 3.3 v2 files using
  the production validator and relation projection. It passed for 560 source
  entries, 811 sentences and all 8,795 token selections, with no skipped test.
  This is actual-package verification, separate from public synthetic fixtures.
- After the review fix, `npm run check` passed all 577 tests and TypeScript;
  `npm run bundle:ios` completed successfully.

To repeat the private check without committing source content:

```sh
SENTENCE_ANALYSIS_PACKAGE_DIR='<installed-package-directory>' npx tsx --test scripts/sentence-relations-package.test.ts
```

The test reports no private text, analysis payload or local path. Without the
explicit directory, this private check is skipped, not counted as validated.

## Simulator verification — 2026-09-26

The installed DUO 3.3 free-test v2 package was used in stage 11, not the synthetic
lab. The production list/detail screen displayed subject, auxiliary, direct-object
and root relationships. Horizontal dragging exposed later tokens. Selecting
another word changed the relation card. At accessibility-extra-extra-extra-large,
vertical and horizontal scrolling and selection still worked; explanation text
wrapped. The original `large` content-size setting was restored afterward.
After the clearance fix, the highest subject label was also visually confirmed
fully visible at the maximum accessibility text size, then the size was restored.

Native semantic snapshots expose labeled word buttons, and component tests verify
selected state. This is not a claim of a full spoken VoiceOver session or a new
physical-device test. The current Debug binary loaded the changed JavaScript;
no native dependency or compiled module changed. Private screenshots are not
published. No package files, checkpoints or rewards were edited for this check.
