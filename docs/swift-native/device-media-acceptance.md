# Physical media acceptance — #103

Status: **partial; #103 remains open**. This report distinguishes directly
observed physical UI behavior, earlier owner observations and automated policy
or simulator checks. None of those categories silently substitutes for another.

## Test boundary — 2026-10-01

The connected physical iPhone runs iOS 27.0.1 and the existing native app
**1.0 (5)**. Installed-app metadata confirmed that version before testing.
The app was not rebuilt, reinstalled or replaced. These physical observations
are not attributed to the newer repository HEAD `a6ad25d`.

Normal bundled Morning Notes learning was exercised through Device Hub, without
Debug launch arguments or synthetic confirmation controls. Two deliberate test
confirmations added two cycle awards to the existing unfinished run. The added
progress was retained, not erased. Public evidence reports those test deltas,
not private history totals, device identifiers or recordings.

No account, cloud, purchase, permission-setting, data-reset, upload or release
operation was performed. No microphone or playback audio was recorded or exported.
Manual VoiceOver remains excluded by the owner's earlier decision.

## Directly observed physical UI checks

| Procedure | Expected behavior | Observation | Result |
| --- | --- | --- | --- |
| Open the existing unfinished bundled-book lesson and its options | Navigation and options do not confirm practice | The existing two confirmations remained visible; the options screen opened normally | Passed for UI behavior |
| Choose Repeat once after the third playback ended | Confirm the third cycle once, add exactly two cycle slots and retain the phrase | A `+1 XP` receipt appeared; five slots were displayed, with three confirmed and the same phrase selected | Passed for UI/credit behavior; tactile feedback not observed |
| Return from Home after Repeat | Retain the unfinished plan and require explicit Resume | The same phrase, five slots and three confirmations returned with a Resume control | Passed for foreground UI behavior |
| Resume, then confirm cycle four and immediately go Home | Resume grants no confirmation; the explicit confirmation is saved once; the next cycle remains unfinished | Resume left three confirmations unchanged; returning after the explicit confirmation showed four confirmations, an unconfirmed fifth cycle and Resume | Passed for transition/checkpoint UI behavior |
| Exit without confirming cycle five | Preserve the two explicit test awards without completing the unit or stage | The browsing header retained exactly the two added awards; the stage remained unfinished | Passed for visible persistence; microphone/observer cleanup not established |
| Terminate only the native app process after exit, then relaunch normally | Do not reopen learning or award again; retain the checkpoint | Relaunch opened the library with unchanged test credit; stage reentry retained the phrase, five slots and four confirmations | Passed for cold-relaunch persistence |

The immediate confirmation/Home check covers cancellation around the next-cycle
transition. It is not proof of audible output at the instant of backgrounding,
an exact saved audio position or a real phone-call interruption. Normal stage
entry may start the unfinished audio again; quiet cold launch refers to the
library appearing without automatically opening a player.

## Hardware acceptance map

The earlier observations below are documented in
[the media contract](media-feedback-contract.md#owner-hardware-observations--2026-09-30)
and [the cutover evidence](cutover-acceptance.md#hardware-gate--103).
They are historical owner reports, not new agent-observed passes.

| #103 item | Existing or new evidence | Still required before checking the full item |
| --- | --- | --- |
| Learning-cycle and Repeat haptics | Earlier owner report of normal learning haptics; current Repeat credit/slot UI check; automated committed-feedback and pattern coverage | Physical cycle/Repeat pulse discrimination and quiet restoration/failure/duplicate edges |
| Wired output and microphone routing | Earlier owner report of audible Apple-earphone monitoring; automated permission, route and recovery policies | Headset/built-in-mic fallback, permission handling and microphone-only gain isolation on hardware |
| Headset actions | Earlier owner report that headset buttons work; automated one-shot revision gate | Physical single/double dispatch, unfinished-playback rejection and menu/background reentry without duplicate credit |
| Unplugging and unsupported routes | Earlier owner report that unplugging stops monitoring; automated unsupported-route rejection | Physical rejection of ineligible routes and safe reconnect behavior |
| Real audio interruptions | Earlier owner reports of paused learning and monitoring-only recovery after Siri/calls | Physical explicit Resume with working output and unchanged checkpoint/credit across the complete interruption journey |
| Lock/background/foreground | Earlier owner report of lock-return recovery; current Home/foreground UI checks | Physical lock behavior and confirmation that only previously running monitoring continues in the background |
| Lesson-exit and completion cleanup | Earlier owner report that leaving learning stops monitoring; current exit/relaunch persistence; automated teardown and completion ownership tests | Physical completion cleanup, remote ownership release and obsolete-callback behavior with monitoring active |

No complete hardware checklist item is newly marked passed by this report.

## Device-observation limits

The initial development connection failed because the phone was locked. After
the owner unlocked it, the developer disk image was compatible and usable.
That prerequisite failure is not an application defect.

During the lesson, Device Hub displayed **Screen Sharing Unavailable** because
the microphone or camera was active. The screen later became available again,
but no observed toggle establishes what ended that activity. This is not proof
of a monitoring failure or of successful capture. Remote viewing must not be
used as evidence of physical microphone audibility.

The read-only device audio query was also unsupported on this iPhone. It did
not establish the selected input/output route. No debugger, audio-buffer tap,
permission change or recording was added to work around these limitations.

## Automated verification

The focused LearningMedia run passed 34 tests across VoiceMonitoringTests,
LessonRemoteStateTests, LessonAudioSessionTests and HapticPatternTests. All six
package suites passed 360 tests. These execute policies and controlled seams;
they do not prove tactile feedback, physical headset dispatch or microphone sound.

The separate local StoreKit setup passed one test. The final unfiltered iOS 27
simulator run passed all 123 cases: 53 UI, 51 media/reference integration and
19 local StoreKit cases, with zero failures or skips. Parameterized cases produced
151 invocations; that is not an additional 151 distinct cases. The finalized
result bundle reported `Passed`, and Xcode reported `TEST EXECUTE SUCCEEDED`.

Verification used the existing checkout at `a6ad25d`, with unrelated pre-existing
local changes preserved. No application or test source was changed for #103.
The run reported four `Invalid frame dimension (negative or non-finite).`
runtime warnings in reveal/preset editor checks. Those checks passed, but the
warnings remain unresolved and are not evidence of clean layout diagnostics.
These simulator results are not live purchase, physical-route or tactile tests.

## Next physical session

Use the existing app and wired Apple EarPods. The agent can operate visible app
controls and check displayed state and credit. The owner must perform actual
headset presses, unplug/replug, speech and tactile/audibility observations.
Microphone tests should be performed directly on the phone with remote screen
viewing stopped. Permission changes require their own agreed scope and restoration.
Complete the remaining cases above before closing #103; simulator success alone
does not satisfy its physical-device gate.
