# Native learning behavior

Fresh specification, not reused implementation. The approved reference is the
latest legacy behavior at be3761f, including its amended confirmation rules;
earlier planning documents can contain superseded behavior.

## Current stage expansion — 2026-09-20

The owner-approved implementation now enables stages 1–16. Stages 1–4 share
the same manual subtitle-shadowing flow. Stages 5–6 retain full original audio
but show only each sentence's first word while always displaying translations. Stages 7–8
continuously play groups of original source files; stages 9–10 combine grouping
with first-word hints. Stages 11–16 use silent word reveal as specified below.

### Silent word reveal — stages 11–16

- 11–12 reveal the target text, then Korean; 13–14 reveal Korean, then the
  target text; 15–16 contain only Korean. One original source block is one unit.
- Begin with all words hidden. Reveal one whitespace-delimited word every
  `60 / WPM` seconds, preserving punctuation, whitespace and the full layout.
  Revealed words remain visible. Korean uses space-delimited eojeol. The first
  language stays visible while the second appears. No native audio is opened.
- The center header speed action shows **S1–S4**, not an audio multiplier or
  raw WPM. It opens a selector using the existing configurable four WPM values
  (defaults 150/200/250/300). Fresh runs start at S1; a selected level and its
  WPM remain fixed throughout that run, without automatic speed progression.
- Changing speed requires a paused checkpoint and preserves partial-word
  progress. Editing global WPM presets does not silently alter an existing run;
  select a speed explicitly to apply its current preset to that run.
- Each phrase has one reveal pass, without a cycle indicator or Repeat action.
  Finishing the reveal unlocks manual confirmation, which grants 3 XP and moves
  directly to the next unfinished phrase (or completes the stage). Timing alone
  never grants XP or advances a phrase.
- After confirmation, the next phrase's reveal clock starts without the audio
  stages' one-second inter-phrase pause. Words retain the selected WPM cadence.
- Historical confirmations keep their original XP. Completed units stay complete;
  an unfinished legacy unit needs only one remaining pass. Newly earned reveal
  receipts carry an explicit 3x multiplier so backup merging cannot retroactively
  multiply older awards or award the same confirmation twice.
- Pause/foreground/navigation reuse the player's durable checkpoint behavior.
  The saved `reveal` metadata contains level and WPM; `audioSeconds` is the
  elapsed **silent reveal timeline** for these stages, not an audio position.
  Normal interruption retains partial-word timing. Completed reveal passes stay
  visible on reentry, unlike the audio-stage replay-on-entry behavior.
- Hidden words are excluded from the text accessibility label and selection.
  The analysis placeholder respects the same reveal boundary. All-sentences
  navigation remains an explicit separate reference/navigation surface.
- Backups retain the new stage checkpoints and speed metadata. Older app
  versions cannot read these newly supported stages: update all syncing devices.
  Existing stages 1–10 and their checkpoints retain their original behavior.

A learning unit is one original source block for stages 1–6 and a group of
2, 3, or 4 blocks for stages 7–10 (default 2). Source blocks can contain dialogue
or multiple sentences. Counters, cycles, XP, audio position, and resume all use
the same unit. Group audio uses an ordered native queue of unchanged original
files, never merged/exported audio. Member transitions require no confirmation,
phase change, or artificial delay. The final short remainder is a separate unit;
the current flat package format has no section boundaries. This supersedes the
historical remainder/timing reference below.

Fresh grouped runs save their source count and group size. Restored runs derive
their units from that saved plan, even after changing settings. A changed source
count or incompatible checkpoint is rejected. Settings explain that group-size
changes apply only to the next fresh run. Existing stage 1/2 progress is preserved.

The accessible “자막 보기” toggle above playback reveals only the current unit.
Hidden target text retains all characters and layout:
non-hint text uses the actual card background color, then fades to normal ink when
revealed. Translations remain visible in both states. The right-aligned toggle has
a minimum 44pt touch area; Reduce Motion disables its text fade. Hidden text is not
selectable and its accessibility label exposes hints only.
Both bubble and list modes place each source member's translation immediately
below that member, before the next source member. The large display previews and
the segmented picker both select the same saved display preference.
List mode renders only the current saved learning unit, with all its paired
utterances in one left-aligned vertical list. It is not a scrollable lesson index;
the separate all-sentences option remains the navigation surface. Long current
content scrolls using the outer player screen, without an inner fixed-height list.
Revealing never plays, pauses, confirms, or changes
cycles. Reveal state resets when the unit/run changes and on player re-entry.
Analysis derives the current saved unit and always retains hints in hint stages;
it cannot expose full subtitles through a direct route. Analysis remains a placeholder.

App Store stage access still requires three real predecessor completions.
Development and verified TestFlight builds may select any implemented stage;
unverified, unavailable, failed, or timed-out distribution checks remain locked.
The map and direct player route use the same policy. Ownership and verified local
installation remain required. Test access never writes completion records.

## Original milestone boundary (historical)

M1 implements subtitle shadowing (method 1, stages 1 and 2), a controlled spoken
lesson, local package installation, and durable progress/resume on iPhone.
The full product retains eight methods and sixteen stages. Other methods,
dictionary, and sentence analysis are M2, clearly marked unavailable in M1.
Owner-approved UI refinement in #57 exposes a sentence-analysis placeholder
drawer, not the analysis engine; the drawer explicitly says it is not ready.

## Eight methods / sixteen stages

Each method has two stages. The path advances sequentially: complete the current
stage's required full runs (three for every stage, 1–16) before the next stage
unlocks. These are cumulative completion records, not phrase cycles; each
explicitly confirmed cycle earns XP independently. Completed stages remain available for review.
Old checkpoints are preserved but do not bypass a locked predecessor. Completing
a stage does not automatically start another stage. Unimplemented methods remain
unavailable even after their predecessor is complete.

1. Subtitle shadowing: listen, speak with text, compare.
2. Short memorization: listen/read, then speak again without looking.
3. First-word hints: listen using a first-word hint, speak twice without subtitles.
4. Group memorization: listen to a group, then speak again without looking.
5. Group hints: use each phrase's first word, speak the group without subtitles.
6. Rapid target then translation: target-language lines, then Korean meaning.
7. Rapid translation then target: Korean prompt, speak target, reveal answer.
8. Rapid recall: Korean prompt, quickly produce the target sentence.

## Audio cycle contract (M1)

- Normal enabled button taps provide a light native haptic. The owner-approved
  #57 refinement adds this feedback to all three browsing tabs, including Settings,
  and to the header flag that opens the native language menu. The flag trigger is
  an explicit exception to quiet language controls; picker selection retains only
  the system control's behavior. Player footer feedback is cycle-specific and
  haptic-only; options/settings editors, the separate language route and the
  decorative mascot remain quiet. No app-level tap sound is played. Feedback never
  waits before the actual action, counts as learning, or changes speech speed;
  unavailable feedback fails silently. Rapid taps cannot stack sound players,
  and pending feedback is cancelled on app interruption.
- A phrase normally has three cycles. Once the third playback starts, Repeat and
  Next remain visible, but neither can close an unfinished playback (owner update,
  2026-09-13).
- End of audio is not itself confirmation: enter the speaking/confirmation phase.
- Confirmation is always explicit: elapsed time never confirms a speaking cycle.
  Legacy automatic settings/checkpoints become manual without resetting progress.
- Playback speed uses a 0.25–3× slider in 0.25× increments. Existing finer-grained
  saved rates remain readable; the next adjustment selects a quarter-step. Fresh installations
  default to 1× without resetting existing preferences or checkpoints. New sessions use the
  saved preference; unfinished sessions retain their checkpoint's speed. The
  player options drawer can explicitly change that paused session's speed without
  changing the phrase, cycle, or saved audio position.
  All playback-speed editors reuse `PlaybackRateControl`: the “배속”
  heading, one-line native slider with live rate on the right, and four dots at
  the 0.25×/1×/2×/3× positions instead of scale labels. The settings heading sits
  outside the card. The settings preference and paused-session rate keep their separate
  persistence scopes; sharing the layout must not overwrite either implicitly.
- Entering the player from a stage (new or restored) and each newly selected
  sentence wait one second before starting audio. Completed checks stay filled.
  Interrupted listening resumes at its saved audio position; an already-ended,
  unconfirmed speaking cycle replays its audio from zero on stage entry only.
  A completed three/five-cycle decision does not autoplay or advance. Repeated
  cycles of the same sentence do not add this delay. Opening options, leaving,
  or an app interruption cancels pending playback without confirming anything.
- From the start of the third playback, show Repeat and Next but keep both locked
  until that playback ends. A paused third playback remains resumable and cannot
  be skipped. After audio ends, Repeat confirms the third cycle and starts cycle
  four from zero, while Next confirms it and advances to the next phrase (or
  completes the final phrase). Audio ending alone never advances.
- Repeat adds exactly two additional cycles. It never resets confirmed progress.
- Offer Repeat only during/after the initial third cycle. At five cycles (and
  older saved longer sequences), show only Next; preserve all saved cycles.
- The player shows connected cycle nodes instead of a visible completion counter.
  The active outline follows actual media position/duration; audio ending fills
  the outline but does not check the node. The icon-only main action explicitly
  confirms, then starts the next cycle. During every playback it is disabled.
  Cycles one/two and extra cycle four retain the existing explicit confirmation
  rule; after fifth-cycle audio ends, Next confirms and advances in one tap.
- From the third playback start, a recycle-icon Repeat action appears beside
  the main action in a 1:3 width ratio. Repeat slides in from the left while the
  main action narrows over 220 ms; Reduce Motion applies the final layout directly.
  Repeat reveals two more nodes from the right. Nodes have no visible numbers;
  explicit confirmation animates the check, then fills the line to the next node.
  Phrase-content transitions affect only the central sentence card. The footer
  has no separator line.
  Back navigation and app interruptions still pause and save; no separate pause
  or restart button is shown. Icon controls retain accessible names and recovery.
- Player navigation opens a native options drawer instead of immediately going
  back. It pauses/checkpoints first and offers speed, return, and a Cardinal
  “스테이지로 돌아가기” action. Closing the drawer never automatically resumes.
  The header shows sentence progress and position, not XP. The counter is aligned
  to the right content margin; native text measurement reserves both digit slots
  from the total phrase count with tabular numerals, so the track stays the same
  width when the current phrase crosses a digit boundary. The row below shows
  method level, speed, and a sentence-analysis placeholder action. Both rows,
  including the three controls' full touch areas, belong to the fixed navigation
  header and never move with the scrolling phrase content. As requested
  in the #57 UI refinement, the level and analysis actions pause/checkpoint and
  open native drawers. The guide identifies the level and method; detailed
  guidance is intentionally empty for now. The analysis drawer shows the current
  phrase/translation and an explicit not-ready message; analysis remains deferred.
  Closing either drawer never resumes playback or confirms a cycle.
  Tapping the speed indicator pauses/checkpoints and opens the drawer directly at
  the speed editor; the options icon still opens the complete options menu.
- Bubble display groups each target-language utterance and its Korean translation
  inside one bubble. Complete matching sequences of double-quoted utterances are
  paired in order; punctuation inside a quoted utterance does not split it. If
  quotation structure or pair counts do not match, keep all original text together
  rather than guessing alignment. This is presentation only: package phrase/audio
  boundaries, list mode, cycles, and checkpoints do not change.
- Next becomes actionable after the initial third playback ends, after the fifth
  playback ends when extra practice was chosen, or at an already-confirmed
  decision checkpoint. Those actions explicitly confirm the final speaking pass;
  playback time, interruption and restoration never confirm it.
- Navigation outside that choice never confirms skipped practice.
- Final Next completes a stage/run once. Restoring that state cannot duplicate
  completion history.
- No backend request or acknowledgement is on the playback path.

## M2 timing reference

Historical timing reference only: these formulas must not reintroduce automatic
confirmation. The current owner-approved behavior requires explicit confirmation.

- Methods 2/4 use summed audio duration / rate * 2.25 + 750 ms speaking time;
  methods 1/3/5 use * 1.25 + 500 ms.
- Groups use 2-4 phrases and do not cross section/chapter boundaries; small
  remainders join the preceding group.
- Rapid speeds: 200, 267, 333, 400 WPM. Speaking time in 7/8 uses target-token count
  plus the default 500 ms allowance. Normal/section gaps default to 1000/2000 ms.
- Carry group members, current rapid step, and remaining timers into checkpoint
  designs when those methods are implemented; do not pretend M1 covers them.

## Checkpoint and failure contract

- Remember phrase, method/stage, cycle number, confirmed/planned cycles, phase,
  audio position, playback rate, and remaining speaking time.
- On loss of foreground activity, pause and freeze timers. Resume requires a tap.
- Resume unfinished audio from its saved position, not automatically from zero.
  Stage entry may replay an already-ended, unconfirmed pass as described above.
- Restoring a cycle does not increment its count. Inactive time is not study time.
- Normal pause checkpoints stopped state. A crash can recover only the last
  successfully persisted checkpoint, not an imaginary zero-loss shutdown event.
- A local-save failure pauses learning and displays an actionable alert. Routine
  saves, installs completing, and connectivity transitions do not need toasts.
- Audio failure keeps the same checkpoint available for retry.
- Packages must fully install and validate before practice. Package deletion must
  preserve learning history and must never remove unrelated device files.
- Local data can be lost on uninstall/clear-data; no cloud recovery is claimed in M1.

## Language XP and streaks

- In stages 1–10, each explicitly confirmed cycle earns its original source-member count: 1 XP
  for single units, 2/3/4 XP for full groups, and the actual count for a short
  remainder. Final Next and Repeat credit the originating unit once. Stages 11–16
  grant 3 XP for the single manual confirmation of each phrase.
- Audio ending, opening a screen, pausing, elapsed time and restoring practice
  earn no XP. New runs, stages and books continue earning without a daily limit;
  full-run completion no longer grants the former 10-XP bonus.
- Historical 0/10-XP awards and completion records remain unchanged. Existing
  checkpoints establish a zero-credit baseline; only subsequent confirmations
  earn new XP. A frontier per package version, stage and run prevents duplicate
  or stale saves from re-awarding observed cycles. Navigation adds independent
  per-unit observed counts while preserving the existing aggregate credit.
  Legacy lower units have lost their optional-cycle detail: they display a
  completed three-cycle baseline and their old credit remains conservatively
  fenced within that run. Fresh runs and unobserved units earn normally.
- Totals and levels are separate for each language. Sixteen stages still require
  three full runs each. Partial cycles do not add stage stars or unlock stages.
- Level 1 starts at zero XP. Levels 1–998 require
  `round(100 × 1.0053^(level − 1) / 10) × 10` XP for the next level, evaluated from
  the unrounded curve. Surplus carries forward. Level 999 begins at 3,669,390 XP
  and shows MAX with a full track. Total XP saturates at 2,147,483,647; further
  practice and completion history still persist. Level is not certified proficiency.
- A streak counts consecutive local dates with completed practice in that
  language, including zero-XP practice. Yesterday's streak stays visible today;
  missing an entire day breaks it. Restoring an old run creates no study day.
- XP, completion history, streak day, checkpoint and backup revision commit
  atomically to SQLite. Failed saves roll back together; retry awards once.
  Version-4 backups include ordered resume selection and durable confirmation
  identities, with conservative provenance for historical opaque credits.
  Version-1 through version-3 backups remain importable without retrospective credit. Bounded
  checkpoint arrays support up to 100,000 learning units within the 16 MiB backup
  envelope; oversize or inconsistent payloads are rejected before mutation.
  Same-account synchronization unions confirmed learning independently from the
  latest resume snapshot; an older location must not lower XP. Imported and
  retransmitted confirmations do not earn again. The active player's predecessor
  remains pinned until its next safe entry, even when a remote checkpoint wins.
- The day is captured at successful local save. Midnight/foreground refresh the
  browsing display without erasing history. Device-clock manipulation is not
  protected by an online authority in this local-only prototype.
- Normal awards and persistence are quiet: update the header and stage status,
  with no routine alerts. Only genuine storage/recovery failures need alerts.
- Reward rules cover all sixteen stages; M1 playback still implements only 1–2.

## Source navigation

Opening All Sentences expands the current section and centers the current source
row (the first member for a grouped unit), including near the start/end of the
list. User scrolling or accordion interaction cancels automatic positioning.

Selecting a source block targets its saved unit using the run's saved group
size. It pauses, resets the target audio to zero, and retains every visited
unit's confirmed and planned cycles. A jump, save retry or restored speaking
checkpoint never confirms a cycle. Options closing alone remains paused.
Unvisited units remain unfinished even when a later index has been selected.
Next at the end returns to an unfinished unit; completion requires all planned
cycles, including any opted-in extra practice. Progress counts completed units,
not all indices preceding the current cursor. Original v1/v2 checkpoint plan
versions remain valid; optional unitProgress records navigation state.

## Test seams approved by the milestone plan

1. Package installation: complete/verified versus unavailable; corrupt assets rejected.
2. Public player actions: listen, confirm, repeat, next, pause, resume.
3. Checkpoint save/reload: unfinished cycle, frozen timers, unique completion history.
4. Native verification: actual audio, app lifecycle, file storage, and SQLite on iPhone.

Unit tests verify the first three boundaries; they are not proof of native audio
or device persistence. A simulator or physical-device pass is reported separately.
