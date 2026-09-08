# Meta Shadowing UI contract

## Mobile-first browse layout (2026-09-08)

- Languages, lessons, stages, settings, and session settings share a centered shell capped at 430px total width, including on desktop. The stage summary stays above its path at every width. Player and administrator layouts are unchanged.
- Keep the top and bottom navigation stationary. On short screens, the stage content can scroll internally so both the summary actions and the complete stage path remain reachable without document scrolling.
- At viewport heights of 500px or less, the stage preview is centered horizontally with 20px viewport margins instead of remaining anchored to a node. Its content scrolls above the full-width Start row, and the anchor arrow is hidden. Scrolling upward from the stage path can reach the summary in the outer content region.
- Stage-preview descriptions use 14px display-ink text. The preview has only its X close action and full-width Start button; session preferences remain available through Settings → 세션 설정, not a popup gear button.
- The real study streak has no badge background. Two overlapping, filled Lucide Flame icons use a larger Fox-orange flame and a smaller Bee-yellow flame, with one accessible streak label.
- The equal-width history action displays its chart icon and `완료 기록`. The current-stage method name and leading play icon form a horizontally centered group, with both vertically centered in the button; its 10px stage/level metadata aligns with the method text above it, not above the icon, and does not participate in that centering.

## Current stage and lesson history (2026-09-08)

- Only the recommended next/resumable stage has a 4px blue arc traveling clockwise around a faint, fixed-size border track. The arc follows the node's elliptical outline without scaling or rotating the node and does not represent completion percentage. Opening a different stage preview does not move this indicator. Reduced motion leaves a static arc; a fully completed lesson in review mode has no indicator. This replaces the earlier electric and pulsing rings.
- Recommendation alone does not select a node or make its background green. Selection follows the open preview: clicking its node again or dismissing the preview clears selection and restores the white idle background. Completed stages stay green independently of selection. The current-stage arc remains visible when its preview is closed.
- The lesson-list screen no longer displays completion history. Records are not deleted, and lesson progress continues to count unique stages of the current version.
- A chart-icon button immediately left of the current-stage Start action opens a large, scrollable completion-history dialog. Both buttons have equal width (1:1) and height. The dialog reads this lesson's saved records on each opening, includes older versions, and orders completion timestamps newest first.
- History uses the shared shadcn Table's compact 12px density with stage/level, completion date/time, active study time, and settings columns. Settings expand in a full-width row using a 44px disclosure button. Empty history has an explicit empty state; keyboard dismissal restores focus to the chart button. The bottom Close action remains reachable on short screens.

## Learner controls and language expansion (2026-09-08)

These approved refinements supersede conflicting older behavior below:

- Language selection offers English (UK flag), Japanese, Chinese, German, and French with Korean/native labels. New languages without published content show the empty lesson state; do not invent lesson data. The shared language catalog drives routing, persisted selection validation, locale tags, and admin choices. Apply the additive `expand_lesson_languages` migration before importing those languages in a deployed database.
- The stage path retains its curved dotted connectors, but its Bee → Fox → Cardinal → Beetle palette blends continuously over the full scrolling list instead of changing at row boundaries.
- The player has no book-title row or level chevron. Its three text controls share height, type, padding, and subtle lower shadows without visible borders. The menu button uses the same shadow treatment.
- Level help opens a large dialog with eight level-preview tabs, initially the current practice level. Existing short instructions remain; detailed guidance is explicitly pending. Previewing a tab never changes the practice level. Opening pauses practice; dismissal restores focus without resuming. The Cardinal Close action sits at the viewport bottom, outside the card.
- The player drawer's `스테이지 화면으로` action returns to the current lesson and selected stage.
- R activates REPEAT only after all three required confirmations, while that action is available and no dialog/drawer is open. It remains inert during playback, mid-listen pause, errors, extra listens, and rapid practice. Modifier combinations, held-key repeats, and text inputs are excluded. Focus restored to a non-editable player button does not suppress an otherwise available R action.

## Current visual authority: DESIGN.md and shadcn (2026-09-07)

Root `DESIGN.md` is now the sole visual reference, as explicitly requested by the user. Its white canvas, owl-green primary action, navy display ink, rounded 16px controls, and pressed button lip supersede **all older visual/color/font specifications below and the concepts images**. The behavior and content requirements below remain in force. Do not add demonstration content, copied mascot assets, or new product claims.

Every generic control is composed from the official registry-generated Radix shadcn layer in `src/components/ui`. Buttons, form fields, native select options, toggles, drawers, popovers, progress, tables, alerts, disclosure, bubbles, and empty/loading states use those shared components. Native HTML remains for content/layout, hidden audio engines, and app-specific geometry such as dialogue tails, numbered path nodes, and confirmed-listen dots. Run `npm run check:ui` (also in CI) to prevent raw control reintroduction in app screens.

`src/app/globals.css` owns semantic tokens; variants in the shared primitives own their appearance. Consumer classes handle layout, not competing button/input themes. Small destructive messages pair DESIGN.md's dark body ink with red borders/status cues. Per the latest user direction, solid primary green fills use white text globally, including setup nodes and primary actions; white on green is a deliberate contrast exception (2.09:1). Soft selection surfaces retain navy ink. DESIGN.md's documented open-source substitutes Nunito and Quicksand are self-hosted, with Noto Sans KR/JP for bilingual glyph coverage. No runtime font requests go to an external font provider.

The historical sections below document earlier refinements and remain useful only for unchanged product behavior.

Accessibility adjustments stay within DESIGN.md's palette: empty fields use its `#777777` gray for a 4.48:1 boundary against white; decorative dividers retain `#e5e5e5`. Bottom sheet content respects the device's safe-area inset.

### Compact player controls and recording progress (2026-09-08)

- This section supersedes the historical book-title segments, speaker control, rotating cycle arc, and R shortcut requirements below.
- Omit the book title from the player header. Its three controls are level/help, live mode/speed, and the text button `문장 분석` with no icon or filled background.
- Remove the small speaker/play button. The main bottom Continue/Pause/Retry/Repeat/Next actions remain, as do Space, S, and Right Arrow. R and Shift+R do nothing; no R hints are shown.
- The current 28px listening circle fills clockwise using the current recording's media time divided by duration. Pause/buffering holds its progress; a new recording resets it; ended reaches 100% without prematurely confirming a listen. Unknown duration has an empty, non-spinning track and no invented percentage.
- The three/five-circle track spans the main action width. Retain completed checkmarks, incoming connectors, extra-cycle expansion, reduced-motion handling, and accessible confirmation counts.

### Separate browse routes and settings pages (2026-09-08)

- This section supersedes earlier Home section-jumping, browse-settings drawers, and orbiting-dot requirements below.
- A shared learner layout keeps brand/streak and four bottom destinations mounted. `/languages` contains only supported language links; `/lessons?language=...` contains that language's actual published lesson cards and version-aware progress; `/lessons/[lessonId]/stages` contains the existing sixteen-stage path.
- `/settings` lists only `세션 설정`. It links to `/settings/session`, where existing level-specific preferences can be changed. Browse settings never open a drawer. Use the Settings tab to access preferences, then the Stages tab to choose a stage and start. Legacy session-settings deep links with a stage retain their stage back link. Player live-session settings remain in-place with the player to preserve the active session.
- Bottom destinations are real links, derive selection from the route, retain their four accent colors and one short icon bounce, and remain available in empty catalogs. Without a current lesson, Stage leads to lesson selection. Only bounded content regions scroll; their positions are retained during tab navigation.
- Preserve legacy `/home` and `/setup` entry links through redirects. Never infer a Japanese lesson from an English selection or show an unrelated lesson on an unknown stage route.
- Language rows use a flag icon and Korean/native names. Lesson cards use colored book tiles, actual names/counts and recorded completion; no copied book names, fabricated weekly goals, CEFR badges or lock rules.
- Listening cycles contain no dark dots. Pending circles are empty outlined tracks; the current circle has a pale track and a rotating blue arc. Completion retains the blue check and filled incoming connector. Pause hidden-document motion and disable spatial motion for reduced-motion users.

### Shared top navigation and drawer motion (2026-09-07)

- Home and Setup share a stationary brand-and-streak top navigation. Setup no longer has a standalone back button; the bottom Lesson destination returns to lessons. The streak uses actual recorded study days, not demonstration data.
- Setup and Player drawers have no visible Close buttons, in either the heading or footer. Keep the accessible title, keyboard focus containment/restoration, Escape, outside dismissal, and a 44px swipe-down handle. Form/text-selection gestures must not dismiss the drawer. These requirements supersede the historical drawer Close styling below; popover and dictionary-dialog Close controls are unchanged.
- Keep the controlled Player drawer mounted through Vaul's exit transition. Changes between menu, settings, and sentences interpolate the bottom-anchored sheet height over 280ms, including interrupted changes. Reduced motion skips spatial resizing and minimizes enter/exit duration.
- The current confirmed-listen dot orbits the edge of its stationary 28px circle over 1200ms; it no longer bounces. Retain the filled incoming Macaw connector and completed checkmarks. Pause the loop while the document is hidden and disable it for reduced motion.

### Four-destination bottom navigation (2026-09-07)

- Home and Setup share four equal destinations: `언어`, `레슨`, `스테이지`, `설정`, using Lucide Languages, BookOpen, Map and Settings. Icons retain distinct green, blue, orange and purple base colors; the active destination has a soft rounded background and `aria-current`.
- Language and lesson destinations reveal their Home sections while preserving lesson/language context. Stage opens the current lesson's path. Settings opens that lesson's existing session-options drawer without starting practice; closing restores focus to the originating settings control. If the selected language has no published lesson, Stage and Settings are disabled with an explanation.
- Each press produces one 220 ms icon-wrapper bounce; repeated presses restart it. Reduced-motion users get the selected state without spatial motion. Keep navigation immediate and keyboard activation available.
- Reserve a safe-area-aware bottom slot outside the scrollable content. On short screens, compact the bar while retaining at least 48px targets and access to complete stage nodes. Player keeps its existing practice control dock; it does not show these browsing destinations.

### Fixed-screen navigation and stage preview (2026-09-07)

- Every route fits the dynamic viewport; the document itself does not scroll. Long content lives in a bounded, internally scrollable region. Preserve native touch/wheel scrolling, keyboard access and browser zoom; do not install global gesture cancellation.
- Setup keeps the lesson header and stage-list heading in place. Its sixteen stages scroll in a shadcn ScrollArea, retaining full-sized nodes and readable labels. Remove the standalone Start button below the path.
- Clicking a stage selects it and opens a contextual shadcn Popover with the existing method name/instructions, stage number, `Lv N`, and one Start action. Use Primary green and an anchor arrow; the supplied example informs layout, not invented XP rewards or mascot content. Only Start creates the session. Escape, Close and outside interaction dismiss; dismissal does not clear the selected stage or start practice. Reopening the same stage works. The popup flips/clamps to available screen space.
- The setup header has no settings gear. Each stage popup places a 56px Lucide settings button to the left of Start. Settings overlays the retained popup; closing restores focus to that gear and keeps the same stage ready to start with the updated preferences. Popup copy and Close use white; Start and the settings button use white fills with Primary text/icons. White and Primary green are explicit user-selected contrast exceptions, not AA-compliant small-text pairings. This does not change the player help popup or other soft surfaces.
- Home and administrator navigation stay outside their content ScrollAreas. Entry, long forms and resumed completion summaries retain internally scrollable access on short screens. Existing player and drawer scroll regions retain their behavior.
- During practice the speaker, confirmed-listen track and Continue/Repeat/Next controls form one fixed bottom control bar, outside the scrolling practice region and padded for safe areas. This is a control dock, not a new set of destination links.

### Player color and drawer refinement (2026-09-07)

- Per the user's explicit follow-up, player primary actions and player-sheet close actions use DESIGN.md's Macaw `#1cb0f6` with white text. This is an intentional user-selected contrast exception, not an AA-compliant small-text pairing. Other screens retain their existing green primary actions.
- The selected book, level-help, or settings segment uses Primary Soft `#d7ffb8`, with 16px rounding on all corners. Closing help/settings restores the book selection. The learning-help popover also uses Primary Soft with navy text.
- Completed listening circles and connectors use Macaw, with white Lucide checkmarks. Confirmation timing and animations are unchanged.
- The speaker's rounded-square recording outline and base border appear only during actual media playback. Hide them while idle, loading, buffering, paused, between grouped clips, or ended; keep the independent keyboard-focus indicator. Manual extra-listen speaker confirmation follows the updated rule below.
- Sentence choices are flat, borderless full-width rows with a shadcn Separator beneath each phrase. Preserve selected-row shading, accessible current-phrase state, and an inset keyboard focus ring.
- Generic UI icons use `lucide-react` throughout. The original Meta Shadowing brand mark and app-specific progress/path geometry remain authored vectors, not replacement stock icons.
- The three-/five-cycle track fills all space after the playback button: its first dot sits one 12px gap after playback and its last dot aligns with the action area's right edge. Keep expansion and confirmation animations, without a balancing empty column or capped track width.
- The menu heading reserves an invisible, noninteractive icon-sized slot opposite Close, matching the Back slot in other views.
- Opening a selected sentence scrolls only the sentence list, centering ordinary rows and top-aligning oversized rows. The outer sheet never scrolls with the selection, so its header and bottom action remain anchored when switching back to the menu.

## Approved setup refinement (2026-09-07)

### Latest journey layout

The approved winding-path reference supersedes the older compact-row layout below. Separate the Back button from a navy shadcn book-summary Card; show the real title/phrase count, completed-stage progress, and a selected-stage shortcut that opens its preview without starting practice. Progress counts distinct completed stages from this browser's journal for the current lesson and content version; repeat completions do not inflate it. Legacy completions belong only to the first stage of their level. Do not infer completion from the selected stage, create locks, or fabricate sample progress.

Place large circular Lucide method nodes on one ordered, width-spanning winding path, with a small navy stage-number Badge at each node and the method name plus `Lv N` below. Completed nodes use real checkmarks; all stages remain selectable. The internally scrolling path has four light DESIGN.md accent bands: stages 1–4 Bee, 5–8 Fox, 9–12 Cardinal, and 13–16 Beetle. Mobile stacks the book summary above the path; wider screens place the summary beside it so short landscapes retain a usable path viewport. Keep focus order, the fixed outer document, safe areas, and popup settings/Start behavior.

On short landscape screens, anchor the preview beside its stage so the reading region is not squeezed between the node and the viewport edge. Keep the title/description internally scrollable and Settings/Start visible; adapt again when the device rotates.

### Earlier stage model (behavior retained; row geometry superseded)

Latest stage model: retain eight playback levels and show sixteen selectable stages, pairing stages 1–2 with Lv 1, 3–4 with Lv 2, through 15–16 with Lv 8. Each row shows the stage number, the unchanged method name, and an adjacent `Lv N` badge. The path scrolls inside its own viewport without compressing the sixteen rows. Stage identity is carried in new player links and progress/history independently of the level used by the playback engine. Missing stage identity in older links or saved records means the first stage of that level; invalid or mismatched URL stages default to that first stage, while invalid saved records are rejected. Do not reinterpret old levels as stages, duplicate audio engines, alter speaking/listening rules, or add automatic stage advancement.

- Remove the setup-only brand bar and large title block. Keep one compact top row with the `레슨` back action and the lesson title/metadata block. Center the back action against the complete title and metadata block. Use an 18–20px title and 13px metadata; long titles wrap within the title column.
- Present stages 1–16 as an ordered vertical learning path: 56px numbered circles, gently staggered by 16–24px increments, linked by neutral lines, with readable method names and `Lv N` badges on the right. Only the selected node is green; all nodes remain selectable. No locks, mascot art, invented completion, or new progression rules.
- Keep semantic buttons, selected-state announcements, and keyboard order 1–16. Node and label form one touch target. Decorative connectors are noninteractive and track row height when labels wrap.
- Start and the settings gear live in the selected stage's popup. The gear opens a bounded, scrollable session-settings dialog with a title, close controls, Escape dismissal, contained Tab navigation, and focus restoration to the popup gear. Keep all existing audio/group/WPM preferences, including persistence and conditional controls.
- Player navigation uses the shared drawer described below; setup retains its own options dialog.

## Approved player refinement (2026-09-07)

This player-only revision supersedes the older player sizing, accent, dock, and CTA entries below. Entry, home, and administrator styling are unchanged; setup has its own approved refinement above.

- Keep the dark charcoal theme. Use a rounded yellow (`#ffc800`) lesson progress bar, blue (`#39baff`) audio affordance inside a bilingual speech bubble, and a green bottom action with a shallow pressed edge.
- Target text and first-word hints are 22–28px; Korean translations are 16px; player headings are 16–20px. Icons are 22px inside targets of at least 44px. Do not scale text up merely because the viewport is tall.
- Use one bottom action region: `CONTINUE` before the three required listens, then `REPEAT` and `NEXT`. R/Repeat adds exactly two extra cycles together and starts the fourth listen. The fifth uses the same controls and subtitle rules as the required cycles; repeated R may restart a listen but cannot add more cycles. Running audio exposes `PAUSE`, and a failed recording exposes `RETRY`.
- Preserve the selected mode for the extra pair: manual mode waits for Space/Continue between listens and for Space/Next (or R) after the fifth; automatic mode retains each level's speaking windows, then advances after the fifth speaking window and configured next-unit delay. After the third speaking window finishes, automatic mode waits indefinitely for REPEAT or NEXT; it does not automatically advance, and the choices are not shown during the speaking window. Levels 6–8 keep their existing WPM and line timing.
- A finished recording is pending, not yet a check. In manual mode, Continue/Space confirms it and starts the next listen; the third confirmation instead reveals Repeat/Next, and the fifth leaves Next. In automatic mode, the speaking timer's expiry confirms it. The speaker also confirms a finished manual extra listen (including native keyboard activation and paused-ready state): the fourth starts the fifth, and the fifth leaves Next. Required-cycle speaker replay and R still replay without confirming; clicks during playback only pause/resume. Play one short original ascending success cue on the third confirmation, not on replay, dismissal, or later renders; audio-device failures must not block progress.
- Show listen progress immediately above Continue/Repeat/Next inside the bottom action region, below any subtitle-reveal utility. Remove the footer's top separator and the cycle strip's separator. Use three connected circles: gray dots for pending cycles and green checkmarks for completed cycles. Adding the pair smoothly makes room for circles four and five and reveals them in order, without delaying playback; reduced-motion preferences reveal them immediately. Keep the count accessible to screen readers without visible count text. Omit the standalone audio timeline and elapsed/total timestamps. For levels 1–5, show actual recording progress along the speaker button's rounded-square outline: freeze on pause, reset for each recording/replay, and finish at the recording's end. Unknown-duration recordings retain a neutral track without an invented percentage. Guidance height follows its actual text instead of reserving a blank second line.
- Preserve keyboard shortcuts, bilingual subtitle reveal, group boundaries, recording errors, and learning records. The audio icon and primary action still pause running playback. Omit the separate speaking-pause action; opening settings or the sentence menu pauses speaking time without beginning a new listen. Keep screen-wake protection best-effort and silent, with no fallback notice.
- Center the player in a column capped at 640px on tablet/desktop. Keep the bottom action outside the scrollable content, with safe-area padding. The lesson title, help trigger, and settings shortcut remain pinned; long phrases scroll inside the focusable subtitle region. Short landscape views may scroll the content without moving the bottom action.
- Visible English action labels also appear in their accessible names, followed by the Korean action description. Keyboard hints are secondary and hidden on touch/narrow layouts.
- Across all eight levels, the top bar contains one `학습 메뉴` button and yellow lesson progress/count. Below it, group book title, level help, and live mode/speed in three rounded tab-style segments. Highlight the book by default, the level while help is open, and mode/speed while the sheet actually shows settings; dismissal restores the book highlight without moving focus away from the original opener. These are a book label and native dialog buttons, not ARIA tabs with nonexistent panels. Keep a minimum 44px touch target, no duplicate mode/speed in the drawer, and no top/bottom context separators. Group size and speaking timers remain near the practice content.
- The menu opens one bottom sheet with `학습 설정`, `문장 목록`, and `첫 화면으로` (navigating to `/home`). Center it at up to 640px on desktop and slide it upward from the bottom. Settings and sentence lists replace the sheet body rather than stacking dialogs; the title's mode/speed shortcut opens settings directly. Their back action returns to the menu and focuses the originating item. Use a green header with dark text, a scrollable dark body and a primary bottom close action. Opening pauses media/timers and releases screen wake; closing never auto-resumes. Escape, explicit close and outside dismissal restore focus to the opener (menu or settings shortcut). Keep Tab contained, honor safe-area insets and suppress the slide for reduced-motion users.
- Sentence lists, player settings, and setup settings dismiss on an outside click or tap, but not when dragging from inside the dialog onto its backdrop. Keep Escape and explicit close actions. Completed listens animate the green circle fill and incoming connector briefly; reduced-motion users see the same completed state immediately.
- The drawer's sentence list retains chapter headings, section dividers, numbered bilingual phrases, and the current phrase/group highlighted and focused on entry. Selecting any sentence closes the drawer, resets its practice state and saves that position (the containing group in levels 4–5), without completing skipped practice. Selecting after a completed session starts a new run and preserves the previous history entry.
- Remove the in-canvas previous/restart/next control row. Keep Space/R/S/Right Arrow shortcuts, bottom playback/Repeat/Next actions, and the compact subtitle-reveal action directly above the bottom action where applicable. Left Arrow does not navigate or reset practice in any level; use the sentence menu to revisit an earlier phrase or group.
- Across all eight levels, left-align the lesson context to the 640px practice column. Tapping the current level label reveals its learning method in a small green popup anchored beneath it; the method is not always visible. The popup pauses practice and restores focus to the level trigger on dismissal without resuming. Yellow lesson progress/count live in the top bar above this context. Playback, pause, repeat, and settings do not change the method copy; playback failures retain a separate actionable error. Let long titles wrap without overlapping the mode/speed shortcut.
- Above the speech bubble, show the current script section heading with a compact book icon, 15px title, optional distinct 13px Korean translation, and a trailing thin rule. Preserve supplied section names/numbers verbatim; never invent numbers for untitled material. Keep unnamed boundaries as thin dividers. This heading follows sentence/group navigation across all eight levels, remains behind the settings popup, and is replaced by completion content.
- In levels 1–5, two or more separately double-quoted target-language lines form a dialogue when Korean has the same number of nonempty lines. Accept mixed straight/curly double quotes; Korean punctuation does not determine dialogue detection. Pair each target line with its Korean translation directly below, alternating left/right/left bubbles in source order. Keep one shared playback/progress button to the left of the lower listening dots, above Continue/Repeat/Next, for dialogue, ordinary sentences, and grouped practice alike. Playback still covers the whole phrase, with no inferred turn timing. Preserve quotes, ordinary or mismatched text as a single block, and group boundaries (restart alternation per phrase). Hint-only levels keep the existing single first-token hint until subtitles are revealed. Long conversations scroll in one focusable region; bubbles do not have their own scroll areas.

## Visual direction

- Background character: true dark charcoal, never navy, brown, a light surface, or a decorative gradient.
- Primary accent: friendly vivid green used for progress, the active selection, focus, and the one primary action on a screen.
- Typography: confident, highly legible Korean/Latin/Japanese sans serif. Content text is larger than browser defaults; utility chrome remains deliberate and never tiny.
- Container model: open vertical layouts and full-width rows. Use a single purposeful framed region when controls belong together; do not wrap every item in a floating card.
- Geometry: chunky rounded rectangles, shallow cool-gray borders, minimal shadow, no glass blur, no glow.
- Motion: short progress and selection transitions only. Honor reduced-motion preferences.

## Tokens

| Role | Value |
| --- | --- |
| Page background | `#0d1216` |
| Elevated background | `#131a1f` |
| Control surface | `#182128` |
| Hover surface | `#202b33` |
| Border | `#39454e` |
| Strong border | `#596670` |
| Primary text | `#f5f7f6` |
| Secondary text | `#9aa4ab` |
| Disabled text | `#66727a` |
| Primary green | `#58cc4f` |
| Green pressed | `#46ad3f` |
| Green focus | `#89e875` |
| Error | `#ff6b6b` |
| Maximum content width | `72rem` |
| Learner mobile width | `30rem` |
| Small radius | `0.75rem` |
| Control radius | `1rem` |
| Large radius | `1.5rem` |
| Touch target | minimum `3rem`, primary `3.5rem` |
| Border width | `1px`, selected `2px` |

Use a 4/8-based spacing rhythm with the common steps 4, 8, 12, 16, 24, 32, 48, and 64 pixels. Preserve generous vertical whitespace on entry screens and a denser but still readable rhythm in the player.

## Typography

- Font stack: `Pretendard Variable`, `Pretendard`, `Noto Sans KR`, `Noto Sans JP`, `Inter`, system sans serif.
- Entry headline: 40-48px mobile, 700-800 weight, compact line-height.
- Page title: 30-38px mobile, 700-800 weight.
- Practice target: 64px minimum for a one-token hint and fluidly smaller for long text.
- Section title: 20-24px, 700 weight.
- Row title and primary buttons: 17-20px, 650-750 weight.
- Body and labels: 15-17px, 450-600 weight.
- Shortcut hints: 12-13px and secondary, but never required to understand a control.

## Reusable component families

- Brand mark and quiet app header.
- Password field with focus, error, and submitting states.
- Primary button with hover, focus, pressed, loading, and disabled states.
- Continuation row, language row, lesson row, and level row using the same border and focus grammar.
- Segmented session-setting control.
- Thin progress bar.
- Sticky bilingual chapter header.
- Practice canvas with target text, Korean text, playback progress, and cycle status.
- Bottom action controls and mobile playback dock.
- Administrator sign-in panel, two-file drop fields, validation summary, and aligned lesson preview table.

Icons use clean two-pixel round strokes and current color. Use proper SVG components for arrows, settings, playback, subtitles, retry, and speed; do not use text glyph substitutes.

## Responsive behavior

- On mobile, use one centered column, full-width controls, safe-area padding, and a bottom dock that does not cover content.
- On tablet and desktop, retain the same information order and place the primary learner surface in a centered narrow column. Avoid turning the flow into a dashboard or card grid.
- The administrator import surface may use a wider single workspace on desktop for the aligned preview. On mobile, stack the file fields and render each aligned phrase as a readable row rather than forcing a clipped desktop table.
- Maintain visible focus, keyboard operability, and at least 44px touch targets at every size.

## Copy lock for the first learner slice

Allowed entry copy: `Meta Shadowing`, `엄선된 문장으로, 여덟 번 다르게.`, `베타 비밀번호`, `입장하기`, `비밀번호가 올바르지 않습니다.`, `지금은 입장할 수 없습니다. 잠시 후 다시 시도해 주세요.`. Omit the former headphone instruction and private-beta footer; retain password entry and installation help.

Allowed learner-home copy: `오늘도 한 프레이즈부터.`, `마지막 학습 계속하기`, `언어 선택`, `English`, `영어`, `日本語`, `일본어`, `영어 레슨`, `일본어 레슨`, lesson names, localized lesson names, and phrase counts.

Allowed setup copy: `레슨`, lesson names, localized lesson names, phrase count, `학습 단계`, the eight approved level names, `세션 설정`, `수동`, `자동`, `현재 단어`, `누적 단어`, `재생속도`, and `학습 시작`.

Do not add promotional claims, badges, fake statistics, category labels, or new navigation above the fold.

## Copy lock for the administrator import slice

Allowed administrator copy: `Meta Shadowing`, `관리자`, `관리자 로그인`, `등록된 관리자 이메일로 일회용 코드를 받으세요.`, `이메일`, `로그인 코드 받기`, `인증 코드`, `확인하고 계속`, `새 레슨 가져오기`, `레슨 제목`, `언어`, `English`, `영어`, `日本語`, `일본어`, `목표어 텍스트`, `한국어 텍스트`, `파일 선택`, `파일 검증`, `검증 미리보기`, `프레이즈`, `챕터`, `구간`, `이름 없는 구간`, `오류`, `검증 완료`, `게시 준비 불가`, `초안 저장`, `초안이 저장되었습니다.`, `로그아웃`, and concise validation messages that identify a line and repair action.

The `admin-import.png` concept is a visual-direction reference. Issue #3 intentionally omits its audio field and publish action; this slice ends at a persisted, validated draft. Never display a draft as publish-ready while validation errors remain.

## Issue #11 fidelity and accessibility ledger

Compare the four original concepts with actual entry, home, setup, player, and import screens, not with an HTML mock. The reference PNGs are 852×1846 (entry/home presentation board), 853×1844 (setup/player), and 1506×1045 (admin). Capture each real route at those sizes and also at 390×844, 375×667, and 768×1024. The entry/home board contains two separate phone views; the application still renders one route at a time. Keep screenshots outside source control.

| Comparison point | Reference / written contract | #11 disposition |
| --- | --- | --- |
| Palette | Charcoal, vivid green, gray borders | Flat `#0d1216` / `#58cc4f` retained; illustrative concept gradients are intentionally omitted by the written token contract. |
| Typography | Legible bilingual sans serif; first hint at least 64px | Sans serif and at least 64px hints retained (up to 128px in tall portrait views). Bounded scrollable long-text canvas and whole-word Korean control wrapping prevent unreadable overflow. The concept's serif `I` is not used because the written contract requires sans serif. |
| Touch / selected state | Large controls, visible focus and green selection | Setup back control increased from 30px to 48px; selected level number now uses dark text on green; link/summary focus and screen-reader selection states added. |
| Mobile composition | Practice controls and bottom dock must not overlap | Reduced wasted player spacing; at ≤700px mobile height the dock is in document flow and can be reached by scrolling. Larger phones retain the fixed dock. This is an intentional responsive exception for short screens. |
| Tall portrait composition | The native player reference uses a roughly 380px canvas and actions close to the dock | At ≥720px width and ≥1200px height, the practice column distributes its available height, scales its canvas to 340–420px, and keeps the dock in flow. At 853×1844 the canvas is about 387px, with a 48px action-to-dock gap instead of roughly 900px. The narrow column, content order and short-phone layout are preserved. |
| Keyboard reading | Overflowing bilingual text must remain readable without touch | Both practice regions are named tab stops with a visible focus outline. Tab/PageDown scrolls a revealed five-phrase group without advancing the lesson; rapid reading has the same explicit focus treatment. |
| Icons / branding | Proper round-stroke SVGs, no placeholder shapes | Replaced lesson `+` placeholders with a consistent 2px book icon. Arbitrary uploaded lessons have no topic-icon metadata, so the sample sunrise/chat distinction is not inferred from titles. The existing single M brand stays consistent across routes instead of the three different illustrative marks. |
| Admin density | Desktop two-column import, preview below; stacked mobile fields | Aligned compact desktop file rows and moved validation beneath metadata, bringing the preview back into the first desktop viewport. Removed the duplicate administrator kicker; spaced mobile header actions. Existing header links replace the illustrative sidebar; no unimplemented help/navigation is invented. |
| Data / control states | Real lesson counts, playback, validation and progress | Real 3/10-phrase fixtures, zero-at-start progress, actual recording timeline and validation messages remain. No sample 24-phrase counts, decorative fake waveform, or fake continuation record. |

Above-the-fold copy delta: #11 adds only operational `설치 및 온라인 이용 안내` with its expanded online-only/browser installation instructions, plus conditional screen-wake fallback copy. These are required by #11, not marketing or extra navigation. Existing approved level names and learner CTAs are unchanged. State-specific listening labels, admin lifecycle links/audio validation, session defaults and completion history come from the approved #4–#10 slices. Native file-picker labels follow browser locale. No offline-download, automatic installation, speech-scoring or recording claim is added.
