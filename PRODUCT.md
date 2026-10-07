# 쇄도잉

<!-- impeccable:product-schema 1 -->

## Current free-app direction — 2026-10-01

The active iPhone product is Swift-native and free. Configured learning packages
use explicit free downloads with complete validation and atomic installation.
There is no purchase, price, receipt, ownership or purchase-restoration path.
Existing package identities, installed materials, checkpoints, XP and settings
remain intact. Optional private iCloud progress recovery remains separate.

Purchases may be reconsidered in roughly six months through a separate approved
design; there is no automatic activation. Ads are optional future work, not
integrated here. Earlier paid requirements are superseded, not passed tests.
See [the current acceptance record](docs/swift-native/free-package-acceptance.md).


## Platform

ios

## Users

People practicing spoken language through listening and repeating downloaded
audio/video lessons and silent text-reveal exercises. The current app is
Swift-native and iPhone first; Android is a later Kotlin-native phase.

## Product Purpose

Make repeated spoken practice easy to start and safely resume, including the
current unfinished cycle. Installed lessons and device-local progress remain
usable offline; learning never waits for a server acknowledgement.

## Operating Context

Three icon-only native tabs: language-filtered books, the selected book's stages,
and settings. A shared top bar shows the language flag/picker, real level/XP and
streak. The learning player is outside this browsing shell. The controlled
12-sentence English/Korean sample is bundled; configured packages download
explicitly. All sixteen learning stages use the current learning contract.

The books screen and tab are named “책장” (Bookshelf). Each whole book card is its
primary action, without separate Learn or Download buttons. Undownloaded covers
are desaturated; tapping starts download or retries a failed transfer. While busy,
download progress and percentage replace stage progress in the same row. When
the transfer settles, saved stage progress returns; only successful installation
restores the full-color cover. Completion stays on Bookshelf rather than
automatically entering learning.
Every card has a separate top-right ellipsis menu. It offers cancellation during
transfer and download-only deletion with confirmation for installed optional books.
Bundled samples and uninstalled books have deletion disabled. History is retained.

Tapping an installed book card selects that book and switches to the Stages tab
after the selection saves successfully. Stage screens exist only in that tab;
Bookshelf always returns directly to the library. Selecting a book never starts
playback or awards XP.

The picker supports English (UK flag), Japanese, Chinese, German, Spanish and
French, in that order. Languages without books remain selectable and show empty
Books/Stages screens; they never borrow the English package or its progress.

Settings covers learning preferences, optional iCloud recovery and scoped data
management, without purchase restoration. Each learning-settings menu row shows
a small, wrapping summary of its saved options and refreshes after edits or resets.
Player options show current-value summaries and are opened from the upper-left
button. The centered book title sits above its progress track, which extends to
the counter at the right content margin; the separate player close
button is removed. The stage exit remains inside options, including during loading
or errors. Options always open at the full native sheet height. Short learning
content is vertically centered between the fixed controls; long content remains
scrollable. The main action uses only an icon for Confirm, Resume, Next and Playing,
while retaining accessible names, disabled states and explicit confirmation behavior.
Cycle rings retain stroke clearance inside the timeline so playback does not clip them.
Committed XP appears as text only, without a background, at a bounded random
position above the action. It uses adaptive primary text, black in light mode
and white in dark mode, and starts fading immediately, disappearing in half a
second. Reduce Motion uses a stationary fade. These receipts never create learning credit.
Browsing tab and available stage activations produce one light native haptic;
programmatic tab routing and locked stages do not. Stage rows show three check
circles, turning one green for each confirmed full run (up to three), while
retaining the spoken completion count for accessibility.
Player options pause/checkpoint before settings or references.
Closing a sheet or returning to the foreground does not
implicitly resume or confirm practice.

iCloud settings use one sync toggle. Enabling asks for explicit consent and,
for guest records, whether to include them; disabling stops automatic sync.
The main data-management screen contains only scoped deletion actions. Consent,
destructive confirmations and actionable errors remain explicit. Display and
font previews share two longer, separately quoted bilingual examples. Previews
and active learning share alternating chat bubbles or continuous left-aligned
list text inside one padded, rounded card, keeping each original and translation
together. Video uses list mode without changing the saved preference for lessons
without video.

## Capabilities and Constraints

- Swift 6, SwiftUI/UIKit, native SQLite and AVFoundation. Minimum iOS is 26.0;
  current simulator verification uses iOS 27. No shipped Expo or JavaScript runtime.
- Free explicit downloads use Apple-hosted Background Assets. Verify manifests,
  versions, languages, bytes/hashes and confined paths before atomic installation.
- Cancellation, explicit retry and download removal preserve learning history.
  Legacy package identities remain stable; internal content is not made public.
- Audio/video stages 1–10 retain explicit cycle confirmation and optional Repeat.
  Silent stages 11–16 retain manual reveal confirmation. Media end is not practice.
- Checkpoints, XP and completion commit atomically; reopening never awards credit.
  Language-specific progress follows [the learning contract](docs/learning-contract.md).
- Preserve learning preferences, installed sentence analysis and Apple dictionary.
  Wired monitoring is live only; no recording or transmission. Microphone gain
  spans 0...2 without changing original lesson playback.
- Optional private CloudKit progress recovery is separate from content access;
  sync starts disabled and never silently overwrites existing cloud history.
- Preserve the Expo reference, Git history and unrelated local edits. Never mutate
  hosted Supabase records or delete App Store Connect products for this transition.
- Account/device tests, uploads and release require separate explicit approval.
  Ads, future commerce and additional platforms are outside this change.

## Brand Commitments

The owner approved a Duolingo-inspired, solid, playful redesign of the four
existing screens on 2026-09-11, with the existing workspace DESIGN.md as the color
authority. This replaces the earlier glass-heavy direction. The app is named
쇄도잉, using the owner's supplied logo and app icon. Primary is Bee yellow
#ffc800, with Fox orange #ff9600 for its pressed state. The exchanged Bee and Fox
accent roles are green #58cc02 and #58a700. Do not use Duolingo's characters or
proprietary fonts. Preserve the supplied artwork rather than redrawing it.

## Evidence on Hand

The Swift app contains learning/storage, media/feedback, normal product screens,
reference tools, hosted delivery and optional private recovery. The free-only
transition has its own [acceptance record](docs/swift-native/free-package-acceptance.md).
Package, simulator, physical-device and hosted-CI evidence remain distinct.
No public release or live free-download acceptance is inferred from local tests.

## Product Principles

- Quiet normal operation: no routine save/connectivity success announcements.
- Clear next action and visible, truthful learning progress.
- Interrupted or restored practice never creates completion by itself.
- Necessary errors explain a recovery action without erasing records.

## Accessibility & Inclusion

Readable Korean and English; scalable text, dark appearance, labeled controls,
non-color-only selection/progress, and minimum 44-point touch targets.
