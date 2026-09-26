# Word-relation graph — #85

## Scope

The existing analysis detail now contains ordered target tokens and POS labels in
a horizontal scroll view. Transparent, content-sized word controls have no visible
ordinal, border or card background, while retaining a 44pt minimum touch width.
All dependent-to-head curves appear in the overview. Selection highlights direct
connections and dims unrelated curves to gray; tapping the same word clears focus.
Grammatical labels accompany the curves and selected-word explanations appear below. Indices
distinguish repeated words. ROOT has no self-arrow; unsupported labels remain
visible in the explanation card. No constituency spans or dictionary are added.

The owner-approved direction is dependent to head in the curve, explanation title
and accessibility label. Source head/dependent fields are not swapped. A relation
name describes the starting word's role, not necessarily modification: subjects,
objects and auxiliaries retain their own names. PREP explains that the phrase
introduced by the starting preposition modifies the head.

Relation names follow the original [Google Natural Language label vocabulary](https://docs.cloud.google.com/natural-language/docs/morphology), not interchangeable Universal Dependencies aliases.
Arrows use measured native word bounds and non-overlapping interval lanes.
Incoming and outgoing connections share distinct attachment points within each
word's bounds, ordered by the other token's position. Selection does not move them.
Quadratic SVG paths render through the existing `expo-image` native component,
without new dependencies. SVG contains only measured geometry and palette colors,
not package text. Native labels scale independently. The semantic explanation cards
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
  The actual longest sentence (28 tokens, 27 non-root edges) also passes component
  overview, per-word focus, deselection and curve-bounds checks at scales 1 and 3.
  Its 54 endpoints have distinct attachment positions, stable through every word
  selection. The public component regression also checks shared-head separation
  and that the attachments stay inside measured word bounds.
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
The subsequent curve refinement was checked in the same DUO screen: initial all-edge
overview, word-sized controls, focus with gray context, repeated-tap deselection,
and curved arrows at maximum Dynamic Type. Selection keeps graph geometry stable.
The complete installed schema has no explicit clause/phrase spans, so no constituent
underlines are inferred or displayed. Full tests and iOS export were rerun successfully.
The endpoint refinement was checked on a multi-connection DUO word in the Simulator:
connections are spread across the word instead of converging at its center, and
focus preserves their positions. The private package test, full suite (577 tests),
TypeScript and iOS export passed again after this change.
The dependent-to-head direction was then verified in the same DUO Simulator screen:
subject arrows point to their verb, prepositional modifiers point to their head,
and explanation cards use the same direction. Unrelated edges remain dimmed.
The private package test, all 577 tests, TypeScript and iOS export passed again.
The copy and POS refinement was checked in the same DUO screen: direction guidance
appears above the graph, redundant scroll/self-arrow guidance is absent, and Korean
POS names have lowercase English names underneath. The persistent position indicator
tracks horizontal scrolling and remains visible after scrolling and word selection.
Component checks also cover overflow, viewport resizing and end-of-track clamping.
The private package check, 577 tests, TypeScript and iOS export passed after this refinement.

Component tests verify native list/detail push/pop, header synchronization and
Reduced Motion configuration. The full 577-test suite, TypeScript and iOS export passed.
The DUO Simulator screen also passed list-to-detail entry, button back, native
edge-swipe back and reentry. This verifies behavior, not release-device frame pacing.
Native semantic snapshots expose labeled word buttons, and component tests verify
selected state. This is not a claim of a full spoken VoiceOver session or a new
physical-device test. The current Debug binary loaded the changed JavaScript;
no native dependency or compiled module changed. Private screenshots are not
published. No package files, checkpoints or rewards were edited for this check.
