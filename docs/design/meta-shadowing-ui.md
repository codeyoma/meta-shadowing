# Meta Shadowing UI contract

The visual references for this contract are `concepts/entry-home.png`, `concepts/session-setup.png`, and `concepts/learning-player.png`. They define the same product at three points in the learner journey. Actual interface text and controls remain code-native.

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

Icons use clean two-pixel round strokes and current color. Use proper SVG components for arrows, settings, playback, subtitles, retry, and speed; do not use text glyph substitutes.

## Responsive behavior

- On mobile, use one centered column, full-width controls, safe-area padding, and a bottom dock that does not cover content.
- On tablet and desktop, retain the same information order and place the primary learner surface in a centered narrow column. Avoid turning the flow into a dashboard or card grid.
- Maintain visible focus, keyboard operability, and at least 44px touch targets at every size.

## Copy lock for the first learner slice

Allowed entry copy: `Meta Shadowing`, `나만의 문장으로, 여덟 번 다르게.`, `헤드폰을 끼고 오늘의 레슨을 시작하세요.`, `베타 비밀번호`, `입장하기`, `개인 학습 자료를 위한 비공개 베타`.

Allowed learner-home copy: `오늘도 한 프레이즈부터.`, `마지막 학습 계속하기`, `언어 선택`, `English`, `영어`, `日本語`, `일본어`, `영어 레슨`, `일본어 레슨`, lesson names, localized lesson names, and phrase counts.

Allowed setup copy: `레슨`, lesson names, localized lesson names, phrase count, `학습 단계`, the eight approved level names, `세션 설정`, `수동`, `자동`, `현재 단어`, `누적 단어`, `재생속도`, and `학습 시작`.

Do not add promotional claims, badges, fake statistics, category labels, or new navigation above the fold.
