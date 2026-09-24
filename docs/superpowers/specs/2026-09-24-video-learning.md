# Offline video learning

Status: product scope and four-ticket breakdown approved by the owner.

## Delivery order

- #67: prepared local video package and stage 1.
- #68: stages 2–10, blocked by #67.
- #69: silent stages 11–16, blocked by #67.
- #70: interruption and wired-control acceptance, blocked by #68.

Do not modify #61 or close any ticket before its acceptance criteria pass.

## Content and privacy

The first package uses 17 supplied phrases and their supplied corrected English
and final Korean. ASR, source subtitles, and review flags are provenance, not
instructions to rewrite the learning text. Do not align corrected text to ASR
word timings. The complete original video is preserved without cutting or
re-encoding. Phrase timestamps refer to that same original video.

The owner plans a separate private content repository. Its creation, upload,
authentication, and remote delivery are outside these tickets. First delivery
uses explicitly prepared local files and works offline after installation.
No private content, original filenames, hashes, local paths, or credentials
belong in public source, fixtures, issues, logs, or CI artifacts. Public tests
use generated media and fictional text. Do not distribute the private package
through release builds or export artifacts by default.

## Learning behavior

Stages 1–10 show inline video above the current unit's paired text. Preserve
existing subtitle visibility and first-word hints. Grouped stages play member
segments in order and skip intervening gaps. Preserve cycles, explicit
confirmation, XP, speed, Repeat, stage access, and package-bound checkpoints.
Only the video supplies original audio. Hold the final frame while awaiting
confirmation; replay begins at the unit's first segment. No free scrubbing,
fullscreen, or picture-in-picture is exposed.

Stages 11–16 remain silent text-only learning with the existing language order,
cumulative word reveal, fixed S1–S4 speed, single pass, and explicit +3 XP
confirmation. Do not mount a video player or thumbnail in these stages.

Menus, app switching, and locking pause original video/audio and preserve
position. Returning does not automatically play. Enabled wired monitoring
continues under its existing permission, lifecycle, and route rules. No new
background capture is started. Existing single-press and double-press guards
remain authoritative; media completion alone never confirms or awards XP.

## Failure boundary

Invalid manifests, mismatched files, failed seeks, stale callbacks, interrupted
installation, and unavailable media must not grant XP or advance a phrase.
Keep durable progress separate from removable media. Preserve all existing
audio packages and their identities. Each package version is immutable.

## Verification

Run domain, filesystem, SQLite, native playback, and UI integration checks.
Report simulator results separately from physical-device monitoring and headset
checks. Never claim the supplied subtitles were verified by listening unless
that verification actually occurs.
