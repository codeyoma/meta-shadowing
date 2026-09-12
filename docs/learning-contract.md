# Native learning behavior

Fresh specification, not reused implementation. The approved reference is the
latest legacy behavior at be3761f, including its amended confirmation rules;
earlier planning documents can contain superseded behavior.

## Milestone boundary

M1 implements subtitle shadowing (method 1, stages 1 and 2), a controlled spoken
lesson, local package installation, and durable progress/resume on iPhone.
The full product retains eight methods and sixteen stages. Other methods,
dictionary, and sentence analysis are M2, clearly marked unavailable in M1.

## Eight methods / sixteen stages

Each method has two stages. The path advances sequentially: complete the current
stage's required full runs (two for 1–10, three for 11–16) before the next stage
unlocks. These are cumulative completion records, not phrase cycles; XP still
has its separate daily limits. Completed stages remain available for review.
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

- Normal enabled button taps provide a light native haptic and the owner-supplied
  soft tick. All three browsing tabs, including Settings, use this sound. Player
  footer buttons are haptic-only; options/settings/language controls and the
  decorative mascot remain quiet. Feedback never
  waits before the actual action, counts as learning, or changes speech speed;
  unavailable feedback fails silently. Rapid taps cannot stack sound players,
  and pending feedback is cancelled on app interruption.
- A phrase normally requires three confirmed cycles.
- End of audio is not itself confirmation: enter the speaking/confirmation phase.
- Confirmation is always explicit: elapsed time never confirms a speaking cycle.
  Legacy automatic settings/checkpoints become manual without resetting progress.
- Playback speed uses a 0.25–3× slider in 0.05× increments. New sessions use the
  saved preference; unfinished sessions retain their checkpoint's speed. The
  player options drawer can explicitly change that paused session's speed without
  changing the phrase, cycle, or saved audio position.
- Entering the player from a stage (new or restored) and each newly selected
  sentence wait one second before starting audio. Completed checks stay filled.
  Interrupted listening resumes at its saved audio position; an already-ended,
  unconfirmed speaking cycle replays its audio from zero on stage entry only.
  A completed three/five-cycle decision does not autoplay or advance. Repeated
  cycles of the same sentence do not add this delay. Opening options, leaving,
  or an app interruption cancels pending playback without confirming anything.
- After three confirmed cycles, wait for Repeat or Next.
- Repeat adds exactly two additional cycles. It never resets confirmed progress.
- Offer Repeat only at the initial three-cycle decision. At five cycles (and
  older saved longer sequences), show only Next; preserve all saved cycles.
- The player shows connected cycle nodes instead of a visible completion counter.
  The active outline follows actual media position/duration; audio ending fills
  the outline but does not check the node. The icon-only main action explicitly
  confirms, then starts the next cycle. During playback it is disabled.
- At the initial phrase decision, a recycle-icon Repeat action appears beside
  the main action in a 1:3 width ratio, without sideways footer animation.
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
  method level, speed, and a disabled sentence-analysis icon (analysis remains
  deferred). The level action pauses and opens a native learning-guide dialog
  identified by level and method; guidance content is intentionally empty for now.
- Next is available only after all currently planned cycles are confirmed.
- Moving to another phrase never confirms skipped practice.
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

## Language XP, daily book eligibility and streaks

- Each newly completed run earns 10 XP only when eligible. A book's first newly
  completed stage chooses its XP stage for that device-local calendar date.
- Stages 1–10 award XP for their first two runs that day; stages 11–16 for their
  first three. Other unlocked stages and extra runs remain playable without XP.
- Each book has its own daily allowance, stable across package versions. Totals
  and levels are separate for each language. Sixteen stages contain 38 required
  repetitions in total; this is not 38 rewards available on the same day.
- Level 1 starts at zero XP. The next-level requirement is 100 × 1.08^(level − 1),
  rounded to the nearest 10 XP: 100, 110, 120, 130, and so on. Surplus carries
  forward. There is no gameplay level cap; level is not a certified proficiency.
- A streak counts consecutive local dates with completed practice in that
  language, including zero-XP practice. Yesterday's streak stays visible today;
  missing an entire day breaks it. Restoring an old run creates no study day.
- XP, daily eligibility, completion history and the checkpoint commit atomically
  to SQLite. Retrying/reopening cannot award the same run twice. Existing history
  is preserved without retroactively inventing rewards.
- The day is captured at successful local save. Midnight/foreground refresh the
  browsing display without erasing history. Device-clock manipulation is not
  protected by an online authority in this local-only prototype.
- Normal awards and persistence are quiet: update the header and stage status,
  with no routine alerts. Only genuine storage/recovery failures need alerts.
- Reward rules cover all sixteen stages; M1 playback still implements only 1–2.

## Test seams approved by the milestone plan

1. Package installation: complete/verified versus unavailable; corrupt assets rejected.
2. Public player actions: listen, confirm, repeat, next, pause, resume.
3. Checkpoint save/reload: unfinished cycle, frozen timers, unique completion history.
4. Native verification: actual audio, app lifecycle, file storage, and SQLite on iPhone.

Unit tests verify the first three boundaries; they are not proof of native audio
or device persistence. A simulator or physical-device pass is reported separately.
