# Native rebuild: decisions and milestones

## Current execution update — 2026-09-12

The owner approved [Apple-only development](apple-only-foundation.md), tickets
#44–#52, and starting #44 on the existing native branch. Minimum iOS is 26.0.
StoreKit 2, Apple-hosted asset delivery and private CloudKit replace the rejected
Supabase/email proposal. #44 implements only the package-context/local foundation;
service integrations remain separate later tickets. #42/#43 were permanently
deleted on the owner's subsequent explicit request, not completed or closed.
The original M0/M1 decisions below remain historical; where they differ, this
update and the Apple-only plan govern the new work. Hosted resources, Git history
and unrelated local UI edits are preserved. Native CI migration is still gated.

Status: Q15 approved M0/M1 and recoverable backlog closure on 2026-09-11.
M0 is complete. The #39 simulator development loop, owner-amended manual-only
#40 stage/settings flow, and #41 simulator recovery/failure checks have passed;
the remaining M1
checks and physical-iPhone installation/acceptance are NOT complete. See
[verification](verification.md) for evidence and open gates.

The next approved development round is simulator-first: tickets #39–#43 cover
the native development loop, stage behavior, resume safety, offline installation,
and accessibility respectively. This enables development without a physical
phone; it does not remove the later real-iPhone M1 acceptance gate. Start with
the [simulator guide](simulator-development.md) for #39.

- New workspace/worktree on `codex/native-iphone-rebuild`, based on `origin/dev`
  at `006b6a89ae96fc296f500bdc4fc5198126a85ca5`.
- Removed all 456 legacy tracked files from the new branch's working tree and
  started fresh. Git history and previous dirty workspaces remain recovery copies.
- Issues #26, #32, #33, #34, #35 closed as not planned/superseded; PR #38 closed
  without merging. Older closed/merged records and all branches remain.
- Supabase DB/Auth/Storage, hosted projects, remote rulesets and deployments were
  not changed. No commit, push, remote CI rerun, or deployment performed.

## Confirmed direction

- Fully replace the existing implementation, including the learner PWA, backend,
  admin application, and browser-specific infrastructure. Do not retain the old
  services or port their implementation as the new application's foundation.
- Working stack from the preceding discussion: React Native, Expo, TypeScript.
- Start fresh in a new workspace/worktree and a new codex-prefixed branch. Keep
  Git history and repository identity. Follow the repository's dev-based feature
  workflow; do not rewrite history or reuse the current dirty checkout as if clean.
- iPhone is first. iPad, Mac, and Android are later milestones; their order and
  delivery approach are not yet decided. Mac support is a separate feasibility
  decision, not an assumed automatic result of choosing Expo.
- The app provides a learning player and learning-progress management.
- Customers buy learning packages with one-time purchases, not a subscription.
- First delivery target: an installed, working app on the owner's iPhone, not a
  public paid release.
- Preserve the eight learning methods and sixteen stages as behavior, while
  implementing them afresh. Validate one representative method first, then the
  full agreed set.
- Pause safely when the phone locks or the app becomes inactive. Remember the
  unfinished cycle as well as completed cycles; Q11 rejects restarting every
  interrupted cycle from the beginning. Persist the state needed to restore its
  phase, playback position, remaining timer, and current phrase/group/rapid step.
  Resume is proposed to require a tap; do not silently resume audio on return.
- First phone build uses device-local progress and a controlled test package.
  Real accounts, online synchronization, and payments belong to later milestones.
- Visual direction (updated by owner on 2026-09-11): keep native navigation,
  replace the muted/glass-heavy content treatment with solid Duolingo-inspired
  controls using the workspace DESIGN.md palette. See PRODUCT.md and
  docs/design/native-learning.md. Learning behavior is unchanged.
- Dictionary lookup and sentence analysis are deferred to M2, not required for
  the first phone build. Translations and hints needed by learning methods remain
  part of core learning.
- First test lesson: a small controlled package with spoken audio, translations,
  and enough phrases to exercise the eight methods; the agent may choose its
  implementation details. Non-speech tones/silence are test fixtures, not a
  replacement for a learnable spoken-content package.
- Initial navigation: Library -> lesson -> stage -> player; progress within the
  lesson, settings from the main screen, language as a filter. Paid store later.
- Preserve Supabase data during the reset. This includes database records,
  authentication data, and stored lesson files; no hosted migration or resource
  deletion is implied by removing local Supabase-related source/configuration.
- Retire the old issue/PR backlog as requested. Do not treat superseded work as
  completed acceptance or merge an old PR as part of cleanup. Closing a PR and
  permanently deleting an issue are different operations and must be reported
  accurately. Exact handling is recorded in the cleanup section below.
- Proposed content sources: sentences from books, films, and YouTube, with
  newly produced audio. The owner requests that rights be assumed for planning;
  that assumption is not evidence of permission for commercial distribution.

## Replacement boundary and historical reference

The existing application has eight learning methods and sixteen stages, with
local progress, downloaded lesson packages, and background merge synchronization.
Only the eight-method/sixteen-stage learning behavior has been explicitly
retained. Other existing behavior is context, not blanket approval to reproduce
the entire implementation.

- Native replacements: learner web UI, browser storage, service worker/PWA shell,
  HTML audio, browser navigation, and browser-only lifecycle integration.
- No implementation reuse: capture the learning behavior as a fresh specification
  and write new native implementation/tests. Existing modules are references, not
  code to carry into the rebuild.
- Backend/admin reuse was rejected in Q5. New content preparation, publishing,
  authenticated APIs, and administration must be scoped as later work.
- Store purchasing, receipt verification, paid access, and purchase restoration
  are new work; current account authorization is not proof of purchase.
- Q5 requests removal of the old implementation first. Before execution, resolve
  exact local targets and protect uncommitted work from accidental loss. Preserving
  a recovery copy is not retaining the old implementation in the new product.
  Q9 protects Supabase data; Q13 protects Git history and calls for a new workspace
  and branch. Old source disappears from the new active branch, not from history.
  Deletion of unrelated hosted projects or accounts is not an implicit consequence
  of replacing source or retiring the old issue/PR backlog.

## Decision tree

```text
Native learning product
|-- iPhone first [confirmed]
|   |-- Full implementation replacement [confirmed: Q5]
|   |   |-- Supabase data preserved [confirmed: Q9]
|   |   |-- Git history retained; new workspace/branch [confirmed: Q13]
|   |   `-- Retire old issue/PR backlog [Q15: close active records; done]
|   |-- Eight methods / sixteen stages retained as behavior [confirmed: Q6]
|   |-- Pause on lock / app switch [confirmed: Q7]
|   |   `-- Remember unfinished cycle too [confirmed: Q11]
|   `-- Local progress and test package only at first [confirmed: Q8]
|       |-- Small controlled spoken test lesson [confirmed: Q10]
|       |-- Library -> lesson -> stage -> player [confirmed: Q12]
|       `-- Dictionary and syntax deferred to M2 [confirmed: Q14]
|-- One-time package purchases [confirmed]
|   |-- Store products, verification, restoration [later design round]
|   |-- Refunds, withdrawal, and offline access rules [later design round]
|   `-- Cross-platform ownership [later design round]
|-- Package contents and delivery
|   |-- Existing text/audio/dictionary/analysis format [candidate, not approved]
|   `-- Download integrity, updates, removal, storage failures [later round]
|-- Progress and identity
|   |-- Carry forward quiet local-first behavior [candidate for confirmation]
|   `-- Merge, account isolation, restoration, old-data migration [later round]
|-- Commercial content [rights unverified; release checkpoint]
`-- iPad / Mac / Android [deferred; order and implementation open]
```

## Milestones

The user requested that later work be recorded. The ordering below is a proposal;
functional scope and acceptance criteria will be refined through the interview.

| Milestone | Deliverable | Exit evidence |
| --- | --- | --- |
| M0: agree and perform retirement | Confirm reset operations; protect dirty work; start a new workspace/branch; retire old issue/PR backlog; remove old implementation from the new active branch | Git history retained; old PRs not merged; Supabase unchanged; recoverability and exact cleanup outcomes recorded |
| M1: first iPhone build | Install on the owner's phone; acquire one test package; perform the agreed initial learning flow; save locally | Download validates; airplane-mode study works; normal pause restores the unfinished cycle; relaunch recovers the latest durable checkpoint without false completions; playback does not wait on a server |
| M2: complete native learning | Finish eight methods/sixteen stages; add dictionary and sentence analysis, package details, controls, and Apple-style navigation | Device tests cover all methods, interruptions, optional-data states, accessibility, missing files, and local-save failures |
| M3: new content services, accounts, and synchronization | Build replacement content preparation/distribution and minimal administration; implement approved sign-in, account isolation, quiet uploads, and restoration | Newly built service contracts and authorization verified; offline/reconnect recovery; no duplicate history or cross-account transfer; no routine success notifications |
| M4: paid package ownership | Store sandbox purchases, server-verified access, restoration, refunds/revocation behavior | Purchase, cancellation, pending transaction, reinstall/restore, and access failure tests; offline policy explicitly approved |
| M5: distribution readiness | TestFlight validation followed by a separately approved App Store release | Rights/source review, required attribution, privacy disclosures, account/data controls, store review checklist, and real-device regression tests |
| M6: additional platforms | iPad, Mac, and Android in a separately chosen order | Per-platform design, playback/storage, sign-in, purchases, restoration, and synchronization acceptance |

No launch dates, paid service purchases, store submission, or automatic support
for later platforms are promised by this draft.

M1 defers sign-in and must use a controlled non-production test-package source.
It must not disable existing authentication or make hosted paid/private content
public to simplify the prototype.

## Release checkpoints and carried-forward proposals

- Source-text rights and new audio rights must be considered separately. Record
  source and licensing evidence before selling/distributing packages. Apple
  requires rights to included third-party content; service terms also matter.
  [Apple App Review Guidelines, section 5.2](https://developer.apple.com/app-store/review/guidelines/#intellectual-property).
- Use store billing as the default design for in-app digital package purchases;
  review target storefront rules before release, rather than assuming one
  worldwide external-checkout policy.
  [Apple App Review Guidelines, section 3.1](https://developer.apple.com/app-store/review/guidelines/#payments).
- Carry forward the user's preference for quiet learning: no routine online,
  offline, save-success, or upload-success announcements. Necessary action/error
  messages use appropriate alerts or toasts. Confirm detailed failure behavior.
- Prefer complete downloaded packages, durable device-local progress, and
  independent retryable synchronization. Do not put server acknowledgements in
  the playback path. Confirm the new app's exact account/sync scope.
- Distinguish background playback from background synchronization. Do not promise
  immediate synchronization after force-quit. Native operating-system limits and
  supported SDK versions must be verified during implementation.
- Replace old tests with newly written native and domain tests for the confirmed
  behavior. Retain the safety/privacy requirements, not the old test code. Write
  new backend tests when replacement services enter scope.

## Round 2 decisions

- Q5: Replace everything; remove old implementation first. The earlier proposal
  to retain backend/admin services is superseded, not accepted.
- Q6: Retain the existing eight learning methods / sixteen-stage behavior.
- Q7: Pause safely and resume from the saved position.
- Q8: Device-local progress and a controlled test package first. Put the remaining
  implementation into later milestones.

## Round 3 decisions

- Q9: Owner requests deletion except for Supabase data. Supabase is protected;
  scope beyond the implementation still needs exact resource targets, especially
  shared Git history and the GitHub repository. No destructive action performed.
- Q10: Owner accepts the recommended controlled test package and delegates its
  details to the agent. Prepare fresh, neutral examples and usable spoken audio.
- Q11: Remember the current, unfinished cycle too. This supersedes the proposed
  restart-from-cycle-start behavior. Completed cycles must remain completed, and
  saving/restoring must not create additional completion events.
- Q12: Owner accepts the recommended Library -> lesson -> stage -> player flow.

## Current-cycle checkpoint contract

Owner update, 2026-09-12: an explicit entry from the stage screen now starts
the unfinished audio after one second and retains all confirmed checks. Saved
listening resumes at its position; an already-ended, unconfirmed speaking pass
replays on this stage entry. Completed decisions never auto-advance. Returning
from the options drawer or foregrounding alone remains paused. This supersedes
the stage-entry portion of the original explicit-resume proposal below; see
`learning-contract.md` for the current behavior.

The following describes the proposed implementation meaning of Q11, not tested
native capability or a guarantee of sample-exact recovery:

- Persist package/version, lesson, method/stage, run, phrase/group position,
  confirmed and planned cycles, active cycle/phase, and completion status.
- For audio, persist the reported playback position and rate; for waiting or
  speaking phases, persist remaining time; for rapid methods, persist the current
  target/translation/speaking step and remaining time.
- A normal pause must stop advancing the engine and durably checkpoint its
  stopped state. Time spent locked/inactive must not advance a learning timer.
- A return/relaunch restores paused state. Proposed behavior is explicit resume,
  not automatic playback. Do not count restoration as completion.
- An unexpected process termination can recover only the latest durable
  checkpoint. Use periodic checkpoints and phase-boundary writes; determine and
  test an acceptable recovery interval rather than promise zero-loss audio time.

Native feasibility references: [Expo Audio](https://docs.expo.dev/versions/latest/sdk/audio/)
provides position, pause/play, and seeking; [React Native AppState](https://reactnative.dev/docs/appstate)
provides foreground/inactive/background transitions. Durable checkpointing is
application work, not automatic persistence supplied by these APIs. Position
update frequency is not a maximum data-loss guarantee.

## Round 4 decisions

- Q13: Keep Git history. Start fresh in a new workspace and branch. The owner
  additionally requests removal of old issues and PRs. Do not delete the repository
  or rewrite commit history.
- Q14: Put dictionary lookup and sentence analysis in a later milestone (M2).

## Backlog retirement: approved and executed

Q15 approved closing active legacy work rather than permanently erasing historical
records. The following interview inventory was rechecked before execution.

Read-only inventory during this interview found 28 issues and 10 PRs:

- Open legacy issues: #26, #32, #33, #34, #35 (5 total).
- Open legacy PR: #38 (1 total).
- Closed issues: #1-#11, #17-#23, #27-#31 (23 total).
- Closed, unmerged PR: #25.
- Merged PRs: #12, #13, #14, #15, #16, #24, #36, #37 (8 total).

The six open records concern the retiring web/device-first implementation; no
open title identifies the new native rebuild. Recheck immediately before mutation.

- Executed: closed all five open legacy issues as not planned/superseded and PR
  #38 without merging. Open issue and PR lists were subsequently verified empty.
- Permanent issue deletion is possible but destructive, and differs from closure.
  It must not be substituted for a confirmed closure plan or reported as recovery-
  friendly. Likewise, closure must not be reported as permanent deletion.
- Use GitHub's supported PR closure operation. Do not delete the repository or
  rewrite Git history in an attempt to erase historical PR records.
- Do not delete branches with uncommitted work or unique commits merely because
  their PR is closed. Preserve references needed by linked worktrees/recovery.

References: [closing an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/closing-an-issue),
[deleting an issue](https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/deleting-an-issue),
[closing a PR](https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/closing-a-pull-request).

## Confirmed execution boundary

Q15 confirms shared understanding and authorizes M0 and M1 only. Later milestones are
recorded, not authorization to implement accounts, payments, hosted migrations,
new paid services, store release, or additional-platform delivery now.

Further detailed decisions about later milestones will be made before entering
them. Do not silently treat deferred questions as resolved requirements.

No application code was changed during the interview itself. After Q15, the new
worktree was reset and the native prototype was written. No commit, push,
deployment, or hosted database change was performed.

## Native CI migration gate

The old local `.github` files were removed with the retired application. This is
not a change to the repository's hosted rulesets or approval settings. Before
publishing this branch, propose native quality/domain tests and iOS build checks,
and explicitly migrate the existing required web/database checks. Do not bypass
required checks or pretend deleted legacy checks validate the new native app.
