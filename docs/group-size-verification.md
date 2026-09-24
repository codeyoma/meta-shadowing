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
