# 쇄도잉

<!-- impeccable:product-schema 1 -->

## Platform

ios

## Users

People practicing spoken language through listening and repeating downloaded
sentences. M1 is the owner's iPhone-first, local-only prototype, developed and
checked in iPhone Simulator before a separate physical-device acceptance pass.

## Product Purpose

Make repeated spoken practice easy to start and safely resume, including the
current unfinished cycle. The device keeps the primary learning record in M1.

## Operating Context

Three icon-only native tabs: language-filtered books, the selected book's stages,
and settings. A shared top bar shows the language flag/picker, real level/XP and
streak. The learning player is outside this browsing shell. One controlled
12-sentence English/Korean package exercises subtitle shadowing, stages 1 and 2;
stages 3–16 are visibly unavailable until their methods are implemented.

The picker supports English (UK flag), Japanese, Chinese, German, Spanish and
French, in that order. Languages without books remain selectable and show empty
Books/Stages screens; they never borrow the English package or its progress.

Settings opens a category menu; its Learning Settings row opens a 0.25–3× speed
slider with icon-only native Back. Confirmation is always manual, including
restored legacy automatic sessions. No explanatory footer or mode picker is shown.
No unimplemented categories are
invented. The language picker uses a normal row background with an emphasized
selected border and checkmark. The Books screen omits instructional intro and
prototype/offline footer copy.

## Capabilities and Constraints

- Expo / React Native / TypeScript, native files, SQLite and audio.
- Fully validate a package before allowing practice.
- Three confirmed cycles, then an explicit Next or two additional Repeat cycles.
- Backgrounding pauses; explicit resume restores the saved phase and position.
- No server acknowledgement in playback. M1 has no accounts, sync or commerce.
- Local language-specific XP and streaks; one eligible stage per book/day, with
  2/3 rewarded repetitions. See `docs/learning-contract.md` for exact rules.
- Preserve learning behavior and data during this visual redesign.
- Other learning methods, dictionary, analysis and additional platforms are later work.
- Do not modify hosted Supabase data or publish changes without authorization.

## Brand Commitments

The owner approved a Duolingo-inspired, solid, playful redesign of the four
existing screens on 2026-09-11, with the existing workspace DESIGN.md as the color
authority. This replaces the earlier glass-heavy direction. The app is named
쇄도잉, using the owner's supplied logo and app icon. Primary is Bee yellow
#ffc800, with Fox orange #ff9600 for its pressed state. The exchanged Bee and Fox
accent roles are green #58cc02 and #58a700. Do not use Duolingo's characters or
proprietary fonts. Preserve the supplied artwork rather than redrawing it.

## Evidence on Hand

The native prototype, controlled lesson assets, domain tests, and a live iPhone
Simulator. Device acceptance, paid packages and cloud recovery are not claimed.

## Product Principles

- Quiet normal operation: no routine save/connectivity success announcements.
- Clear next action and visible, truthful learning progress.
- Interrupted or restored practice never creates completion by itself.
- Necessary errors explain a recovery action without erasing records.

## Accessibility & Inclusion

Readable Korean and English; scalable text, dark appearance, labeled controls,
non-color-only selection/progress, and minimum 44-point touch targets.
