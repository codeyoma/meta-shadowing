# Manual learning settings verification

Owner-requested revision, 2026-09-11. Local iPhone Simulator only.

## Changes

- Learning Settings has icon-only native Back and a 0.25–3× native speed slider,
  with a 0.05× step and visible current value/endpoints.
- Removed the progression-mode picker and both explanatory footer paragraphs.
- New and restored sessions require explicit speaking confirmation. Legacy
  automatic records retain their phrase, confirmed cycles, speed and position.
- The versioned expo-audio iOS patch removes its former 2× clamp. Expo Go cannot
  include that patch; use the rebuilt local client. Android is unchanged.

## Verified

- 37 domain tests pass, including rate forwarding, legacy automatic checkpoint
  restoration, disk-backed reopen, explicit confirmation and existing XP rules.
- Typecheck and iOS/Hermes export pass. Debug native build, install and launch
  pass on iPhone 17 Pro Max / iOS 26.5; only a Hermes build-phase warning remains.
- Live native slider renders; track taps and browser-mirror dragging change its
  value. Both 0.25× and 3× are reachable. Leaving/reopening retains 0.25×.
- A fresh Stage 2 uses the selected 3× rate. A temporary debugger breakpoint at
  the native AVPlayer playback call observed `rate=3`. Playback then reached
  speaking confirmation with zero confirmed cycles, without a completion award.
  The breakpoint was removed and the debugger detached.
- Native accessibility exposes a named slider, current speed, and adjustment
  actions. Full VoiceOver interaction is not established by this inspection;
  the Simulator accessibility-action proxy did not reliably invoke adjustments.

Physical-device audibility, pitch quality across all speeds and a full VoiceOver
pass remain separate acceptance checks. No user checkpoint was reset, no stage
completion was fabricated, and no remote service, commit or push was involved.

## Follow-up: speed marks and stable headers

- Added 1×/2× ticks proportional to the 0.25–3× range, with the slider library's
  native marker inset. Live Simulator checks at 1× and 2× align the thumb with
  the corresponding tick; the saved default was restored to 1×.
- Replaced the menu's in-page heading with the same native navigation header
  used by Learning Settings. Repeated menu/back navigation keeps both title
  frames at y=162.33 points with height=20.67 points, and content starts at
  y=228.67 points. Normal horizontal navigation remains.
- Before the change, the live UI assertion for the 2× label failed. Afterwards
  it passes, and both additional labels are exposed to native accessibility.
- 37 domain tests, typecheck and iOS/Hermes export pass. This follow-up changes
  no native module, learning checkpoint or playback behavior.
