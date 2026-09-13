# Settings refinement verification

## Scope

- iOS-style grouped settings subpages, preserving the existing native navigation.
- Learning preferences: bubble/list speech display, existing playback-rate control,
  group size 2–4 (default 2 without replacing saved choices), and four editable
  WPM rows with trailing disclosure chevrons (defaults 150/200/250/300). Section headings
  share 18pt semibold styling; the playback-rate heading sits outside its card.
- Playback speed uses one row with the current rate on the right and four dots
  below the slider instead of numeric scale labels. The rate range and quarter-step
  behavior are unchanged. The shared player-options control uses the same layout.
- The player-options sheet now starts with four grouped menu rows: display,
  playback rate, group size, and WPM values. Each opens its shared preference
  editor inside the sheet with a back-to-menu control. Display/group/WPM save
  the global preferences; rate still updates only the paused session checkpoint.
  The main learning-settings page shares the same four-menu component and opens
  individual native detail routes; back navigation returns to the menu. Both
  entry points label the latter menus “다구간 학습” and “크레이지 스피킹”.
- WPM rows expand inline sliders: stage 1 has 100–200 in increments of 25;
  later stages select +50/+100/+150 relative to the preceding stage. Changing an
  earlier stage preserves later intervals. Legacy values are normalized for the
  editor without rewriting backup JSON until the user adjusts the control.
- WPM disclosure rotates right-to-down with a 180ms transition. Reanimated layout
  transitions and short fades connect expansion/collapse; reduced motion skips
  the movement. Settings navigation uses a native header without material blur,
  with a 20%-opaque theme tint above automatically inset scroll content. Simulator checks cover open,
  closed, and scroll-under states, not release-device animation performance.
- Group-size and WPM preferences are stored now; their learning engines remain
  deferred. The owner-requested notes describe where these preferences apply;
  they do not establish implementation of those learning engines. Speech view affects display only, not seeking,
  session confirmation, checkpointing, or XP.
- iCloud keeps automatic backup. Its persistent controls are an automatic-backup
  switch and Download. Download while off leaves automatic backup off. Existing
  conflict and replacement confirmations remain; genuine enabled conflicts also
  offer the local-record choice in the transient alert.
  First enable for an empty account asks whether to include guest records, start
  separately, or cancel. The choice is tied to the checked account generation;
  no backup or profile switch occurs while waiting for that decision.
- Restore purchases remains the last main-settings row and reports the completed
  operation through an alert, not persistent explanatory text.

## Automated coverage

- Preference decoding and strict backup validation cover new optional values and
  invalid input, retaining the legacy settings shape when optional values are absent.
- SQLite export/restore preserves every new preference, is idempotent, and adds no XP.
- Manual-download tests cover read-only preview, cancellation resuming automatic
  work, changed local records invalidating consent, first-use restore while off,
  and cancellation not dismissing an existing genuine conflict.

## Simulator observations

- Main settings: the shared four-menu list displayed correctly. Opening the group
  detail, changing 2 to 3, returning, and reopening retained 3. The original value
  2 was restored after verification. Native back navigation returned to the menu.
- All four player-options menu editors opened and returned to the menu. Display
  selection persisted across re-entry and was restored to its original value.
  The group editor showed 2/3/4 and the WPM editor expanded the stage-1 slider.
  Existing 200/300/350/400 WPM values were preserved. Footer actions remain fixed
  below the scrollable editor, with Continue last and no empty button slot.
- Player-options footer regression: after removing the empty bottom slot, the
  native form-sheet scroll-frame correction hid the speed editor even though its
  loaded rate was 1 and its React layout height was nonzero. A non-collapsible
  flex wrapper isolates the ScrollView from the fixed footer. The native accessibility
  check for the speed slider failed before the wrapper and passed after it,
  including closing/reopening the sheet. The footer retains Return then Continue,
  without the extra empty slot. This requires native UI regression checks; core
  unit tests do not exercise UIKit frame correction.
- The WPM card uses 4pt outer vertical padding instead of 16pt, keeping its row
  heights and horizontal insets unchanged. The collapsed four-row card was visually
  checked after this adjustment; saved WPM values were preserved.
- Alignment audit: main settings icons/labels/chevrons, speech choices, group-size
  choices, playback slider/value, and iCloud rows were inspected. The iOS Switch
  defaults to `alignSelf: flex-start`, which overrides the row's centering; its
  explicit center alignment now matches the automatic-backup label. Playback rate
  aligns in the same row as the slider without compensating bottom padding, and
  decorative dots no longer contribute to its centerline. Saved values were not changed.
- Learning settings displayed the speech previews, rate slider, 2/3/4 selector,
  and four WPM edit controls. Selecting list/4 and editing the first WPM to 175
  survived leaving and reopening the page.
- iCloud displayed explanation, an off switch, and Download. Without an available
  iCloud account, Download showed the unavailable-account/configuration alert.
- Restore purchases opened the native Apple Account prompt. Cancelling showed a
  failure result alert; no credentials were entered and no purchase was made.
- WPM slider taps changed the sequence to 200/250/300/350, then selecting +150
  for stage 2 produced 200/350/400/450. Values persisted after reopening the page.
  Test values were returned to 150/200/250/300. Touch dragging through the automation
  did not change the value; tap-to-seek was the verified native interaction.

## Remaining device checks

- Actual CloudKit on/off persistence, manual download with automatic backup off,
  and conflict confirmation on an iCloud-signed-in device.
- Successful StoreKit restore on a sandbox-signed-in device.
- Player bubble/list visual behavior during playback and large-text/dark-mode layout.

No real-device records were deleted or restored during this UI verification.
