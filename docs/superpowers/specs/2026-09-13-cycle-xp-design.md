# Cycle XP and level 999

Status: approved for implementation on 2026-09-13 after the XP motivation review.
Use the final recommended 0.53% curve. The previous 8%, 1.25%, and 0.55% curves
are superseded. Short-session goals and new reward features are out of scope.

## Approved behavior

- Each explicitly confirmed sentence cycle earns 1 XP, including both optional
  extra cycles. Three ordinary confirmations earn 3 XP; five earn 5 XP.
- Audio ending, elapsed time, opening a screen, pausing and restoring a checkpoint
  never earn XP by themselves. A final Next that also confirms a speaking cycle
  awards that cycle once, even though the resulting checkpoint advances a phrase.
- Stop granting the old 10 XP completed-run reward and remove its daily limit.
  Every newly confirmed cycle is eligible regardless of book, stage or date.
- Preserve existing XP and completion history without retrospectively awarding
  old cycles. Preserve per-language totals, three full runs per stage, and the
  completed-run-based streak rule. A partial practice session can earn cycle XP
  without incrementing full-run completion, stage stars or the streak.
- Maximum level is 999. The owner's int32 constraint supersedes the original
  8% growth rate. Approved next-level formula:
  `round(100 * 1.0053^(level - 1) / 10) * 10` for levels 1 through 998.
  At level 999 show MAX and a full progress track. XP overflow policy:
  retain further XP up to 2,147,483,647, then saturate the XP counter without
  wrapping or stopping study/history recording.
- Learning's header remains sentence progress, not an XP bar. The browsing header
  displays the updated language XP on return. No new sounds, alerts or reward UI.

## Approach and alternatives

Use an additive cycle-credit ledger while preserving the legacy reward tables.
This separates historical 0/10-XP records from the new 1-XP rule and retains a
clear migration boundary. Rewriting historical awards would reinterpret user
records; counting button taps only in memory would lose idempotency after crashes
and backup restores. Neither alternative is acceptable.

## Durable cycle credit

- The journal remains the sole atomic boundary for checkpoints, cycle credit,
  completed-run history, streak days and backup revision. A failed write rolls
  back all of them. The player does not wait for a network acknowledgement.
- Add a versioned ledger keyed by package version, stage and run, bound to
  language and book identity. Store the current phrase/confirmation high-water
  mark and accumulated credited count per run, not a growing row per sentence.
  A run's frontier never moves backwards. This preserves duplicate protection
  without millions of per-phrase rows for the owner's 50-book workload.
  Counts remain bounded integers; the complete language total is derived.
- Compare the incoming state with its persisted predecessor before replacing
  the checkpoint. Same-phrase explicit confirmation credits the newly confirmed
  cycle. Phrase advance/final completion must retain the preceding phrase's last
  confirmation, including one-tap third/fifth-cycle Next. Decision checkpoints
  whose cycle was already confirmed cannot award again on Next.
- Repeat confirms the third cycle once and opens two additional cycles. The
  fourth and fifth confirmations each earn 1 XP. Existing legacy longer saved
  sequences remain readable; newly confirmed cycles follow the same 1-XP rule.
- Never infer credit for skipped phrases, audio position or an arbitrary jump
  in a snapshot. Use the existing explicit transition semantics and reject or
  ignore non-confirming changes rather than inventing past practice.
- Baseline all existing checkpoints during the additive migration without XP.
  Baseline legacy backups before enabling new credit. A first observed progressed
  checkpoint without a trustworthy predecessor receives no speculative reward.
- A resumed baseline can earn only subsequent confirmations. Persisted high-water
  marks prevent retries, duplicate saves and older same-run snapshots from earning
  already observed cycles. Conflicting run/package/stage identities fail safely.
- Completed legacy runs never gain new cycle credit when reopened. Newly started
  runs get independent identities and can earn XP normally.

## Levels and numeric precision

- Interpret int max as signed 32-bit maximum, 2,147,483,647. Level 999 must be
  reached strictly below it. The previous BigInt runtime-total proposal is
  superseded; XP counters and cumulative thresholds fit in ordinary int32.
- Approved growth is 0.53% per level, with a 100-XP starting requirement and
  nearest-10 rounding. Evaluate from the unrounded formula for each level, not
  by compounding a previously rounded requirement. The resulting 998 increments
  are positive, monotonic and multiples of ten.
- Derive and validate a fixed threshold table against exact rational 10053/10000
  arithmetic in development; ship bounded integer values with a deterministic
  lookup. BigInt may be a development/test oracle, not a runtime XP requirement.
- Level 999 requires 3,669,390 cumulative XP. The 998-to-999 increment is
  19,440 XP. All stored/displayed totals stay at or below signed int32 maximum.
- Apply saturating aggregation/addition before any int32 overflow. Do not use
  bitwise coercion, wraparound, or an unchecked huge SUM followed by a clamp.
  Preserve detailed learning history even once the displayed XP counter caps.
  Existing historical records remain unchanged; derive the level from retained
  XP under the new curve. Never reset XP to keep an old displayed level.
- Normal UI amounts remain exact integers. MAX uses a full progress ratio and
  an explicit MAX label, without division by zero or advancing to level 1000.

This is a long-term practice record, not a certified proficiency or daily target.
The owner's baseline is 500 sentences × 3 cycles × 3 runs × 16 stages = 72,000 XP
per book. The cap corresponds to approximately 51 such books without extra cycles.
Nearer-goal features discussed in the research are not authorized by this change.

## Backup compatibility

- Export a version-2 progress payload containing legacy records, cycle credit and
  migration/baseline state. Read version-1 backups through a deterministic
  conversion that preserves their XP and baselines their current checkpoints.
- Keep strict version/identity/count validation, duplicate-key checks, payload
  size limits, atomic restore and the nonempty-profile replacement guard.
- New streak days are justified by full-run completion rather than the former
  10-XP award; update cross-table validation accordingly without weakening legacy
  award validation. Cycle credit does not require the whole run to be complete.
- Round-trip credit and high-water marks so the next save after restore cannot
  award historical cycles. Unsupported future versions fail without replacing
  the readable backup. An old app's rejection of version 2 is not permission to
  overwrite it with an empty or downgraded backup.
- Verify the existing cloud coordinator treats an incompatible newer payload
  safely. Do not alter cloud account consent, ownership, hosted schema or services.

## UI and documentation

- Remove the obsolete daily reward snapshot and “오늘의 XP · Stage … · …회” text.
- Update the language header for capped integer XP, normalized progress and MAX.
- Update the learning contract and design documentation to distinguish cycle
  rewards, full-run completion, stage unlocks and streaks.
- Keep existing player controls, sound-free haptics, pulse timing, confetti and
  progress animations unchanged except where the XP summary type requires wiring.

## Verification

Use real player transitions and SQLite transactions, not synthetic tap counters.

1. Three confirmations earn exactly 3 XP; Repeat plus two confirmations earns 5.
2. Ready/listening/paused listening/audio-ended states do not award XP; each
   confirmed cycle does, including one-tap final Next and next-phrase reset.
3. Duplicate saves, resume, process reopen, stale checkpoints, failed-save retry
   and backup round trips do not duplicate XP or completion history.
4. A failed credit write rolls back XP, checkpoint, streak and backup revision.
5. Existing 0/10 awards and partially completed checkpoints migrate unchanged;
   only later confirmations receive new XP. Version-1 restores behave identically.
6. No new 10-XP bonus or daily cap; books/languages remain isolated as specified.
7. Stage stars and streaks still require full runs rather than individual cycles.
8. Exact threshold-minus-one/threshold cases, carried remainder, monotonicity of
   all 998 increments, cumulative XP strictly below int max, invalid numeric
   inputs, level 998/999 boundary, XP after MAX and saturating int32 addition.
9. Version-2 backup validation, corrupt credit rejection, newer-version safety,
   no backup replacement on failure, and existing sync/consent regression tests.
10. Typecheck, full test suite, Release simulator build and scoped UI checks.
    Physical haptic/audio feel and remote CloudKit acceptance remain separate.

## Scope and authority

Implement in the existing native worktree, preserving unrelated dirty changes.
No user data reset, destructive cleanup, speculative retroactive XP, device test
fixture injection, Supabase use, remote schema mutation, purchase, commit, push,
PR publication or release is authorized by this design review.
