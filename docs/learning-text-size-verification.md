# Learning text sizes (#75)

## Automated coverage

- Settings decoding and backup validation accept independent integers 12–48,
  reject malformed values, and preserve legacy preferences without typography.
- The real Settings and player-menu routes share immediate SQLite saves, restore
  values on reopen, observe external changes, preserve unrelated preferences,
  reset to 20/18, and recover from a simulated local storage failure.
- Rapid button taps retain the newest accepted value. Invalid numeric drafts
  cannot overwrite it. Minimum/maximum buttons are disabled at their bounds.
- Malformed legacy preferences and injected SQLite/KV read failures do not block
  root startup. Initialization failures produce a sanitized recovery alert after
  mount, preserve existing values, and can recover after reopening the app.
- Initial defaults persist without a legacy KV write or pending backup work,
  including after account refresh and reopening SQLite. Real preference edits
  still become pending and are never acknowledged by initialization.
- Original/translation rendering uses the selected base sizes with accessibility
  scaling exactly once in bubble/list layouts. Silent stages retain language
  order and hide unrevealed words from accessibility and selection.
- Real player/journal checkpoints across stages 1, 3, 7, 11, 13 and 15 retain
  media/reveal position, speed, phrase, cycles and rewards during preference edits.
- Mounted player-route regressions for stages 1, 7, 11 and 15 verify that live
  size updates reach the rendered text without restarting the engine's focus
  effect or changing its checkpoint.
- Reopening SQLite and restoring backups retain sizes and progress. Profile
  boundaries reject stale callbacks. A two-client sync test verifies opt-in cloud
  restore and offline edits converging after reconnect, using a fake Apple transport.

These are local regression tests, not physical-device or live CloudKit evidence.

On 2026-09-25, PR review regressions increased the suite to 513 tests. A clean,
isolated `npm ci`, all tests, TypeScript checking, and the iOS bundle export passed.
The clean install first reproduced CI's missing `react-dom/server` declarations;
declaring `@types/react-dom` explicitly fixed it without weakening CI checks.
The earlier Debug simulator build also passed. The native build retains the existing
warning about the private local video preparation script having no output files.

## Simulator

Checked the current embedded development bundle on an iPhone 18 Pro simulator
running iOS 27.0 on 2026-09-25:

- Both Settings and the player menu expose the shared size controls.
- Independent original/translation values of 48/12 persist after closing and
  reopening the editor and relaunching the app.
- The size reset restores 20/18. After testing, those values and the original
  bubble layout were restored in the simulator.
- Bubble and list practice layouts render those sizes while the header,
  counters and footer retain their existing sizes. Returning from the editor
  preserves the current phrase and cycle.
- At the largest accessibility Dynamic Type setting, text wraps and the content
  scrolls independently of the fixed header and footer. The simulator's Dynamic
  Type setting was restored to its original `large` value afterward.

This was a visual smoke test, not the full device matrix. Complete scrolling to
the final line at maximum Dynamic Type, the software keyboard's Done action,
long grouped dialogue, video and silent-stage visual coverage, and both themes
still need physical-device verification below.

## Physical iPhone: pending

1. In Settings → 학습 설정 → 폰트 설정, try original/translation 12 and 48,
   one-unit buttons, direct numeric edits, invalid drafts, and reset to 20/18.
2. Open the same editor from practice. Check immediate updates and close/reopen,
   then relaunch; no separate save action should be needed.
3. Test long bilingual dialogue and grouped units in both layouts, audio/video,
   and silent stages 11–16. Change Dynamic Type. Verify all text remains reachable
   while the video, header and footer stay fixed and controls remain usable.
4. Open the editor midway through playback/reveal, change sizes, and resume.
   Position, phrase, cycle, speed and XP must not reset or advance from the edit.
5. With existing iCloud opt-in, verify sizes on a second device after sync.
   Offline changes must save locally and restore after reconnect. Never enable
   sync or reset another profile solely to run this check without consent.

Font selection (#76) is not part of this slice.
