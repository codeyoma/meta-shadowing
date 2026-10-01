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

The picker supports English (UK flag), Japanese, Chinese, German, Spanish and
French, in that order. Languages without books remain selectable and show empty
Books/Stages screens; they never borrow the English package or its progress.

Settings covers learning preferences, optional iCloud recovery and scoped data
management, without purchase restoration. Player options pause/checkpoint before
settings or references. Closing a sheet or returning to the foreground does not
implicitly resume or confirm practice.

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
