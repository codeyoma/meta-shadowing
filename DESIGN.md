---
name: 쇄도잉 Native
description: Solid, friendly spoken practice for iPhone.
colors:
  primary: "#ffc800"
  primary-pressed: "#ff9600"
  accent-bee: "#58cc02"
  accent-fox: "#58a700"
  selection-light: "#d7ffb8"
  selection-dark: "#254b34"
  macaw: "#1cb0f6"
  mint: "#2dd4bf"
  beetle: "#ce82ff"
  blue-soft-light: "#e4f5fd"
  blue-soft-dark: "#143953"
  link-dark: "#8dd8ff"
  danger-light: "#ac3026"
  danger-dark: "#ffb4a9"
  canvas-light: "#ffffff"
  soft-light: "#f7f7f7"
  body-light: "#3c3c3c"
  navy: "#042c60"
  secondary-light: "#4b4b4b"
  line-light: "#e5e5e5"
  outline-light: "#afafaf"
  canvas-dark: "#101c2c"
  card-dark: "#192a3e"
  soft-dark: "#20334a"
  text-dark: "#f4f7fa"
  secondary-dark: "#b8c7d8"
  line-dark: "#344960"
  outline-dark: "#7890ab"
typography:
  display:
    fontFamily: "Nunito_800ExtraBold, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 800
    lineHeight: 1.2
  sentence:
    fontFamily: "Nunito_800ExtraBold, system-ui, sans-serif"
    fontSize: "29px"
    fontWeight: 800
    lineHeight: 1.2
  stage-title:
    fontFamily: "Nunito_800ExtraBold, system-ui, sans-serif"
    fontSize: "23px"
    fontWeight: 800
    lineHeight: 1.2
  stage-number:
    fontFamily: "Nunito_800ExtraBold, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.2
  headline:
    fontFamily: "system-ui, sans-serif"
    fontSize: "27px"
    fontWeight: 800
    lineHeight: 1.45
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.45
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.45
  support:
    fontFamily: "system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.45
  badge:
    fontFamily: "system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    lineHeight: 1.45
  button:
    fontFamily: "system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 700
    lineHeight: "24px"
    letterSpacing: "0.2px"
rounded:
  track: "8px"
  badge: "10px"
  choice: "14px"
  control: "16px"
  symbol: "20px"
  cycle: "22px"
spacing:
  "4": "4px"
  "8": "8px"
  "10": "10px"
  "12": "12px"
  "14": "14px"
  "16": "16px"
  "20": "20px"
  "24": "24px"
  "40": "40px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.navy}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 18px"
  button-secondary:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.navy}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    padding: "13px 18px"
  header-action:
    textColor: "{colors.navy}"
    rounded: "{rounded.choice}"
    padding: "10px"
  badge-blue:
    backgroundColor: "{colors.blue-soft-light}"
    textColor: "{colors.navy}"
    typography: "{typography.badge}"
    rounded: "{rounded.badge}"
    padding: "5px 10px"
  card:
    backgroundColor: "{colors.canvas-light}"
    textColor: "{colors.body-light}"
    rounded: "{rounded.control}"
    padding: "20px"
  choice-selected:
    backgroundColor: "{colors.selection-light}"
    textColor: "{colors.navy}"
    typography: "{typography.body}"
    rounded: "{rounded.choice}"
    padding: "16px"
  progress-track:
    backgroundColor: "{colors.line-light}"
    rounded: "{rounded.track}"
    height: "16px"
  stage-number:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.navy}"
    typography: "{typography.stage-number}"
    rounded: "{rounded.symbol}"
    padding: "10px"
---

# Design System: 쇄도잉 Native

## Overview

**Creative North Star: "Friendly spoken practice"**

쇄도잉 makes spoken practice feel approachable through solid surfaces, rounded display lettering, original lesson artwork, and buttons that visibly depress. The owner-approved Duolingo-inspired direction supplies the Bee-yellow, Macaw-blue, navy, and white palette; 쇄도잉 uses the owner-supplied name, logo and icon.

Native iPhone navigation and readable Korean and English organize this playful character around one clear next action. Crisp borders and generous spacing carry the hierarchy in both appearances. Encouragement comes from actual learning progress and plain, friendly language.

**Key Characteristics:**

- Solid, tactile controls with a flat bottom lip.
- Rounded English display type paired with system Korean and interface text.
- Original lesson artwork and restrained semantic color.
- Native navigation, scalable text, and truthful progress.

This guide records the implemented native visual system. Sources are `src/components/theme.ts`, `src/components/ui.tsx`, the four screens in `src/app/`, and their native stack configuration. `PRODUCT.md` holds product constraints; `docs/design/native-learning.md` holds the approved surface direction. The owner's legacy DESIGN.md supplied color authority, not web layouts or proprietary assets. This document does not establish physical-device or release acceptance.

Portable token sizes use `px` for DESIGN.md tooling; each numeric value represents a React Native logical point at font scale 1, not a CSS implementation or physical screen pixel. Frontmatter owns primitives. The sidecar's HTML/CSS is only a documentation preview: it uses local font fallbacks and simple SVG icon surrogates, not the native font bundle or SF Symbols renderer. Its synthesized tonal ramps are preview metadata, not additional app colors.

## Colors

Bright Bee and Macaw accents sit against white or deep navy surfaces, with appearance-specific text and structural colors.

### Primary

- **Bee yellow** drives primary actions, stage 1 numerals, and confirmed learning markers.
- **Fox orange** forms the primary button lip and selected or completed borders.
- **Soft green selection / Deep green selection** mark selected choices and completed-state support surfaces in light / dark appearance.

### Secondary

- **Macaw blue** distinguishes stage 2 and the optional blue progress fill.
- **Pale blue support / Deep blue support** back informational badges and the speaker symbol.
- **Light blue link** makes secondary-action labels readable on dark cards.

### Tertiary

- **Brick recovery ink / Pale coral recovery ink** identify the destructive lesson-removal action in light / dark appearance. These are semantic action colors, not alternate primary-button fills.

### Neutral

- **Canvas white** serves both light background and card; **Soft gray surface** backs neutral badges and unselected pressed choices.
- **Navy ink** carries light headings, links, symbols, and text over bright accents. **Body charcoal** and **Secondary charcoal** separate main and supporting text.
- **Structural gray** draws light borders, tracks, and disabled fills; **Waiting-state gray** outlines unconfirmed cycle markers.
- **Deep navy canvas**, **Navy card surface**, and **Raised tonal surface** form the dark surface ladder.
- **Near-white ink** serves dark headings and body text; **Soft blue-gray ink** supports secondary text.
- **Blue-gray structure** draws dark borders, tracks, and disabled fills; **Waiting-state blue-gray** outlines unconfirmed cycle markers.

| Native semantic role | Light token | Dark token |
| --- | --- | --- |
| background | canvas-light | canvas-dark |
| card | canvas-light | card-dark |
| soft | soft-light | soft-dark |
| text | body-light | text-dark |
| heading | navy | text-dark |
| secondary | secondary-light | secondary-dark |
| line / disabled | line-light | line-dark |
| outline | outline-light | outline-dark |
| accent / accentPressed | primary / primary-pressed | primary / primary-pressed |
| onAccent | navy | navy |
| selection | selection-light | selection-dark |
| blue | macaw | macaw |
| blueSoft | blue-soft-light | blue-soft-dark |
| link | navy | link-dark |
| danger | danger-light | danger-dark |

**The Readable Accent Rule.** Use navy ink on Bee-yellow and Macaw-blue fills; use the appearance-specific heading and link colors on pale or dark surfaces.

The owner swapped Primary and Accent Bee, and Primary Pressed and Accent Fox. Primary is now yellow and its lip is orange; accent-bee retains the former primary green, and accent-fox retains the former pressed green. These reserved accent roles are documented even when not drawn. Existing green selection surfaces are unchanged. Red remains outside these component tokens; illustration hues remain asset-local.

## Typography

**Display Font:** bundled Nunito ExtraBold, loaded as `Nunito_800ExtraBold` (weight 800), with system fallback.
**Body Font:** native system font, including Korean glyph support.
**Character:** rounded English display lettering supplies warmth; Korean headings and functional text retain native readability. Labels use their natural language and case.

### Hierarchy

- **Display:** `display` for the lesson title; `sentence` for the English learning sentence.
- **Stage identity:** `stage-title` for “Stage 1” / “Stage 2”; `stage-number` for the colored numeral.
- **Headline:** `headline` for Korean screen introductions; the completion heading uses a larger system size (30 points).
- **Title:** `title` for settings group headings.
- **Body:** `body` for explanatory text; translation uses a larger system size (18 points). Supporting variants use 14–16 points as their context requires.
- **Label:** `support` for notes, `badge` for compact metadata, and `button` for action labels.

Display line height is 1.2 times its scaled size; other `Label` text uses 1.45. Action labels scale their 17-point size and 24-point line height together. These are observed roles, not a uniform mathematical type scale. Native navigation titles use the system renderer with weight 700.

**The One Scale Rule.** Scale custom text size and line height once with the current system font scale, without a text-size cap; allow text containers to grow.

`Label` and action-label `Text` multiply size and line height by `useWindowDimensions().fontScale`; `allowFontScaling={false}` prevents a second scaling pass. It does not disable the explicit scaling. Icons scale separately, up to 1.5 times their base size. Display text falls back to the system if the bundled font cannot load.

## Layout

Use a single native scrolling column with automatic content insets. The screen gutter is 24 points; Library and Lesson groups use 24-point gaps, Player uses 20, and Settings uses 30. Standard cards use 20-point padding and 16-point internal gaps. Supporting clusters use the smaller spacing steps. Library, Lesson, and Settings end with 40-point scroll padding.

The player's scroll content can grow and centers the sentence card when room permits. Its action region sits beneath the scroll view, with 24-point horizontal padding, no top divider, and bottom padding equal to the larger of the safe-area inset and 14 points. Preserve this native safe-area relationship.

Metadata rows wrap. Learning Settings uses a native 0.25–3× slider in 0.05× increments, a large current-value label, endpoint labels, and proportionally positioned 1×/2× ticks. The slider has a 48-point touch region and an accessible name. Text containers remain intrinsic and scrollable. There is no progression-mode picker or explanatory footer.

The supplied wide logo appears above Library content on a white plate in both appearances so its dark lettering stays readable. Preserve its 2:1 ratio and built-in transparent margins; cap the plate at 260 points wide and center it to leave room for the book action.

The original lesson illustration fills the card width with a 1.9 aspect-ratio crop and repeats as a 72-point square thumbnail. Keep its central safe composition and separate visual decoration from readable text.

## Elevation & Depth

Depth is structural. App cards use solid fills and crisp borders, without diffuse shadows. Action buttons alone receive a flat bottom lip; a wrapper reserves its space. The platform may render its own navigation-bar material or elevation around a header item.

### Shadow Vocabulary

- **Primary lip:** `0 4px 0` in `primary-pressed`.
- **Secondary lip:** `0 4px 0` in the appearance's `line` color.
- **Pressed / disabled:** no lip; a pressed action face translates down 4 points. Disabled actions keep a muted fill and do not press.

**The Solid Press Rule.** Reserve app-drawn shadows for the flat action-button lip. Pressing lowers the button face into that lip without moving surrounding layout.

The implemented press response is immediate, without a custom duration or spring. Header actions reduce opacity to 0.65; the destructive text action reduces it to 0.6. Native controls do not acquire web hover states. Keyboard focus and pointer styling in sidecar snippets serve the documentation panel only.

## Shapes

Use continuous rounded rectangles for cards and action buttons with the `control` radius. Choices and custom header hit regions use `choice`; informational badges use `badge`. Progress tracks use `track`; stage numerals and speaker-symbol tiles use `symbol`. Cycle markers use `cycle` with a minimum 44-point size and intrinsic growth.

Cards and choice outlines are 2 points; quiet section dividers are 1 point. Keep illustration clipping at the enclosing card edge. The stage numeral has a minimum 56-point width and height, 10-point padding, and no fixed height; it must expand with the numeral's scaled type.

## Components

### Buttons

Tactile, clear, and generously sized. `ActionButton` uses a minimum 54-point height, `control` radius, 13-point vertical / 18-point horizontal padding, and a 10-point icon-label gap. Primary actions use Bee with navy text. Secondary actions use the current card fill, link ink, and line border. Disabled actions use the current disabled fill and secondary ink. Labels wrap and center; the minimum is not a fixed height. Press behavior follows the Solid Press Rule.

### Badges

Compact informational labels, not rewards. `Badge` uses 5-point vertical / 10-point horizontal padding, a 6-point icon gap, and optional 14-point SF Symbol. Neutral, green, and blue tones use the semantic soft, selection, and blue-soft fills; all use heading ink. Text can expand the badge.

### Cards and artwork

The owner supplied `assets/brand/logo.png` and `assets/brand/app-icon.png`; preserve both original files without redrawing or recoloring. The app display name is **쇄도잉**. Bundle identifiers and URL schemes remain stable to preserve installed records. The icon includes transparency and rounded corners: it is a prototype source, not a certified App Store-ready icon.

Solid containers with a 2-point line border, `control` radius, and the standard padding and gap. The Library variant removes outer padding, clips the illustration at its top edge, and restores padding around its content. The sentence card increases vertical padding to 26 points and separates content by 22. The shipping artwork is `assets/illustrations/morning-notes.png`; preserve its adjacent `morning-notes.prompt.txt` provenance. It is decorative and excluded from accessibility announcements.

### Choices

`Choice` is a labeled native radio action with minimum 54-point height, a 2-point border, and `choice` radius. Regular rows have 16-point padding, a 24-point check-circle or empty-circle symbol, title, and optional detail. Compact choices have 12-point padding and a 17-point selection symbol beneath the title. Selected rows use the selection fill and Fox border; unselected pressed rows use the soft fill. Save changes quietly and retain the visible checked state.

### Navigation

Settings is a category index with one implemented row, Learning Settings. The
row uses a sliders symbol, flexible label and chevron; the nested screen has a
native icon-only Back button and title. Both screens use the same native header
height instead of toggling between an in-page heading and a navigation bar.
Both remain within the browsing tab shell.

Use icon-only Expo Router native tabs for Books, Stages and Settings, with labeled accessibility targets. The owner's transparent mascot occupies an inert, disabled item at the far left: no navigation, sound, or haptic. Its original colors are preserved. Native SF Symbols use books.vertical, map and gearshape, with selected filled variants. The OS owns the tab material and selection capsule; do not imitate it with app-drawn card shadows. Tab content follows the current canvas color.

The shared browsing header contains exactly three groups: a language-flag button, level plus numeric XP and track, and flame plus consecutive-day count. The 8-point XP track sits above the level/XP text, half the standard track height; the level stays left-aligned and the numeric XP text aligns to the track's right edge. Each flag has a centered two-letter label underneath (EN, JP, CN, DE, ES, FR), and the streak count sits centered below the flame. Both side groups align to the bottom of the header content; the flag retains its 48-point touch target. Use actual language-local data, refresh on navigation, foreground and local midnight, and show a neutral pending state if unavailable. Language selection opens a native sheet with only supported languages. The header has a 24-point gutter, 12-point vertical padding and 2-point bottom divider; its height grows with Dynamic Type.

`HeaderButton` supplies transparent content with a minimum 44-point hit region and 10-point padding inside the native bar container. Do not recreate that container with an additional filled circle, border, or shadow. The player is a separate stack screen without the browsing bars; its options icon pauses and opens a native form-sheet drawer, and interactive pop is disabled. The player header shows the sentence progress track and right-aligned `n/total`, reserving counter width from the total's digit count, with no XP display or duplicate track below. A clipped light sweep moves left to right over the existing filled portion without changing progress; Reduce Motion disables it. The row below has method-level, speed, and disabled analysis icons. Method level opens a native guide dialog labelled with the level and method; guidance content remains empty until supplied. The drawer's return button reads “학습 이어하기”; its stage-return action uses Cardinal (`#ff4b4b`) text and icon on white. No decorative speaker tile appears inside the sentence card. Fresh sentences have a one-second settling interval before audio; ordinary cycle confirmation remains immediate.

### Progress and stages

Enabled browsing buttons use `FeedbackPressable`: one light native haptic and
the owner-supplied 100 ms `button-soft-tick.wav` on an accepted press. Books,
Stages and Settings native-tab presses use the same feedback. The player footer
is haptic-only. Options, speed/language settings, settings controls, the inert
mascot, and disabled controls stay silent. Keep visual pressed
states; feedback is cosmetic and must never delay learning or navigation.
Do not play sounds on mount, save, or automatic progress updates. Reuse a single
preloaded sound player, suppress rapid duplicate taps, and cancel pending sound
on backgrounding. Physical iPhone testing is required for haptic feel.

Tapping an available path coin opens an anchored orange popup instead of
starting playback. Its heading reads “STAGE 01 · Lv 1 자막 쉐도잉”, using the
selected stage's padded number, level and method name, followed by one white
start/resume action. It lives inside the scroll content, not a blocking modal:
the stage list remains scrollable and the popup moves with its coin. A tap on
the path background or the selected coin dismisses it. Its brief opacity
entrance respects Reduce Motion.
The overview's resume banner remains a direct entry. Entering the player from
either entry point waits one second, preserving confirmed cycle checks. Only an
already-ended, unconfirmed pass restarts its audio; interrupted audio keeps its
saved position. Returning from options or background activity remains paused.

Language flags, in picker order: 🇬🇧 English, 🇯🇵 Japanese, 🇨🇳 Chinese,
🇩🇪 German, 🇪🇸 Spanish, 🇫🇷 French. Keep the English identity and its existing
records unchanged when changing its flag. The picker opens at 80% height and
can expand/scroll. Unpopulated language catalogs and stage screens show a quiet
empty state, not English fallback content or an error alert.

Language selection leaves the row background unchanged; only the border uses
the orange selected accent, alongside the checked radio indicator. Other Choice
controls retain their green selected fill. Books has no instructional subtitle
or prototype/offline footer copy beneath its catalog.

`ProgressTrack` is a 16-point track with an 8-point radius, current line-color background, and Bee or Macaw fill. The fill is clamped to the real ratio and is absent at zero. Its small white highlight uses 0.3 opacity. Provide the native progress role, label, and numeric accessibility value.

Book cards are compact horizontal rows: cover on the left, title, sentence/chapter counts on one line separated by a slash, completed stages and a progress track beneath, then a minimum 44-point action on the right. Unknown chapter counts display a dash, never an invented value. Owned installed books use an arrow; missing packages use Download and unowned books use Purchase. Purchase remains a non-charging placeholder until commerce ships.

The stage screen uses a dark navy book summary with actual progress, a right-aligned stage count and a yellow resume banner, followed by a winding sixteen-node path. Nodes are 76-point circles scaled vertically to 0.8, with a solid raised edge and clipped diagonal highlights. Completed nodes use a green check, the current playable node uses a yellow play symbol, and locked/unavailable nodes use a lock and disabled semantics. Later stages unlock after the predecessor's required runs; completed stages remain replayable. Overview progress counts stages whose required runs are complete; the resume banner retains the saved phrase and cycle.

The player uses a full-width connected timeline of 48-point cycle nodes, without visible numbers or a count caption. The active outline follows actual audio progress; explicit confirmation reveals a check (120 ms feedback), then fills the connecting line to the next node (140 ms). Repeat preserves checks and slides two new nodes in from the right while existing nodes redistribute over 180 ms. Older saved long repeat sequences remain readable and scroll horizontally rather than shrink nodes. The footer has one icon-only play action, disabled during playback. Only at the initial three-cycle decision, a recycle-icon action appears beside it at a 1:3 width ratio; at five cycles it is hidden. Footer layout changes do not animate sideways. Only the central sentence card fades on a phrase change (120 ms). Both controls retain accessible labels; reduced motion removes spatial feedback. Back navigation and interruption handling still pause safely.

Show all sixteen stage identities, with 3–16 explicitly unavailable until their learning methods ship. The first newly completed stage chooses the book's XP stage for that day: up to two 10-XP runs for 1–10, three for 11–16. Other practice remains available without XP. Totals/levels/streaks are separate per language; no routine reward toast. Full rules live in `docs/learning-contract.md`.

### Recovery

Use native alerts for necessary recovery instructions and destructive confirmation. Inline destructive text uses the danger palette and a trash symbol. Preserve saved state and explain the next recovery action. There are no text-input fields in these four screens; do not synthesize one as part of this system.

## Do's and Don'ts

### Stage label and geometry refinements

- Under each stage coin, show two stars for stages 1–10 or three for 11–16,
  before the method label. Each completed full-stage run fills one orange star;
  empty stars use an outline. Earned stars persist across days, capped at the
  requirement, and do not count partial phrase cycles or session resumes.
  The group exposes its earned/total count to accessibility without extra visible copy.

- Stage-path background spans one continuous vertical gradient: Mint at 0%,
  Macaw at 50%, Beetle at 100%, at 22% opacity over the current canvas.
  This owner-requested path treatment is an exception to the general solid-surface rule.
- Level badges use solid Mint for Lv 1–2, Macaw for Lv 3–5 and Beetle for Lv 6–8,
  all with navy ink. Mint and Beetle are new method accents, not primary replacements.
- The overview metadata shows sentence count and content chapter count, not stage
  count. Missing chapter metadata stays a dash. Lock icons and disabled semantics
  remain, without visible locked/coming-soon captions. The stage screen has no
  package-delete action; its future location is not yet implemented.

- Both book and overview progress tracks place the compact `n/16` counter on the
  same row, immediately to the right, without the visible word "stage".
- Stage faces are true circles transformed vertically by 0.8: 76 points wide
  and 60.8 points high. Their icons and number badges are not distorted. Path
  connector centers and popup anchors use the same derived coin height.
- Each pair shares a separate level badge and name, including locked stages:
  Lv 1 자막 쉐도잉; Lv 2 순간 암기; Lv 3 첫 단어 힌트;
  Lv 4 다문장 암기; Lv 5 다문장 첫 단어; Lv 6 속사포 영한;
  Lv 7 속사포 한영; Lv 8 속사포 한글.
- These method-level badges are distinct from the language XP level in the
  browsing header. Renaming methods does not enable unfinished learning modes.

### Do:

- Do use the current semantic palette for light and dark appearances.
- Do preserve the raised button geometry and keep touch targets at least 44 points.
- Do let Korean and English wrap and let stage numerals grow with system text size.
- Do show selection with a checkmark and progress with numbers as well as color.
- Do derive progress and completion from confirmed learning state.
- Do keep original raster artwork with its prompt provenance.

### Don't:

- Don't copy Duolingo characters or proprietary fonts, or invent reward/streak values instead of reading real local completion data.
- Don't use white labels on the bright Bee-yellow primary button.
- Don't draw a second filled button or shadow inside the native navigation-bar container.
- Don't truncate or cap text to preserve a fixed card or badge size.
- Don't introduce diffuse app-card shadows, glass panels, or decorative gradients into the solid interface.
- Don't announce routine saves or turn interrupted practice into completion.
