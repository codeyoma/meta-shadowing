# Progression and navigation verification — 2026-09-11

## Delivered scope

Language-local XP, uncapped gradually increasing levels, daily book-stage reward
eligibility and language streaks. Books, selected-book stages and settings are
three icon-only native tabs under a shared flag/level/streak header. The player
remains a separate stack screen; language selection uses a native sheet.

Only the real English Morning Notes package is offered. The reward model covers
16 stages, but native playback is still limited to the existing stages 1 and 2.
Rows 3–16 are explicitly unavailable, not a claim that their methods work.

## Automated verification

- `npm run check`: **33 passed, 0 failed, 0 skipped**, TypeScript exit 0.
- `npm run bundle:ios`: exit 0, 1,245 modules, 38 assets, 2.7 MB Hermes bundle.
- Reward tests observed failing before the corresponding implementation; final
  tests inspect real SQLite results, not SQL text or mock invocation counts.
- Duplicate completion, daily first-stage lock, two/three reward limits,
  next-day selection, book/language isolation, version-stable allowance,
  zero-XP replay, rollback, legacy history, streak gaps, level thresholds and
  disk close/reopen are covered.
- Public Player actions complete three cycles and final Next through the real
  Journal transaction; restoration cannot award the same run again.
- Catalog tests reject cross-language selections and malformed/unimplemented
  stage links rather than silently opening a different learning stage.
- Existing audio, session, package, journal and palette contrast tests still pass.

## Simulator finish review

Inspected the actual running native Debug app on iPhone 17 Pro Max / iOS 26.5,
440 × 956 logical points. No synthetic XP or history was inserted into the
owner's app data.

- Light / Large: all three tabs, header values, selected icons, language sheet,
  catalog action and separate player inspected.
- Dark / Accessibility Extra Large: catalog and stage text wraps, header grows,
  native tabs remain visible. Scrolling exposes the complete Stage 1 action.
- Runtime accessibility inspection identifies the language button, labeled tab
  controls, stage action and player Back/Continue controls. This is not a full
  spoken VoiceOver or external-keyboard audit.
- Stage 1 still opens at sentence 1 with 1/3 confirmed cycles, paused. Returning
  restores the browsing shell; no completion or XP was manufactured by the test.
- One corrective layout batch reduced the logo to a 260-point maximum width and
  explicitly applied the canvas color to native tab content. The final light
  catalog places the main book action above the floating tab bar.
- Design tokens and original raster assets remain unchanged. DESIGN.md, its
  sidecar, PRODUCT.md and the learning contract now record the navigation and
  reward rules. No new raster assets were generated.

Local screenshots (ignored review artifacts):

- `.impeccable/review/navigation-catalog-light.png`
- `.impeccable/review/navigation-settings-light.png`
- `.impeccable/review/navigation-language-light.png`
- `.impeccable/review/navigation-player-light.png`
- `.impeccable/review/navigation-catalog-dark-large.png`
- `.impeccable/review/navigation-stages-dark-large.png`
- `.impeccable/review/navigation-stages-dark-large-scroll.png`

Verdict: ready for owner review of this local prototype increment. Simulator
left in Light / Large on Books, with the preview and development server running.

## Limits / preservation

No physical-device acceptance, fresh native binary build, release/offline-launch
acceptance, cloud sync, payment service or additional learning-method completion
is claimed by this pass. JavaScript changes ran in the existing native client.
Positive XP/streak displays are verified through the underlying data tests, not
fabricated screenshots. Clock changes are not secured by a server authority.

Existing checkpoints/history, bundled packages and staged legacy retirement
changes remain intact. No commit, push, deployment or hosted DB changes.
