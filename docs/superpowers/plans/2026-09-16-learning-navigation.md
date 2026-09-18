# Learning navigation and weighted XP implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add visual spacing between grouped members, a sectioned all-sentences menu with safe navigation, and source-count-weighted cycle XP.

**Architecture:** Preserve the existing native audio queue and saved run grouping. Navigation must track visited units independently so jumping cannot imply skipped completions or suppress legitimate later confirmations; legacy checkpoints and their accumulated credit migrate without retroactive XP. Presentation and menu helpers remain independent of device adapters.

**Tech Stack:** Expo Router, React Native, TypeScript core, native SQLite and existing native audio queue.

**Spec:** Owner-approved design in this document; existing invariants in `docs/learning-contract.md`.

**Completion record (2026-09-16):** Tasks 1 and 2 implemented and independently
reviewed; combined review approved. Final verification passed 302 core, 8 build,
and 3 content tests, TypeScript, iOS bundle export, and whitespace checks.
Simulator verified headerless navigation, saved-group alignment, grouped text
spacing and reveal, +2 XP for a two-source confirmation, and no reward or autoplay
from closing options. Sectioned accordion and short-remainder behavior are covered
by automated neutral-fixture tests; private DUO accordion UI and physical-device /
TestFlight acceptance were not exercised. Existing XP and completion data remain
preserved. All changes remain uncommitted in the existing worktree.

## Global Constraints

- Preserve all existing worktree changes and installed learning data. No commit, push, merge, upload, or private DUO content in tracked files.
- Grouped members have approximately 8pt visual separation. Do not add audio silence or merge/export audio.
- Options contains “전체 문장”. Numeric section metadata renders “Section N”; headers collapse/expand. Books without headers show a flat list in original order.
- Sentence selection navigates to the saved learning unit containing that source index, not a newly regrouped unit. The selected unit starts from its first member; retain confirmed cycles. A selection alone never grants XP or completion.
- Preserve stage access, ownership, installation and profile/run isolation. Closing options alone never resumes audio.
- Each explicit cycle confirmation earns the actual number of source members in that unit. Single source earns 1, groups of 2/3/4 earn 2/3/4, final single remainder earns 1. Final Next/Repeat rewards the originating unit, not the destination.
- Historical XP remains unchanged. Duplicate/stale saves, pauses, reveals, navigation and restoration earn zero. Stage completion requires every unit's mandatory cycles, not merely reaching the last index.
- Continue stages 1–10 only. Release locks and native queue behavior remain unchanged.

### Task 1: Durable navigation and weighted cycle credit

**Files:** Modify `src/core/session.ts`, `cycle-credit.ts`, `journal.ts`, `progress-backup-codec.ts`, `progress-backup.ts`, `learning-context.ts`; create `src/core/session-navigation.ts` and behavior tests; update `docs/learning-contract.md`.

**Interfaces:** Produce `jumpToSourcePhrase(state: Session, sourceIndex: number): Session` from `session-navigation.ts`. It returns a paused state, same run/plan/rate, resets target audio to zero, retains target confirmations, rejects invalid indices, maps using the persisted group size. Core owns internal state/ledger schema and compatibility. Existing `LearningContext.units()` remains compatible.

- [ ] Write failing real session/SQLite tests for weighted confirmations and navigation. Cover group sizes 2/3/4 and a short remainder, final Next from speaking, Repeat, duplicate save, unchanged historical credit, forward skip then backward learning, interrupted target restoration, and no completion after jumping to and finishing only the final unit.

```ts
// Hand-checked contract example: 5 source blocks grouped by 2.
const s = createGroupedSession({ runId: 'navigation', stage: 7,
  sourcePhraseCount: 5, groupSize: 2, mode: 'manual', rate: 1 });
assert.equal(jumpToSourcePhrase(s, 3).phrase, 1);
assert.equal(jumpToSourcePhrase(s, 4).phrase, 2);
// With real Journal writes, a confirmed cycle in unit 0 returns 2;
// a confirmed cycle in unit 2 returns 1; every jump/save retry returns 0.
```

- [ ] Run the focused tests and record their expected failures before implementing.
- [ ] Add bounded, validated per-unit navigation progress and credit provenance while retaining old version-1/version-2 checkpoints. Use focused helpers, not UI inference. If backup schema changes, accept historical backups, emit the new version, and validate new unit state and credit relationships. Keep aggregate historical totals untouched.
- [ ] Extend existing transition behavior to revisit saved units without resetting their checks or allowing a final-index shortcut to complete a run. When reaching the end with gaps, return to an unfinished unit; complete only once all mandatory units were actually confirmed.
- [ ] Add backup round-trip/migration/tamper tests, including large realistic sectioned books. Run focused tests then `npm run check` once. Update the learning contract and report exact interface/schema details to Task 2. Do not commit.

### Task 2: Grouped presentation and all-sentences menu

**Files:** Modify `src/components/speech-content.tsx`, `src/core/learning-units.ts`, `learning-presentation.ts`, `src/app/player.tsx`, `player-options.tsx`; create focused menu/presentation helpers and tests and a route/component as needed; register route in `_layout.tsx` if needed.

**Interfaces:** Consume `jumpToSourcePhrase(state: Session, sourceIndex: number): Session` and existing package/run context. Preserve source section metadata without exposing private source content in fixtures. Presentation may add structured members to learning units while retaining text/translation/hint compatibility.

Also consume `completedUnitCount(state: Session): number` from `session-navigation.ts` for the player header; a high selected index is not completed progress. Update `createCycleHaptics` with a focused backwards-Next test so confirming the last cycle and returning to an earlier gap still emits the originating cycle's rhythm, while jump itself stays silent.

- [ ] Write failing helper tests for header grouping, flat fallback, original index preservation, grouped source membership, and first-word/reveal presentation per member.

```ts
// Neutral fixture: sections are metadata, not part of sentence text.
const phrases = [
  { text: 'Open the door.', translation: '문을 여세요.', section: 1 },
  { text: 'Close the window.', translation: '창문을 닫으세요.', section: 1 },
  { text: 'Take a break.', translation: '쉬세요.', section: 2 },
];
// Expected header groups: Section 1 -> original indices [0, 1]; Section 2 -> [2].
```

- [ ] Implement 8pt separation between original members in bubble and list modes, preserving existing quoted dialogue pairing and per-unit hint/reveal behavior. Audio is unchanged.
- [ ] Keep ordinary grouped narration in the existing single bubble where possible; separate member text blocks inside it instead of creating a new card for every sentence. Dialogue utterances still use their existing paired bubbles.
- [ ] Add “전체 문장” entry in player options. Render accessible accordion headers and pressable sentence rows with current-unit highlighting. Headerless content is immediately visible. Use existing sheet/background/control patterns, large lists must remain scrollable.
- [ ] On selection, validate current profile/package/stage/run, checkpoint the paused jump, dismiss to player and explicitly trigger the existing delayed entry behavior. Returning/closing without selection stays paused. Cancel stale entry requests, pending timers and playback during interruptions.
- [ ] Run `npm run check` and `npm run bundle:ios`; report outputs and focused test evidence. Do not commit.

### Integration verification

- [ ] Review task deltas independently, then review combined navigation/reward lifecycle.
- [ ] Restart the existing development server if needed. On simulator, verify no-header menu, sectioned accordion with neutral fixtures where practical, grouped jump alignment, 8pt spacing, first-word toggle, and 2-XP/short-remainder behavior without changing physical-phone history.
- [ ] Report build/export/test results separately from actual physical-device/TestFlight validation. Keep the worktree uncommitted.
