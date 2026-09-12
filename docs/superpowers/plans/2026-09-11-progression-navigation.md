# Language progression and navigation implementation plan

**Goal:** Implement the owner-approved daily book rewards and three-tab shell.
**Architecture:** A local SQLite reward ledger shares the journal transaction.
Pure calendar/level helpers feed a shared browsing header. Native tabs host the
existing catalog, stages and settings; the player remains outside the tab shell.
**Tech stack:** Expo 57, React Native, TypeScript, expo-sqlite, Expo Router.
**Spec:** The approved contract below, from the owner's conversation decisions.

## Approved contract and implementation boundaries

- First newly completed stage locks the book's eligible stage for that local day.
- Stages 1–10 award 10 XP for each of the first 2 runs; 11–16 for the first 3.
- Other stages and extra runs award zero without blocking practice.
- Book identity is stable across package versions. Language totals are separate.
- Start at level 1; next-level XP = nearest 10 of 100 × 1.08^(level − 1).
  No gameplay level ceiling. Reject unsafe or invalid numeric inputs.
- A language streak counts consecutive local dates with completed practice.
  Yesterday's streak remains visible until today ends; no completion means zero.
- Completion day uses the device's local calendar at successful save. Existing
  dates never change. Offline device-clock manipulation is not server-secured.
- Existing history/checkpoints stay intact, with no speculative retroactive XP.
- Header: language flag selector, level/XP, flame/streak. Icon-only bottom tabs:
  books, selected book's stages, settings. Header/tabs are absent in the player.
- Only the real English sample is offered; unsupported languages/books are not
  invented. The schema supports other languages without mixed totals.
- Existing playable methods remain stages 1 and 2. Show later stages as unavailable.
- Quiet operation, existing colors/logo, light/dark and scalable text preserved.
- No commit, push, deployment, hosted mutations or app-data reset.

## Tasks

- [x] Reward ledger and level derivation: create `src/core/progression.ts` and
  `progression.test.ts`; extend `Journal.save` with trusted book/language identity.
  First test `save(complete)` twice and assert XP remains 10. Add other-stage,
  2/3 caps, midnight, books/languages, rollback, reopen and level boundary tests.
  Run `npx tsx --test src/core/progression.test.ts` red, implement, rerun green.
- [x] Catalog selection: create a small validated catalog/selection model and
  native persistence adapter. Test invalid and cross-language selected books.
  Keep stable sample package keys; choosing a book routes to its stages.
- [x] Browsing shell: move routes under `(tabs)`; introduce native icon tabs and
  shared language/progress header, retaining `/player` outside. Remove modal-only
  Settings completion control. Reflect selected book, XP quota and 16 stage rows.
- [x] Verification: run all core tests, typecheck, iOS bundle; inspect live
  Simulator catalog, stages, settings, player and language sheet. Check dark and
  large text. Correct one batched set of visual findings, then document results.

## Test examples / review checklist

```ts
// Same book/day: completed stages 1, 2, 1, 1 → XP 10, 0, 10, 0.
// Next day: old run replay → 0 new XP, stage 2 new run → 10.
// Stage 11: four distinct completed runs → total 30.
// XP 99 → level 1, 99/100; XP 100 → level 2, 0/110.
// Failed reward insert → checkpoint and completion history both roll back.
```

Inspect real SQLite effects, not SQL source strings or mock call counts. Test
the migration by saving legacy completion history before adding reward identity.
Screen verification uses real Simulator controls; do not manufacture XP in the
owner's app data to make the header look populated.

## Outcome

33 tests and TypeScript check pass. iOS bundle export passes. Native Simulator
inspection covers all three tabs, language sheet, player isolation, retained
checkpoint, dark appearance and Accessibility Extra Large text with scrolling.
See `docs/design/progression-navigation-verification.md` for evidence and limits.
