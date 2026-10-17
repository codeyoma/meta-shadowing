# Stage detail redesign and accumulated study time

Date: 2026-10-16
Status: Approved by the owner on 2026-10-16. Implementation, local verification, and the single independent review's two Important corrections are complete. Owner acceptance and a separately authorized full pre-push/PR gate remain pending.

## Intent and confirmed decisions

Replace the native app's stage-list presentation with the owner's supplied book-detail layout. Change the actual app only; leave the Figma file unchanged.

The new page has a large cover, book title, three statistics, a prominent continuation action, three practice-family tabs, a family completion ring, and expandable stage guidance. Keep the existing sixteen stage identities, access policy, three-run completion requirement, checkpoints, learning behavior, and explicit confirmation rules.

The owner explicitly requests persistent accumulated study time. This means time spent in the foreground learning screen, not media duration or confirmed practice time. Reading, paused learning, silent practice, and landscape video count. Options, popovers, the dictionary, and sentence analysis do not count. Background, screen lock, and leaving learning do not count. Historical study time must not be inferred from existing XP, completions, checkpoints, or media positions.

## Recommended approach and alternatives

Use a dedicated study-time recorder owned by the presented learning flow, with monotonic elapsed measurement and an independent SQLite persistence boundary. Keep the reward reducer and media clocks unchanged.

Two simpler alternatives are rejected:

- Saving only on exit creates an unnecessarily large crash-loss window. Persist every ten eligible seconds and at exclusion/exit boundaries instead.
- Adding elapsed time to the learning checkpoint conflates display time with learning progress. Checkpoint restore, navigation, regrouping, and backup conflict resolution must not create or replay time.

A global preferences counter is also unsuitable: it cannot cleanly isolate books and profiles, retain time across download replacement, or safely merge duplicate backups.

The owner approved the engineering choices below before implementation planning.

## Scope and non-goals

- Swift/SwiftUI app only, with iOS 26 deployment minimum and iOS 27 Simulator verification.
- Reuse the installed/bundled artwork already available to the app. Do not invent remote covers or content metadata.
- No new backend, Supabase access, live cloud mutation, public content publication, account setup, physical-device installation, or release.
- Preserve existing bottom browsing tabs; the screenshot supplies the stage content layout, not a request to remove app navigation.
- Include time in the existing local backup representation and optional private-sync payload. Do not add a new cloud service or upload path. Hosted/device synchronization acceptance remains separate from local merge tests.
- No idle detector, camera/microphone inference, activity scoring, daily goal, XP rule, or automatic confirmation.
- Remaining on an eligible but untouched learning screen counts, because the requested metric is screen dwell time.
- Do not commit, push, open a PR, or modify the existing unrelated changes without a separate request.

## Stage screen

### Page structure

One vertically scrolling book-detail page replaces the current eight level sections:

1. A full-width cover extending from the screen's top edge behind the status and navigation bars, fading into the semantic page background at its bottom. Fixed floating navigation controls overlay it without a full-width bar background or scroll-edge blur: Back on the left and one level/XP/streak capsule on the right. The entire capsule opens the existing XP popover. Bookshelf retains its existing separate XP and streak presentation; the cover has no separate controls (owner amendments on 2026-10-16).
2. Practice-family/language label and wrapping book title, starting midway through the cover's bottom fade. Reserve the text block's full intrinsic height before the statistics, including long titles and accessibility text.
3. A three-column statistics card: source sentence/block count, accumulated study time, and completed-stage percentage.
4. A yellow continuation action using the eligible saved checkpoint or the next available stage.
5. Selected-family heading, a truthful one-line method description, and completed stages out of that family's total in a ring.
6. A native segmented control for the three families.
7. The selected family's eager stage rows, including separated launch and disclosure actions, three completion marks, and expandable guidance.

The main continuation action and the individual stage launch actions use the existing ready-before-presentation route. Preparing remains on Stages; no intermediate loading screen is reintroduced. Repeated taps remain guarded.

Back switches to Bookshelf, without clearing the selected book or learning history. The cover has no back or ellipsis overlay. Existing confirmed download-management behavior remains available through the Bookshelf card menu; no history-deletion action is added. An unavailable book retains its statistics/history and an actionable recovery state; practice stays unavailable.

### Families and identities

| Family | Existing stages | Completion ring denominator |
| --- | --- | --- |
| 쉐도잉 | 1–6 | 6 |
| 다구간 쉐도잉 | 7–10 | 4 |
| 크레이지 스피킹 | 11–16 | 6 |

The first family uses the reference's visible row labels: 쉐도잉 1/2, 순간암기 1/2, and 무자막 순간 1/2. Other labels describe their existing grouped or silent language-order methods. Display names do not renumber stages or change their actual learning flow. Guidance must describe implemented behavior, not imply that an unimplemented behavior exists because of a new label.

Each ring counts stages with at least three confirmed complete runs. The book percentage is completed stages divided by sixteen, formatted as a whole percent. Partial units, an expanded guide, and study time do not complete a stage or fill a completion mark.

Use the latest eligible unfinished checkpoint for this book when available. Otherwise use the first available incomplete stage. If all stages are complete, offer review rather than suggesting an unfinished checkpoint. Preserve stage access checks for every route, including the large continuation action. Counters use the stage plan's unit counts, including grouped remainders; never substitute the source count for a grouped checkpoint.

Select the continuation stage's family on initial book presentation. Keep family/disclosure selection local to this mounted page and reset it when the selected book changes. Tapping the row title, completion area or chevron toggles guidance; keep at most one guide expanded. Only the circular play control launches that row's practice. Stage launch does not depend on expanding a guide. Do not nest buttons. Rows retain the same raised background whether collapsed or expanded (white in light appearance); the full-width expanded guidance matches the family selector's unselected background, using the adaptive tertiary system fill over the page background in both appearances. Do not force white backgrounds in dark appearance.

### Display and accessibility

- Accordion taps use a 200 ms ease-out for expansion/collapse, guidance opacity and chevron rotation. Repeated taps retarget the current animation. Reduce Motion keeps only the fade; layout and chevron state change without travel. Do not animate unrelated family changes or progress refreshes.
- Reuse semantic backgrounds, brand yellow/ink/green, native controls, and SF Symbols.
- Adapt the supplied light reference to dark appearance without forcing the app into light mode.
- Preserve safe areas, a minimum 44-point target, VoiceOver labels/values, and Reduce Motion behavior.
- Large titles and long book names wrap. Accessibility text sizes stack statistics, family controls and stage-row content rather than letting a wide row expand and clip the whole page.
- Keep selected family rows eager; the current app deliberately avoids lazy rows that disappeared from accessibility on iOS 27.
- Use an accessible full duration value even when the visible time is compact.
- Visible duration: `0분` at zero, `1분 미만` below one minute, `N분` below one hour, and `N시간 M분` thereafter. Store precision independently of formatting; do not round up unstudied minutes.

## Measurement contract

The recorder is eligible only when all of these conditions hold:

- Its exact lesson route has appeared, and the learning scene is active.
- A valid, authorized runtime for the current profile/book is presented.
- The session is not complete, closing, invalidated, or displaying a loading/error replacement.
- No options opening, sheet, quick-setting popover, dictionary request/presentation, or analysis is active.

Playback paused versus running does not affect eligibility. The one-second entry/inter-phrase delay counts once the actual ready learning screen is presented. Preparing the lesson on Stages does not count. The completion page does not count.

Start an eligible interval using an injected monotonic clock. At a state boundary, capture elapsed time synchronously before starting any asynchronous save or teardown. Close that interval exactly once. Restart from a fresh anchor only when eligibility returns. Do not restore an open monotonic interval across process launches or use wall-clock differences to reconstruct unattended time.

Time exclusion begins at the accepted option/dictionary-open request, including pause/save and presentation preparation. It lasts through dismissal. If presentation is cancelled or fails, recompute eligibility after settling. Returning from a tool resumes the dwell recorder when eligible but does not resume media.

Count portrait-to-fullscreen changes as one continuous lesson visit, not two independent timers. Repeated appearance callbacks, state notifications, or overlapping cleanup paths must not allocate duplicate recording ownership. Stop synchronously before service/profile boundaries, access invalidation, completion, and route teardown. A late callback from an old route cannot restart recording.

Use integer milliseconds for durable amounts, with monotonic sub-millisecond remainder retained within the mounted recorder. No per-second UI publication is required. A single cancellable task checkpoints after each ten seconds of eligible time. Exclusion and normal exit flush the remaining measured amount. The periodic task never advances time by counting timer ticks; it measures actual eligible intervals.

Successful periodic writes bound normal forced-termination loss to the currently uncommitted interval, approximately ten seconds. Scheduling delays and failed writes can increase that window; do not claim guaranteed zero-loss termination. Never extrapolate through a process that has stopped.

## Durable storage and backup

### Identity and ownership

Accumulate by profile, canonical language, and stable book identity, across package versions, stages, and repeat runs. Use the actual lesson scope as write authority; an arbitrary UI-provided identity cannot redirect writes. Download removal retains time. Existing profile/history deletion clears it through the same authorized reset boundary as other learning history.

Keep writes inside SQLite transactions. Validate the active writer/profile generation and reset state in the transaction, not only before awaiting it. The existing checkpoint predecessor and duplicate-command rules remain untouched.

For compact, repeat-safe backups, persist one monotonically increasing counter per local database replica and logical book. Replica identity is local, random, profile-isolated, and not an account or hardware identifier. A restore into a different database retains imported counters but uses that database's own identity for future measurements.

An independent local recording lease has a unique visit token and a nondecreasing cumulative measured value. SQLite applies only the increase over that visit's already accepted value, atomically with its book counter. Retrying a write with the same cumulative value adds nothing; a lower/out-of-order value cannot reduce or replay time. Retire the lease before its writer is revoked. Leases and timer anchors are not restored from backup. Do not retain an ever-growing row for every periodic tick or foreground visit.

### Schema and wire compatibility

- Add an explicit SQLite migration after current schema version 2. Preserve all current rows and reject unsupported future schemas before mutation.
- Add validated time-counter records to a new backup envelope version, following the current version-4 progress/version-5 reset envelope. Preserve the existing progress representation and reset generation semantics inside it.
- Existing version-1 through version-5 imports contribute zero time, without changing their old learning records.
- Merge counters with the same replica/book key by maximum, and sum different replica counters for display. Never sum the same counter twice. Preserve commutativity, associativity, and idempotence.
- Preserve the existing payload-size limit and exact-integer validation. Reject invalid identity, negative/noninteger/overflowing durations, conflicting identity records, and oversized payloads before any durable change.
- An older client may reject the new backup version. Do not silently strip time to create a falsely compatible backup; document the update requirement.
- Include time in `hasLearningData`, local restore eligibility, reset handling, backup revision publication, and migration tests.
- No production CloudKit records or account state are touched while implementing or testing the local representation.

### Failure handling

A time-save failure retains the measured cumulative value for idempotent retry. Never mark unsaved time as durable or silently convert it into XP/progress. Surface a quiet but actionable retry error and preserve the existing learning-save safeguards. Normal saves remain silent.

An explicit exit may proceed only after the pending time has been saved or the user explicitly chooses to leave without the unsaved amount. Profile/reset boundaries must not transfer pending time into another profile or resurrect deleted time. Existing progress-save failures continue to block unsafe edits independently.

## Responsibilities and integration points

- `LearningDomain`: validated study-time identity/counter/receipt values and backup validation/merge rules, independent of UI/media.
- `LearningPersistence`: migration, transactional counter updates, recording leases, reads, backup/restore/reset integration.
- `AppFoundation`: workspace-authorized recording and book-summary projection; no filesystem work from a SwiftUI body.
- `LearningFlow`: one recorder for the exact presented lesson; eligibility changes for tools, access, service boundaries, and closing.
- `LearningPlayerView`: actual appearance/scene state and completed/error presentation signals; no duplicate timer in video subviews.
- `StagePathView` and focused subviews: cover/statistics/family/accordion presentation and existing launch callbacks.
- `ProductTabsView`: bookshelf return, stage-specific toolbar replacement, and existing route lifecycle.

Use the existing refresh path to load the persisted time when returning to Stages. Do not reload the entire library or broadcast a snapshot on every timer tick.

## Verification plan

Use injected clocks and fake schedulers for timing tests, not real ten-second waits.

1. Measurement: reading, pause, audio/video/silent learning, tools, failed/cancelled presentation, active/inactive transitions, lock/background exclusion, completion, and fullscreen remounts.
2. Ownership: duplicate lifecycle calls, late callbacks, overlapping flush/exit, writer revocation, profile switching, and reset. One eligible second is never credited twice.
3. Persistence: periodic/final cumulative writes, retry after injected failure, out-of-order writes, separate connections, reopening, old-schema migration, and rollback.
4. Backup: older imports, duplicate/reordered merges, same/different replica counters, restore-then-new-learning, reset generations, malformed data, and payload bounds.
5. Independence: measuring time never changes XP, streaks, stage completions, cycles, rate, media position, or checkpoint ownership.
6. Stage projections: all sixteen stages appear in exactly one family; completion denominators, continuation selection, locked/unavailable access, grouped counts, review, and duration formatting remain truthful.
7. Focused native rendering/UI: reference structure, all families, disclosure versus launch, continuation, back/menu behavior, long titles, small width, light/dark, accessibility text, and existing completion marks.
8. iOS 27 Simulator: short deterministic foreground/tool/background/reentry journey, save/relaunch, and stage summary. Simulator evidence does not establish physical lock behavior or live private-sync acceptance.

Update affected existing assertions rather than weakening them or adding redundant full-app launches. Run the relevant package/native/UI tests first. Full pre-push verification remains the existing gate when the owner later requests a PR.

## Review checkpoint

The owner confirmed the reference layout applies to the actual app, chose to include paused/reading time while excluding tools, and approved this written design on 2026-10-16. The approved design includes the ten-second save cadence, independent SQLite counters, backup compatibility, and exit/retry behavior. Review the implementation plan and select its execution method before product implementation. No commit or remote write is authorized by the design approval alone.
