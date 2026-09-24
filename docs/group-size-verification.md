# Immediate group-size changes

The owner approved changing the current paused run from its learning menu while
preserving earned XP and completed work. Only unfinished playback restarts.

The original symptom was a saved default of four while an existing run still
used its immutable three-member plan. The editor now displays the actual active
size and explicitly replaces the plan, rather than silently editing a default.
Global Settings continues to control fresh-run defaults independently.

Regrouping records per-source confirmed/planned cycles in the checkpoint. A new
plan identity keeps historical reward receipts immutable. Mixed groups advance
only unfinished sources, and weighted confirmation receipts prevent re-crediting
already completed sources. Selecting the current size is a no-op. Invalid,
stale or failed saves leave the persisted checkpoint and XP unchanged.

Automated checks cover all three sizes, mixed completed/partial/unstarted work,
optional cycles, repeated regrouping, navigation, direct and pinned Player
writers, backup restoration/merge, duplicate merges, malformed payloads and
transaction rollback. Fixtures contain generated text only.

Verification on 2026-09-24: `npm run check` passed 442 core tests, 25
build/package checks and TypeScript. iOS JavaScript export passed. On the running
Simulator, selecting four instead of two immediately changed the active
17-source lesson from nine groups to five. The new checkpoint retained all
source progress, reset playback to zero, remained paused and left XP unchanged.
The four-source selection and five-group counter were visibly verified. No
new native build or physical-device verification is claimed.

## PR #73 review corrections

Regression tests reproduced both review findings before correction: Repeat
reopened sources completed before regrouping, and two offline devices awarded
overlapping source work under different plan IDs.

- Closed source markers survive checkpoint restoration and exclude those
  members from optional Repeat passes. A fully closed decision cannot Repeat.
- Regrouped plans retain the original reward lineage. Confirmation receipts
  identify source indices and cycle ordinals, independently of group size.
  Displayed XP counts overlapping evidence once without rewriting historical
  per-plan receipts; completed branches count as one original practice run.
- Two SQLite-backed devices cover same-size and different-size regrouping,
  a branch that keeps the original plan, nested regrouping, mixed Repeat,
  both merge orders, retransmission, restoration, and continued pinned-player
  confirmations after sync. An independent new run still earns normally.
- Migrated version-3 progress preserves historical XP. Malformed lineage and
  source receipt payloads are rejected before changing local progress.

After these corrections, `npm run check` passed 449 core tests, 25 build/package
checks and TypeScript. iOS JavaScript export passed. These are automated local
checks, not a two-phone or real CloudKit test.
