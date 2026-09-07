# Meta Shadowing UI contract

The visual references for this contract are `concepts/entry-home.png`, `concepts/session-setup.png`, `concepts/learning-player.png`, and `concepts/admin-import.png`. They define the same product across the learner journey and the administrator import flow. Actual interface text and controls remain code-native.

## Approved setup refinement (2026-09-07)

- Remove the setup-only brand bar and large title block. Keep one compact top row with the `레슨` back action, the lesson title/metadata block, and a session-options gear. Center the back action against the complete title and metadata block. Use an 18–20px title and 13px metadata; long titles wrap within the title column.
- Present levels 1–8 as an ordered vertical learning path: 56px numbered circles, gently staggered by 16–24px increments, linked by neutral lines, with readable names on the right. Only the selected node is green; all nodes remain selectable. No locks, mascot art, invented completion, or new progression rules.
- Keep semantic buttons, selected-state announcements, and keyboard order 1–8. Node and label form one touch target. Decorative connectors are noninteractive and track row height when labels wrap.
- Keep only the start action below the path. The top-right gear opens a bounded, scrollable session-settings dialog with a title, close controls, Escape dismissal, contained Tab navigation, and focus restoration to the gear. Keep all existing audio/group/WPM preferences, including persistence and conditional controls. Scope the new styling to setup so administrator settings remain unchanged.
- The player sentence-menu return action `첫 화면으로` sits at the top-right of the popup and still navigates to `/home`. Keep its primary green styling in a compact, labeled button with a dark border and focus outline on the green header. Place a full-width `닫기` action with an X icon in the bottom footer; it dismisses the menu without navigating and shares Continue's primary styling and pressed edge.
- The sentence-menu title, lesson metadata, and selection guidance share one bright brand-green header surface with dark, high-contrast text. Keep the sentence list and footer background dark. Escape dismissal, current-sentence focus, and focus restoration remain unchanged.

## Approved player refinement (2026-09-07)

This player-only revision supersedes the older player sizing, accent, dock, and CTA entries below. Entry, home, and administrator styling are unchanged; setup has its own approved refinement above.

- Keep the dark charcoal theme. Use a rounded yellow (`#ffc800`) lesson progress bar, blue (`#39baff`) audio affordance inside a bilingual speech bubble, and a green bottom action with a shallow pressed edge.
- Target text and first-word hints are 22–28px; Korean translations are 16px; player headings are 16–20px. Icons are 22px inside targets of at least 44px. Do not scale text up merely because the viewport is tall.
- Use one bottom action region: `CONTINUE` before the three required listens, then `REPEAT` and `NEXT`. R/Repeat adds exactly two extra cycles together and starts the fourth listen. The fifth uses the same controls and subtitle rules as the required cycles; repeated R may restart a listen but cannot add more cycles. Running audio exposes `PAUSE`, and a failed recording exposes `RETRY`.
- Preserve the selected mode for the extra pair: manual mode waits for Space/Continue between listens and for Space/Next (or R) after the fifth; automatic mode retains each level's speaking windows, then advances after the fifth speaking window and configured next-unit delay. After the third speaking window finishes, automatic mode waits indefinitely for REPEAT or NEXT; it does not automatically advance, and the choices are not shown during the speaking window. Levels 6–8 keep their existing WPM and line timing.
- Show listen progress in a separate strip immediately below the lesson context. Use three connected circles: gray dots for pending cycles and green checkmarks for completed cycles. Adding the pair smoothly makes room for circles four and five and reveals them in order, without delaying playback; reduced-motion preferences reveal them immediately. Keep the count accessible to screen readers without visible count text. Omit the standalone audio timeline and elapsed/total timestamps. For levels 1–5, show actual recording progress along the speaker button's rounded-square outline: freeze on pause, reset for each recording/replay, and finish at the recording's end. Unknown-duration recordings retain a neutral track without an invented percentage. Guidance height follows its actual text instead of reserving a blank second line.
- Preserve keyboard shortcuts, bilingual subtitle reveal, group boundaries, recording errors, and learning records. The audio icon and primary action still pause running playback. Omit the separate speaking-pause action; opening settings or the sentence menu pauses speaking time without beginning a new listen. Keep screen-wake protection best-effort and silent, with no fallback notice.
- Center the player in a column capped at 640px on tablet/desktop. Keep the bottom action outside the scrollable content, with safe-area padding. The lesson title and instructions remain pinned; long phrases scroll inside the focusable subtitle region. Short landscape views may scroll the content without moving the bottom action.
- Visible English action labels also appear in their accessible names, followed by the Korean action description. Keyboard hints are secondary and hidden on touch/narrow layouts.
- Mode and speed appear immediately left of the settings icon in the top navigation, including while settings are open. Below 520px, retain the M mark without the wordmark to leave room for the full mode/WPM label. Group size and speaking timers remain near the practice content.
- Across all eight levels, the player settings gear opens a bounded, scrollable modal over the retained lesson. Use the green menu header and primary close action, contained keyboard focus, Escape dismissal, and focus restoration to the gear. Preserve settings and pause media/timers when opening; closing never auto-resumes.
- Sentence lists, player settings, and setup settings dismiss on an outside click or tap, but not when dragging from inside the dialog onto its backdrop. Keep Escape and explicit close actions. Completed listens animate the green circle fill and incoming connector briefly; reduced-motion users see the same completed state immediately.
- The top-left hamburger opens a sentence list with chapter headings, section dividers, numbered bilingual phrases, and the current phrase/group highlighted. Back-to-lessons lives inside this menu. Opening it pauses media/timers and protects keyboard focus; dismissal does not auto-resume. Selecting any sentence resets its practice state and saves that position (the containing group in levels 4–5), without completing skipped practice. Selecting after a completed session starts a new run and preserves the previous history entry.
- Remove the in-canvas previous/restart/next control row. Keep keyboard shortcuts, bottom playback/Repeat/Next actions, and the compact subtitle-reveal action directly above the bottom action where applicable.
- Across all eight levels, left-align the lesson context to the 640px practice column. Its three rows are: title with current level, fixed learning-method instruction, then yellow lesson progress and count. The navbar contains only navigation/branding/mode/options. Playback, pause, repeat, and settings do not change the instruction; playback failures retain a separate actionable error. Let text wrap naturally on narrow screens without reserving empty space.
- Above the speech bubble, show the current script section heading with a compact book icon, 15px title, optional distinct 13px Korean translation, and a trailing thin rule. Preserve supplied section names/numbers verbatim; never invent numbers for untitled material. Keep unnamed boundaries as thin dividers. This heading follows sentence/group navigation across all eight levels, remains behind the settings popup, and is replaced by completion content.
- In levels 1–5, two or more separately double-quoted target-language lines form a dialogue when Korean has the same number of nonempty lines. Accept mixed straight/curly double quotes; Korean punctuation does not determine dialogue detection. Pair each target line with its Korean translation directly below, alternating left/right/left bubbles in source order. Keep one shared playback/progress button above and outside the conversation; playback still covers the whole phrase, with no inferred turn timing. Preserve quotes, ordinary or mismatched text as a single block, and group boundaries (restart alternation per phrase). Hint-only levels keep the existing single first-token hint until subtitles are revealed. Long conversations scroll in one focusable region; bubbles do not have their own scroll areas.

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
