# Meta Shadowing UI contract

The visual references for this contract are `concepts/entry-home.png`, `concepts/session-setup.png`, `concepts/learning-player.png`, and `concepts/admin-import.png`. They define the same product across the learner journey and the administrator import flow. Actual interface text and controls remain code-native.

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

Allowed entry copy: `Meta Shadowing`, `나만의 문장으로, 여덟 번 다르게.`, `헤드폰을 끼고 오늘의 레슨을 시작하세요.`, `베타 비밀번호`, `입장하기`, `개인 학습 자료를 위한 비공개 베타`, `비밀번호가 올바르지 않습니다.`, `지금은 입장할 수 없습니다. 잠시 후 다시 시도해 주세요.`.

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
