# Native learning behavior

Fresh specification, not reused implementation. The approved reference is the
latest legacy behavior at be3761f, including its amended confirmation rules;
earlier planning documents can contain superseded behavior.

## Swift free-package access — 2026-10-01

The active Swift product offers configured packages as free explicit downloads.
No StoreKit product, receipt, ownership or purchase restoration is required.
Practice and references still require the correct profile, stage policy and fully
validated installed package. Package identities, checkpoints, XP, settings and
optional private iCloud recovery remain unchanged. No download, access refresh,
relaunch or restoration confirms practice. Historical paid requirements below
apply only to the retained reference, not the current Swift app.

The Swift library screen/tab is “책장” (Bookshelf). Each installed card opens its
book's Stages tab; an undownloaded, desaturated card starts download or retries
failure. There are no separate Learn/Download buttons. The card's stage progress
row becomes transfer progress plus a percentage while acquisition/installation is
busy, then returns to stage progress after successful installation without
automatically starting learning. A separate top-right ellipsis menu cancels active
transfers or requests confirmed download-only removal. Bundled/uninstalled cards
cannot be deleted. Download removal retains the card, checkpoints, XP and settings.
Selecting an installed book keeps the bookshelf's normal appearance while the
selection is saved; it does not briefly dim the entire library. Repeated taps are
blocked while saving, and the Stages tab opens only after a successful commit.

## Current stage expansion — 2026-09-20

### Video packages — stages 1–16

Owner-approved fullscreen extension (2026-10-10, #129–#132): stages 1–10 retain
the same native player, saved unit, cycles, rate and explicit-confirmation rules.
Portrait keeps fixed video above the whole unit. Only the fullscreen button
requests landscape; only the exit-fullscreen button returns to portrait during
learning. Physical rotation alone does neither. Leaving, completing or losing
access to the lesson releases its orientation policy and restores portrait browsing.
The video uses its original aspect ratio without cropping. Learning actions and
cycle feedback remain visible. Landscape captions show the actual active source
member over the video, preserving paired translation, hints, reveal visibility,
fonts and accessibility. Long captions scroll without moving the controls. A
pending/cancelled native member seek cannot publish the next member prematurely;
the last selected member remains visible after playback ends. Presentation changes
never confirm work, award XP, replace the runtime or reset its position.
The landscape toolbar exposes separate learning-options, method-guide, speed,
fullscreen text-size, sentence-analysis and exit-fullscreen controls. Opening an
option pauses/checkpoints first; exiting fullscreen is presentation-only. Dismissal
returns to paused landscape learning. Audio and silent stages remain portrait. See the
[approved fullscreen specification](superpowers/specs/2026-10-10-native-video-fullscreen-design.md)
for scope; simulator results do not establish physical rotation-lock acceptance.

The normal learning header shows main options, `Lv N`, speed, typography, group size when
applicable, then sentence analysis in one row. A full-width progress row with the
current/total counter sits underneath, without a book title. This shared header
applies to audio, video and silent learning.
Normal header controls keep 44-point circular frames; remaining width becomes equal
spacing between controls, and neighboring glass surfaces stay visually separate.
Normal media-speed and group-size controls use the same speedometer and stack
icons as fullscreen. Current values remain available in their popovers and
accessibility descriptions; silent practice keeps the `S1`–`S4` label.
Both normal and fullscreen method-guide buttons use `Lv N`
without an icon. Normal media speed and normal/fullscreen typography controls open
compact, button-anchored native popovers instead of full sheets. Group-size
popovers appear only in grouped stages 7–10: between typography and analysis in normal
audio/video learning and fullscreen video. Both typography popovers edit the shared
original/translation font families and the current presentation's separate sizes.
Font reset applies to both presentations; size reset affects only the selected one.
The same controls and save boundary serve the full settings page and both popovers.
The 2/3/4 choices edit the active run, not future-run defaults. Outside taps or the
close button dismiss the popover without resuming. General options, the method
guide, sentence analysis and silent-stage reveal speed retain their sheets. All
editors share the existing save/retry boundary. Removing either header cancels
pending popover presentation, including when its initial pause/save has not finished.

Owner-approved fullscreen presentation refinement (2026-10-10): the video remains
behind the controls and captions, without a separate bottom footer or opaque text
card. Centered white captions use a shadow and a compact translucent black backing;
the two bottom thumb lanes stay clear of caption text. The existing learning action
is a compact button, with cycle dots directly above it and Repeat alongside when
eligible. The main action stays anchored 4 pt inside the safe-area edge, including
when Repeat appears or three cycle dots become five. Repeat and extra dots expand
inward: to the left at the right dock and to the right at the left dock. The group
starts at the bottom right, follows horizontal dragging, and
snaps to the nearest bottom edge using the gesture's projected end. It never moves
vertically. A drag cancels a pending button press and cannot confirm practice.
Accessible left/right actions provide the same positioning without dragging.
The side choice lasts for the mounted lesson, including fullscreen exit/reentry;
it is not a saved profile preference. No separate play/pause button or automatic
control hiding is added. Portrait controls and learning semantics are unchanged.

Fullscreen original and translated text sizes are separate profile preferences,
edited from the fullscreen toolbar without changing normal-screen sizes. Both use
the existing 12–48 range, native text scaling and separate 20/18 reset; font families
remain shared. Older stored preferences seed the fullscreen values from their
previous video/list sizes once when decoded, then edits and resets remain independent.
Both pairs survive local reopening and backup restore under the same profile
boundary. Older clients that reject the new preference fields need updating before
importing those backups; no CloudKit service acceptance is implied by local tests.

Video stages 1–6 play one bounded source phrase; stages 7–10 play the saved
unit's ordered source segments on one native player. Owner amendment (2026-10-10):
overlapping or touching video intervals play continuously, without a member-boundary
pause or seek. Shared source time plays once, and captions switch to the later member
at its original start. Single-phrase practice retains its original start and end;
no source timestamps or media bytes are rewritten. Starts must increase and ends
must not move backward. Intervening disconnected source gaps are still skipped,
without an extra confirmation, cycle, delay or reward. Native position and duration
count selected time once, excluding both duplicated overlap and source gaps. A checkpoint exactly
at a member boundary resumes the next included member, not the excluded gap.
Single-member stage-one checkpoints retain their existing meaning.

Group size comes from the saved run, including a separate short final unit.
The final member holds its decoded frame until confirmation; replay starts at
the first member. Speed, paired subtitles, first-word hints in 5–6/9–10,
three-cycle confirmation, Repeat +2 and per-member XP follow the rules below.
Only the video supplies original audio. Pausing or replacing a unit cancels
pending member transitions; stale callbacks cannot resume or finish it.
Video packages also support silent stages 11–16 using their finalized text and
the shared reveal behavior below. These stages never create or dispose native
video/audio playback resources and display no video or thumbnail. Expanded
physical-device interruption/monitoring acceptance remains in #70.

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
  progress. The preset editor's reset action restores 150/200/250/300 WPM and
  discards unfinished numeric input. Editing or resetting global WPM presets does not silently alter an existing run;
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
  The explicit analysis screen can disclose the full target text at any time. All-sentences
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

Fresh grouped runs save their source count and group size. Global Settings sets
the default for fresh runs. The learning menu displays the active run's actual
size and applies an explicit change immediately (owner update, 2026-09-24).
Regrouping creates a new immutable plan identity, retains completed/optional
cycles per source sentence, and leaves all prior XP receipts intact. The new
current group contains the previous group's first source; playback resets to
zero and stays paused. Completed groups are skipped in favor of unfinished work.
When a new group mixes completed and unfinished sentences, completed sentences
may be replayed as context but need no further confirmations or XP. Each pass
advances only unfinished members; its receipt records that actual member count.
Sources already complete when a plan is regrouped stay closed, including when
Repeat adds two optional passes for the remaining members. Regrouped plans retain
the original reward lineage and record each confirmed source/cycle identity.
Concurrent devices may choose different group sizes, but overlapping source
confirmations and completed-run counts contribute only once within that lineage.
Per-plan accounting stays intact for backup validation; visible XP subtracts
overlapping source receipts before applying the language cap. Historical opaque
credits remain preserved, and genuinely new runs have independent lineages.
Changing size alone grants no XP or stage completion. Repeated size changes,
navigation, restoration and backup merging preserve the same source work.
The menu's per-run size does not silently overwrite the global default, matching
the existing per-run playback-rate editor. A changed source count or incompatible
checkpoint is rejected. Existing stage 1/2 progress is preserved. Older app
versions cannot import the new backup fields; update syncing devices before using them.

The accessible “자막 보기” toggle above playback reveals only the current unit.
Hidden target text retains all characters and layout:
non-hint text uses the actual card background color, then fades to normal ink when
revealed. Translations remain visible in both states. The right-aligned toggle has
a minimum 44pt touch area; Reduce Motion disables its text fade. Hidden text is not
selectable and its accessibility label exposes hints only.
Both bubble and list modes place each source member's translation immediately
below that member, before the next source member. The large display previews and
the segmented picker both select the same saved display preference. Bubble mode
alternates utterance pairs between the leading and trailing sides like a chat.
Settings previews and the player share this layout and typography. List mode has
one padded, rounded card around the entire current unit, with no per-utterance
cards, and reads as continuous, left-aligned paragraphs.
While a video surface is present, the player and its settings previews always use
list mode without overwriting the saved preference. Silent stages without video
continue to honor the saved layout.
List mode renders only the current saved learning unit, with all its paired
utterances in one left-aligned vertical list. It is not a scrollable lesson index;
the separate all-sentences option remains the navigation surface. Long current
content scrolls using the outer player screen, without an inner fixed-height list.
The Settings and in-practice menus offer a separate “폰트 설정” editor for
profile-wide original and translation font and size preferences. “학습 화면”
edits only the bubble/list layout. Integer sizes from 12 through 48 apply and save
immediately, with one-unit minus/plus controls and numeric input committed when
editing ends. Keystrokes remain drafts so invalid prefixes cannot be saved. Invalid drafts
never replace a saved size. Reset writes 20/18 immediately; new empty profiles
start at those sizes. Legacy profiles without explicit sizes retain each existing
layout's appearance until customized. Merely opening an editor does not migrate
them. The fixed bilingual preview contains no lesson text.
These preferences affect only active phrases/translations in stages 1–16 and the
explicit preview. iOS text scaling applies once to the chosen base size; learning
content wraps and scrolls without changing fixed video, header, or footer layout.
Typography updates do not restart the player, alter checkpoints, speeds or reveal
visibility, or award progress. Preferences use the existing local-first,
profile-isolated storage and opt-in private iCloud synchronization. Font selection
uses independent original/translation choices: System, Rounded, Serif, Avenir
Next, Georgia and Apple SD Gothic Neo. Only available built-in faces are offered;
there are no font downloads or user-installed-font enumeration. Named fonts use
their verified regular face, and the system designs use React Native's native
system-design aliases. Unsupported glyphs use the operating system's fallback;
Korean letterforms are not promised to differ for every choice.
Font taps save/apply immediately. Font reset writes System for both languages,
without resetting sizes. New empty profiles start with System; absent font fields
in existing profiles retain their prior appearance until customized. An unavailable
saved choice renders as System without replacing the stored identifier. Only the
active learning text and fixed bilingual preview receive the font, never menu or
reference text. The same checkpoint, accessibility and synchronization boundaries
as size edits apply. See [font verification](learning-font-verification.md).
Global data deletion retains its empty-preference semantics;
the size-reset control is the explicit 20/18 reset. See
[size verification](learning-text-size-verification.md).
Revealing never plays, pauses, confirms, or changes
cycles. Reveal state resets when the unit/run changes and on player re-entry.
Analysis derives the current saved unit, including ordered source members for grouped
practice. Owner update for #84 explicitly permits full target-language reference
text even during incomplete reveal or hint-only practice. The learning screen's
own visibility and dictionary-tap gates remain unchanged. Analysis requires the
current profile, run, unit, stage access and installed package authorization.

## Sentence analysis — #84

The analysis icon pauses/checkpoints and opens “문장 분석” for the current learning
unit. Exactly one grammatical sentence opens its target-text/POS detail directly;
Back dismisses the sheet to the paused learning screen. Multiple sentences retain
the selection menu, and detail Back returns to that menu. List and detail use the
same “문장 분석” title. Close leaves learning paused. This reference interaction
never confirms practice, awards XP or changes the learning cursor.
List-to-detail navigation uses the same native push/pop transition as learning
options. The parent sheet retains one header, synchronized after button or native
edge-swipe back navigation. Reduced Motion uses a fade instead of sliding.

Read installed syntax offline through the native delivery boundary. Download,
re-download and update installation verify all pinned bytes and hashes before
publication. Learning checks publication evidence, access, profile and current
session without repeating whole-package integrity checks. Requested files must
still pass safe bounded reads and parsing; deletion or invalid publication evidence
cannot grant access. Syntax schema/language, source identities, normalized source
alignment, UTF16 offsets, token coverage and sentence-local dependency indices
are verified before display.
Use the analysis text for offsets rather than the manifest's whitespace layout.
Absent, corrupt, incompatible or unauthorized analysis has a dismissible unavailable
state. No network analysis service or inferred phrase spans are introduced.

Newly prepared internal free test packages may include pinned syntax metadata;
existing immutable installations are not silently rewritten or re-fingerprinted.
The synthetic development lab exercises the shared list/detail UI without granting
access to any real package. The #85 detail shows a horizontally scrollable token
graph. All non-root relationships appear as curves on the first measured layout,
without requiring a token selection. All incoming and outgoing connections share
one set of distinct, evenly spaced points across each word; a departure never
reuses an arrival's position. Points follow the opposite words' horizontal order
and remain stable when selection changes. Lowercase source relation
labels sit above their curves; measured labels use separate positions when nested
curves would otherwise place them on top of each other.
Transparent word-length controls show no visible ordinal or card border.
The direction explanation stays above the graph; redundant scrolling and self-arrow
instructions are omitted. Each word's POS appears in Korean with a lowercase English
name beneath it. A non-interactive horizontal position indicator remains visible
while the graph overflows, including when idle, and hides when all content fits.
Selecting a token uses the primary accent for that word, link color for its direct
head/dependents, and dims other curves to gray; selecting
it again restores the overview. Display arrows run from the dependent (from) to
the head (to), with a small filled triangular arrowhead only at the destination and
source relation labels and Korean explanations below the selected word. Each
arrow is rendered as one filled outline: its shaft meets the triangle at the base,
without a full-width stroke continuing underneath the taper, including when selected.
Inactive arrows use one consistent secondary color across the complete outline. The source
head/dependent data stays unchanged. Labels describe the starting word's role;
subject, object and auxiliary relations are not described as modifiers. Token
indices preserve repeated-word identity. ROOT has no self-arrow; unknown labels
retain their source label identity without an inferred grammatical classification.
Relation abbreviations use lowercase in the presentation, including root; stored
labels are unchanged. Selected-word details omit the redundant connection heading.
Sentence changes clear selection. Word buttons expose selected state and connected
status for accessibility; text and graph scroll at large Dynamic Type sizes.
These reference interactions have no learning-state write capability. No phrase
spans or cross-sentence edges are inferred. Embedded dictionary content remains #86.

App Store stage access still requires three real predecessor completions.
Development and verified TestFlight builds may select any implemented stage;
unverified, unavailable, failed, or timed-out distribution checks remain locked.
The map and direct player route use the same policy. Verified local installation
remains required; Swift access has no purchase-ownership gate. Test access never
writes completion records.

## Word lookup — stages 1–16

A single tap on a visible original or translated word opens Apple's system
dictionary sheet. The player pauses and durably saves first; dismissal leaves
the same unit, media position, cycles, speed, hint visibility and scroll position
paused. Lookup never confirms practice or earns XP. Footer and headphone actions
are blocked until the sheet is gone. Save failures use the existing recovery;
presentation failures leave the saved learning state paused.

Only fully visible words are eligible. Hidden hints have neither lookup handlers
nor accessibility lookup actions. VoiceOver exposes per-word actions on the
visible text, and dismissal returns focus to that text. Apple word tokenization
handles scripts without spaces; punctuation and whitespace are not targets.
Current fonts, sizes and line layout remain unchanged.

Definitions depend on dictionaries installed in Settings > General > Dictionary.
Missing results are normal and dismissible. The app does not extract, cache,
republish or log definitions, and adds no dictionary service. Backgrounding,
navigation and access/profile changes invalidate pending lookup. Existing voice
capture may continue through this temporary sheet, but lookup starts no capture.
The owner-amended presentation (2026-09-26) retains Apple's dictionary interface
inside a native full-height form sheet with the system grabber. The app-owned
navigation bar is hidden: the owner removed both its duplicate controls and the
remaining empty header space. Only Apple's title and close control remain.
Dragging the system grabber dismisses the sheet; cancelling a short drag leaves
it open. A thin adaptive gray outline follows the
sheet's upper edge and rounded corners without intercepting touches.
The fixed bottom “학습 이어하기”
action also dismisses to the same paused lesson. UIKit owns drag tracking,
cancellation and dismissal animation. No custom pan recognizer or private
system-view modification is used. This supersedes the added navigation-header
drag surface; it does not change gesture behavior inside Apple's own title row.
Silent stages 11–16 enable lookup only after the complete phrase has finished
revealing and the existing Next action is enabled. Busy, error, foreground,
access and current-unit checks are revalidated before presentation. Incomplete
reveals, including paused reveals and a finished first language while the second
is still appearing, have no word handlers or accessibility lookup actions.
Touches neither pause the silent clock nor write progress or queue lookup.
Stages 11–14 retain their original language order and expose both visible
languages; stages 15–16 expose translation only, never the hidden original.
Dictionary dismissal preserves the completed phrase, S level and WPM with Next
still available. It never starts playback, confirms a cycle or earns XP. The next
phrase begins with lookup disabled again. No native media transport is created.
See [dictionary verification](learning-dictionary-verification.md) for measured
results and remaining device acceptance.

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

Swift-only owner amendment, 2026-09-30: previously enabled live voice monitoring
may recover after a system-permitted interruption end, once the lesson is
foreground, the menu is closed, permission is granted and the wired route is
still valid. Manual OFF, route loss, access loss, completion and exit cancel
recovery. Learning playback still requires explicit Resume. The Expo reference's
original interruption policy below is unchanged; see the detailed
[native media contract](swift-native/media-feedback-contract.md#wired-monitoring-and-headset-actions).

Swift-only owner amendment, 2026-10-01: the device-local microphone control spans
0...2, reaching eightfold microphone amplitude at 2 (twice the previous maximum).
Existing saved values in 0...1, mute and the default 0.25 retain their previous
amplitude. Original lesson playback bypasses this gain path. The Expo reference
retains its fourfold boost and 0...1 control; processing and validation details
remain in the native media contract linked above.

- Live voice monitoring is available in Debug and Release. It starts automatically
  in an eligible foreground lesson when wired headphones connect, or on entry already connected,
  after microphone permission. Manual OFF is retained until unplug/replug or a
  new lesson. Menus/background/lock preserve existing capture; they do not start
  new capture in the background. Exit, completion, access loss, interruption or
  unsupported output stops capture. Only a first permission-sheet cancellation
  may retry once after grant, never an audio interruption. Microphone-only gain
  leaves original playback and XP unchanged; no recording or transmission.
- A wired headphone's center transport button invokes the visible player's main
  action (resume, explicit confirmation, or next), using the same access, busy,
  checkpoint and XP guards. It cannot skip unfinished playback/reveal, recover
  errors, or act while a menu is open or the app is inactive. Duplicate/stale
  commands are discarded. iOS play, pause and toggle transport commands share
  this binding, including Control Center when wired headphones are connected.
  The mounted lesson publishes generic Now Playing metadata and owns transport
  handlers through temporary menus; leaving/completing releases them. Restoring
  transport ownership never starts microphone capture or learning playback.
  Other apps can take system audio ownership; actual headset dispatch remains a
  physical-device acceptance check, especially for silent stages without capture.
- A quick double-press of the wired EarPods center button maps iOS next-track to
  the existing Repeat action, only after third-cycle audio has ended and Repeat
  is actionable. It confirms cycle three and adds exactly cycles four and five,
  without advancing the phrase or pre-awarding their XP. Single-press remains
  Confirm/Next. Both actions share the same one-shot revision gate. Next-track
  is consumed without action during playback, menus, inactive state, errors,
  unsupported routes, extra cycles and silent stages 11–16; it never falls back
  to the main action. Control Center next-track uses the same binding while the
  lesson owns transport. No app-level double-click timer or single-press delay.
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
  All playback-speed editors reuse one rate control: the “배속”
  heading, native slider snapping in 0.25× increments, twelve visible quarter-step
  marks below the slider, and the current rate on its right. The settings heading sits
  outside the card. The value column reserves four numeric characters plus `×`
  at the current Dynamic Type size, so rate edits cannot resize the slider or ticks.
  The settings preference and paused-session rate keep their separate
  persistence scopes; sharing the layout must not overwrite either implicitly.
- Selecting a stage keeps the current Stages screen visible while its lesson is
  prepared. Only a ready, authorized lesson presents the player; no intermediate
  preparing screen is shown. Repeated taps share one preparation. Tab/book changes,
  backgrounding and profile changes cancel unpresented work, including a ready
  route awaiting appearance. Late results or old dismissal callbacks cannot open
  or cancel a replacement lesson. Failure stays on Stages with an actionable error.
  Prepared runtimes start with media/monitoring interaction gated; appearance
  releases that gate once, without consuming automatic wired-monitoring intent.
  Remote commands, Now Playing metadata and their audio-session lease also begin
  only after appearance. Cancelling an unpresented lesson leaves other playback
  ownership untouched.
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
  each node leaves clearance for its stroke inside the clipped timeline bounds,
  including partial/full active rings and the first/last nodes.
  explicit confirmation animates the check, then fills the line to the next node.
  Phrase-content transitions affect only the central sentence card. The footer
  has no separator line.
  Back navigation and app interruptions still pause and save; no separate pause
  or restart button is shown. Icon controls retain accessible names and recovery.
- Swift browsing tab activation and opening an available stage produce one light
  native impact. Programmatic routing from Library to Stages and disabled stage
  activation produce no impact. Stage rows show three check circles instead of a
  numeric fraction: each confirmed full run turns one check green, capped at three.
  These are stage-run completions, not the player's per-sentence cycles. The row's
  accessible value retains the completion count, resume position and locked state.
- Player navigation opens a native options drawer instead of immediately going
  back. It pauses/checkpoints first and offers speed, return, and a Cardinal
  “스테이지로 돌아가기” action. Closing the drawer never automatically resumes.
  The drawer body uses an iOS native stack for menu-to-option push/pop transitions,
  with platform timing and interactive back swipe. Reduced Motion uses a fade.
  Owner update 2026-10-07: the drawer always opens at the full native sheet height,
  including the menu and nested options, with no half-height state. Each page has
  one close control; it and a downward swipe dismiss the entire drawer, including
  from a nested option. “스테이지로 돌아가기” is an action row in the options list
  rather than a fixed footer, and there is no separate continue button. A failed
  save keeps an actionable retry visible on every page. Back returns to the menu.
  A directly opened speed editor returns to the menu without dismissing the sheet.
  The player options button sits at the upper left, replacing the separate player
  close button. The options list retains the stage exit during loading or errors.
  Stage exit stops and retires learning before returning, while retaining the
  outgoing player and options presentation until dismissal. It must not replace
  that content with the initial preparing screen. Dismissal then releases the
  retained display; repeated exit taps cannot start another exit operation.
  Opening it while loading leaves the eventual lesson paused, even if dismissed
  before loading finishes. Failed saves still block lesson edits until retried.
  Option subtitles reflect active rate/group size, the current silent-speed level,
  saved presets/fonts, and the effective video-forced list layout.
  Owner update 2026-10-10: the upper row contains only main options, method level,
  speed, typography, grouped-stage size when applicable, and sentence analysis. The book title
  is not displayed. A separate row directly beneath spans the content width with
  progress and a counter aligned to the right content margin. Its completed fill
  uses the primary-action color, without changing its meaning from completed
  learning units to XP. Native text measurement reserves both digit slots
  from the total phrase count with tabular numerals, so the track stays the same
  width when the current phrase crosses a digit boundary. One shared top bar owns
  both rows; every option retains a distinct touch area of at least 44 points,
  including grouped stages on narrow screens. Level/speed labels remain single-line
  at large text sizes and support the large-content viewer, and main
  action symbols reserve the same text-scaled height across playback states.
  These controls never move with the scrolling phrase content. As requested
  in the #57 UI refinement, the level and analysis actions pause/checkpoint and
  open native drawers. The guide identifies the level and method; detailed
  guidance is intentionally empty for now. The analysis drawer shows the current
  sentence menu and target-text/POS detail described in #84 above when installed
  syntax is available; missing analysis has an explicit unavailable message.
  Short learning content is vertically centered in the reading area between the
  fixed upper controls (and video when present) and bottom controls. Oversized
  content starts at the top and remains scrollable without moving those controls.
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
  The main button displays only its state icon for Confirm, Resume, Next and
  disabled Playing, retaining accessible names and touch targets. Error recovery
  labels and all confirmation rules remain unchanged.
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
- The Swift player's transient committed-XP receipt is a transparent toast at a
  random horizontal and vertical position chosen once for each receipt. It stays
  inside the current content viewport, clear of the top tools and bottom cycle/action
  strip, and clamps to the new bounds on rotation. Audio lessons use adaptive primary
  ink; video lessons use white text with a dark shadow over both inline and fullscreen
  video. There is no background or border. It starts fading as soon
  as its position is measured and disappears in 0.5 seconds, without a hold.
  It stays within the available width and never intercepts touches.
  There is no permanently reserved XP area above the cycles. The toast briefly
  overlays the lesson without moving its text or controls or intercepting touches.
  This transient decoration caps its visual text scaling at XXXL; its complete
  award remains available in the accessibility label and announcement.
  Reduce Motion retains a stationary fade with no scale or travel. Final-run
  feedback uses the last action position after the footer disappears. Existing
  receipt identity, announcements, cancellation and durable reward rules remain.
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
