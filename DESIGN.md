---
version: alpha
name: Duolingo
website: "https://www.duolingo.com"
ref: "https://www.shadcn.io/design/duolingo"
description: >-
  A consumer-friendly language-learning system rendered on a pure-white canvas with a single saturated owl-green CTA pill ("#58cc02") that carries every primary action, a cartoon-illustration decoration layer of mascots and isometric phones, and two dedicated typefaces — Feather Bold for display headlines at 48–64px and DIN Round at 13–19px for body and uppercase 0.8px-tracked button labels. The system rejects the polite grayscale tone that other education brands lean on: navy headlines ("#042c60"), structural grays from "#3c3c3c" to "#afafaf", and accent colors named after animals (owl, macaw, cardinal, fox, bee) live inside CSS variables alongside per-character costume tints, while the white canvas runs edge-to-edge under every section.

seo:
  title: "Duolingo Design System for React — Owl green #58cc02, Feather Bold, 22 components"
  metaDescription: "Duolingo's design system as a DESIGN.md file. Owl green #58cc02 CTA, navy #042c60, Feather + DIN Round, 22 components. For React, Next.js, and AI tools."
  highlights:
    - "Owl-green voltage — #58cc02 carries every primary CTA and the brand wordmark; no second saturated accent exists"
    - "Two-typeface dialect — Feather Bold weight 700 at 48–64px for display, DIN Round weight 500–700 at 13–19px for body and UI"
    - "Uppercase button labels — DIN Round 15px weight 700 with 0.8px letter-spacing on every primary CTA, never sentence case"
    - "Mascot-driven decoration — Duo the owl, Lily, Junior, and Bea replace gradients, mesh backgrounds, and atmospheric depth"
    - "Animal-named color vocabulary — 352 CSS variables grouped as owl, macaw, cardinal, fox, bee, koala instead of numeric scales"
  tags:
    - "Education & Learning"
  lastUpdated: "2026-05-13"
  author:
    name: "Dov Azencot"
    url: "https://x.com/dovazencot"
  opening: |
    Duolingo's marketing system reads as a children's-book classroom rendered with platform-grade UI rigor. The canvas is pure white edge-to-edge — no cream tint, no gradient mesh, no dark hero band — and every section is anchored by cartoon mascots: Duo the green owl, Lily the purple teenager, Junior the rosy toddler, Bea the blue trans flag-coded human. Display headlines run Feather Bold at 64px / weight 700 / -1.28px letter-spacing in deep navy ("#042c60"), while the iconic green section titles ("free. fun. effective.", "backed by science", "stay motivated") sit at 48px in owl green ("#58cc02"). Body paragraphs drop to DIN Round at 17px / weight 500 / line-height 24px in mid-gray ("#777777") — the contrast between the heavy cartoon display type and the modest body sans is the brand's central rhythm.

    This page packages the marketing surface into one DESIGN.md file built on the Google Labs spec. Inside: 18 color tokens covering owl green CTA, navy display ink, mid-gray body, structural hairlines, and the animal-named accent family pulled from the site's 352 CSS variables (owl, macaw, cardinal, fox, bee, koala, beetle, fire-ant, kiwi); 11 typography tokens splitting Feather Bold display from DIN Round body, with the uppercase 0.8px-letter-spaced button label as its own token; 5 corner radii anchored at the 12px button-border-radius and 16px web-ui radius; 9 spacing values built on an 8px / 24px / 32px / 48px / 96px scale; and 22 components covering the green CTA pill, secondary outline button, language-flag chip row, mascot scene card, illustrated feature card, navy footer hero, and the top language switcher.

    Feed the file to Claude, Cursor, or GitHub Copilot and the agent reproduces Duolingo's specific dialect — owl-green pill on white, uppercase button labels, navy display, mascot illustration in the margin — instead of a generic education-app theme of pastel rectangles and Inter headings. Reference the tokens directly in Tailwind config or as CSS variables. Where most ed-tech brands hedge with serif gravitas or muted earth tones to signal seriousness, Duolingo holds the line on a single saturated green and a cartoon owl — confidence by playful restraint, not corporate softening.
  related:
    - href: "/design"
      title: "Browse all design systems"
      description: "The full directory of DESIGN.md files on shadcn.io, with live mockups for each."
    - href: "https://www.duolingo.com"
      title: "Duolingo — official site"
      description: "The free, fun, and effective way to learn a language, anchoring the design language documented here."
    - href: "https://github.com/google-labs-code/design.md"
      title: "The DESIGN.md specification"
      description: "Google Labs' open spec for machine-readable design system files — the format this page is built on."
  questions:
    - id: "primary-color"
      title: "What is Duolingo's primary brand color?"
      answer: "Duolingo's primary is owl green at #58cc02 — the exact hex carried by the `--color-owl` and `--color-tree-frog` CSS variables. It anchors the wordmark, the 'Get started' CTA pill, the Duo mascot's body, and the section headings (`free. fun. effective.`, `backed by science`, `stay motivated`, `personalized learning`). The deeper press state is #58a700 (`--color-tree-frog`) and the soft tint is #d7ffb8 (`--color-sea-sponge`). The brand explicitly refuses to introduce a second saturated CTA color — secondary actions render as a blue-outlined pill with #1cb0f6 (macaw) text on white, not as a competing fill."
    - id: "typography"
      title: "What typography does Duolingo use, and what's the substitute?"
      answer: "Duolingo runs two custom typefaces. Feather Bold (declared as `feather, sans-serif`) carries display at 48px and 64px, weight 700, with -1.28px letter-spacing on the 64px hero — used for `<h1>` and `<h2>` only. DIN Round (`din-round, sans-serif`) handles everything else: 17px body at weight 500 with 24px line-height, 13–15px UI labels at weight 700, and a signature uppercase button label at 15px / weight 700 / 0.8px letter-spacing. Neither face is open-source. Nunito Bold is the closest free substitute for Feather; DIN Next Rounded or Quicksand approximates DIN Round."
    - id: "ctas"
      title: "Why are Duolingo's primary buttons uppercase with letter-spacing?"
      answer: "The primary CTA renders DIN Round at 15px / weight 700 / 0.8px letter-spacing / uppercase — the most-frequent typography signature in the extraction (42 occurrences). The all-caps treatment is the brand's UI confidence signal: it reads as a stamped game-button rather than a sentence. The pill geometry combines 16px border-radius (`--web-ui_button-border-radius`) with a 3–4px flat bottom-shadow lip that gives every primary button a tactile, gamepad-button feel. Sentence-case CTAs would break the gamified tone the system depends on."
    - id: "mascots"
      title: "What role do the cartoon mascots play in the system?"
      answer: "Mascots are the entire decoration layer. The site has zero gradient meshes, zero atmospheric photography, zero pattern textures — instead, the 352 CSS variables include named characters (Duo, Lily, Junior, Bea, Falstaff, Eddy, Lin, Lucy, Vikram, Zari, Oscar, Bea Junior) each with their own `-shine`, `-radio`, and `-secondary` color triplets. Hero sections cluster mascots in floating constellations; feature sections pair one isometric mascot scene per illustrated text panel. Substituting stock illustration breaks the system; the character library is brand-specific IP."
    - id: "color-vocabulary"
      title: "Why are Duolingo's colors named after animals?"
      answer: "The 352 `:root` CSS custom properties name colors after animals and birds rather than numeric scales — `--color-owl` (#58cc02), `--color-macaw` (#1cb0f6), `--color-cardinal` (#ff4b4b), `--color-fox` (#ff9600), `--color-bee` (#ffc800), `--color-koala` (#d7d7d7), `--color-beetle` (#ce82ff), `--color-fire-ant` (#ea2b2b), `--color-kiwi` (#7ac70c). The vocabulary mirrors the mascot taxonomy and makes the design tokens legible to non-designers across the org. Where shadcn's `primary` / `destructive` / `accent` are role-based, Duolingo's are character-based — color belongs to a creature."
    - id: "use-in-project"
      title: "Can I use this DESIGN.md to build a gamified learning React app?"
      answer: "Yes — the file feeds Claude, Cursor, or Copilot and the agent will reproduce Duolingo's specific dialect (owl-green pill with bottom-shadow lip, uppercase DIN-Round labels, navy Feather display, mascot scene cards on pure white) rather than a generic shadcn theme of subdued grayscale. Every hex, type token, radius, and spacing value is a quoted value you can paste into Tailwind config or CSS variables. The mascot illustrations are Duolingo IP — source your own character set or rely on placeholder isometric shapes when reusing the system."

colors:
  primary: "#58cc02"
  primary-pressed: "#58a700"
  primary-soft: "#d7ffb8"
  primary-mint: "#a5ed6e"
  ink-display: "#042c60"
  ink-display-deep: "#100f3e"
  ink-display-blue: "#000437"
  body: "#3c3c3c"
  body-strong: "#4b4b4b"
  body-muted: "#777777"
  body-soft: "#afafaf"
  canvas: "#ffffff"
  link: "#0000ee"
  link-ink: "#000000"
  accent-macaw: "#1cb0f6"
  accent-cardinal: "#ff4b4b"
  accent-fox: "#ff9600"
  accent-bee: "#ffc800"
  accent-beetle: "#ce82ff"

typography:
  display-xl:
    fontFamily: "feather, sans-serif"
    fontSize: 64px
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-1.28px"
  display-lg:
    fontFamily: "feather, sans-serif"
    fontSize: 48px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: 0
  heading-md:
    fontFamily: "din-round, sans-serif"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: 0
  heading-sm:
    fontFamily: "din-round, sans-serif"
    fontSize: 19px
    fontWeight: 700
    lineHeight: 1.4
    letterSpacing: 0
  body-lg:
    fontFamily: "din-round, sans-serif"
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1.41
    letterSpacing: 0
  body-md:
    fontFamily: "din-round, sans-serif"
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.47
    letterSpacing: 0
  body-sm:
    fontFamily: "din-round, sans-serif"
    fontSize: 13px
    fontWeight: 700
    lineHeight: 1.23
    letterSpacing: 0
  label-uppercase:
    fontFamily: "din-round, sans-serif"
    fontSize: 15px
    fontWeight: 700
    lineHeight: 1.33
    letterSpacing: "0.8px"
    textTransform: uppercase
  label-uppercase-sm:
    fontFamily: "din-round, sans-serif"
    fontSize: 14px
    fontWeight: 700
    lineHeight: 1.21
    letterSpacing: "0.8px"
    textTransform: uppercase
  link-inline:
    fontFamily: "din-round, sans-serif"
    fontSize: 17px
    fontWeight: 500
    lineHeight: 1.18
    letterSpacing: 0
  caption:
    fontFamily: "din-round, sans-serif"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: 0

rounded:
  none: "0px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  full: "9999px"

spacing:
  xxs: "1px"
  xs: "8px"
  sm: "10px"
  md: "12px"
  base: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
  section: "96px"

components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.canvas}"
    typography: "{typography.label-uppercase}"
    rounded: "{rounded.lg}"
    padding: "13px 16px"
    height: "50px"
    border: "0"
  button-primary-pressed:
    backgroundColor: "{colors.primary-pressed}"
    textColor: "{colors.canvas}"
    typography: "{typography.label-uppercase}"
    rounded: "{rounded.lg}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.accent-macaw}"
    typography: "{typography.label-uppercase}"
    rounded: "{rounded.lg}"
    padding: "13px 16px"
    height: "50px"
    border: "2px solid {colors.body-soft}"
  button-secondary-hover:
    backgroundColor: "#f7f7f7"
    textColor: "{colors.accent-macaw}"
    typography: "{typography.label-uppercase}"
    rounded: "{rounded.lg}"
  language-chip:
    backgroundColor: "transparent"
    textColor: "{colors.body-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
    padding: "9.5px 14px"
    height: "40px"
    border: "0"
  language-chip-active:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-pressed}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.sm}"
  top-nav:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.none}"
    height: "70px"
    padding: "0px 16px"
  language-switcher:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body-muted}"
    typography: "{typography.label-uppercase-sm}"
    rounded: "{rounded.none}"
    padding: "8px 24px"
  section-heading-green:
    backgroundColor: "transparent"
    textColor: "{colors.primary}"
    typography: "{typography.display-lg}"
    rounded: "{rounded.none}"
  display-heading-navy:
    backgroundColor: "transparent"
    textColor: "{colors.ink-display}"
    typography: "{typography.display-xl}"
    rounded: "{rounded.none}"
  body-paragraph:
    backgroundColor: "transparent"
    textColor: "{colors.body-muted}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.none}"
  link-inline:
    backgroundColor: "transparent"
    textColor: "{colors.link}"
    typography: "{typography.link-inline}"
    rounded: "{rounded.none}"
  feature-scene-card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body-muted}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.none}"
    padding: "48px 0px"
  app-store-button:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: "9.5px 14px"
    height: "48px"
    border: "2px solid #e5e5e5"
  hero-mascot-cluster:
    backgroundColor: "transparent"
    textColor: "{colors.ink-display}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.none}"
    padding: "0px"
  footer-canvas:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body-muted}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.none}"
    padding: "96px 0px"
  text-input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.sm}"
    padding: "12px 16px"
    height: "48px"
    border: "2px solid #e5e5e5"
  text-input-focused:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.body}"
    typography: "{typography.body-lg}"
    rounded: "{rounded.sm}"
    border: "2px solid {colors.accent-macaw}"
  hairline-divider:
    backgroundColor: "#e5e5e5"
    textColor: "{colors.body-muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.none}"
    height: "1px"
  badge-streak:
    backgroundColor: "{colors.accent-fox}"
    textColor: "{colors.canvas}"
    typography: "{typography.label-uppercase-sm}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
  badge-error:
    backgroundColor: "{colors.accent-cardinal}"
    textColor: "{colors.canvas}"
    typography: "{typography.label-uppercase-sm}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
  badge-gold:
    backgroundColor: "{colors.accent-bee}"
    textColor: "{colors.ink-display}"
    typography: "{typography.label-uppercase-sm}"
    rounded: "{rounded.full}"
    padding: "8px 12px"
---

## Overview

Duolingo's marketing chrome is built on one productive contradiction: a serious behavioral-science learning platform rendered with the visual vocabulary of a Saturday-morning cartoon. The canvas is pure white (`{colors.canvas}` — `#ffffff`), running edge-to-edge under every section with no hero band, no tint shift, no gradient mesh. Display headlines split into two roles: navy Feather Bold at 64px / `-1.28px` letter-spacing (`{colors.ink-display}` — `#042c60`) for the hero "learn anytime, anywhere", and owl-green Feather Bold at 48px (`{colors.primary}` — `#58cc02`) for the recurring section titles "free. fun. effective.", "backed by science", "stay motivated", "personalized learning". Body sits in DIN Round at 17px / weight 500 / mid-gray (`{colors.body-muted}` — `#777777`).

**Mascot-as-decoration**: where most ed-tech brands lean on stock photography of laptops, students, and abstract gradients, Duolingo replaces the entire decoration layer with a named cast of cartoon characters. Duo the green owl, Lily the purple teenager, Junior the rosy toddler, Bea the human, Falstaff, Eddy, Vikram, Zari — each gets their own `-shine`, `-radio`, and `-secondary` color triplet inside the 352 `:root` CSS variables. Hero sections cluster mascots in floating constellations; feature sections pair one isometric mascot scene per illustrated text panel. The character library is not optional brand garnish — it is the system's only chromatic accent layer outside the primary green.

Unlike the convention of softening pediatric branding with pastels and serif gravitas, Duolingo holds the line on a single saturated owl green (`#58cc02`) and a heavy display sans (Feather Bold at weight 700). The result reads as gamepad-grade UI confidence rather than infantilized warmth — the brand trusts kids and adults equally to register a bright green button as a primary action and an owl mascot as a guide rather than a mascot-as-apology.

**Key Characteristics:**
- Pure white canvas (`{colors.canvas}` — #ffffff) edge-to-edge — no cream tint, no surface ladder, no full-bleed dark band on the marketing surface
- Owl-green CTA pill (`{colors.primary}` — #58cc02) with white uppercase DIN Round 15px label at 0.8px letter-spacing — the brand's only saturated chromatic moment
- Two-typeface dialect: Feather Bold display (h1/h2 only, 48–64px) + DIN Round UI/body (13–19px) — every text role belongs to exactly one of the two
- Navy display ink (`{colors.ink-display}` — #042c60) reserved for top-of-page hero h1, switched to owl green for in-page section h2 — the navy/green pairing is the visual rhythm
- Animal-named accent vocabulary — `{colors.accent-macaw}` (#1cb0f6), `{colors.accent-cardinal}` (#ff4b4b), `{colors.accent-fox}` (#ff9600), `{colors.accent-bee}` (#ffc800), `{colors.accent-beetle}` (#ce82ff) — color tokens map to characters, not to roles
- 12–16px button radius via `--web-ui_button-border-radius: 16px` paired with a `{rounded.full}` pill chip vocabulary for streak and gold badges
- 8px / 24px / 32px / 48px / 96px spacing scale — long 96px section gutters keep the cartoon scenes from feeling cluttered

## Colors

The palette is split into three layers: one saturated brand voltage (owl green and its tints), a four-step structural gray ladder for ink and hairlines, and an animal-named accent family pulled from the 352 CSS variables that color the mascots, badges, and gamification chrome.

- **Owl green (`#58cc02`)** — frequency 22. Used as text (10), border (10), background (2). The brand voltage, scoped to the wordmark, primary CTA fill, and the recurring section h2 headings ("free. fun. effective.", "backed by science", "stay motivated"). It is also `--color-owl` and `--color-tree-frog` in the CSS variable layer.
- **Tree frog deep (`#58a700`)** — derived from `--color-tree-frog` (88, 167, 0). Used as: pressed-state owl green on hover and click states; never sits as a standalone surface or text.
- **Sea sponge mint (`#a5ed6e`)** — frequency 128. Used as text (64), border (64). A lighter owl-green tint that appears as the active chip background under the language switcher row and as the "correct answer" highlight in the product (`--color-sea-sponge`, `--color-turtle`).
- **Sea sponge soft (`#d7ffb8`)** — frequency 14. Used as text (7), border (7). The softest owl-green tint, scoped to selected-state language chips and the soft success-band variant.
- **Navy display (`#042c60`)** — frequency 2. Used as text (1), border (1). Reserved for the top-of-page hero h1 "learn anytime, anywhere" — the only place navy carries display type. The system pairs it with owl green for h2 to avoid two saturated colors competing in one section.
- **Eclipse navy (`#000437`)** — derived from `--color-eclipse` (0, 4, 55). Used as: deepest navy variant for hero text on the alternate dark-mode hero band; an extension of the display-ink ladder.
- **Deep starling (`#100f3e`)** — frequency 1. Used as background (1). The single brand-layer hex returned by the extraction — it sits under a hero illustration band as a near-black violet, paired with the white logotype.
- **Body ink (`#3c3c3c`)** — frequency 399. Used as text (200), border (199). The workhorse body-text color (`--color-black-text`) carried by nav links, footer text, and the dense legal copy in the long-form sections.
- **Body strong (`#4b4b4b`)** — frequency 20. Used as text (11), border (9). The slightly darker variant (`--color-eel`) used on emphasized body and on headings that aren't display-tier.
- **Body muted (`#777777`)** — frequency 268. Used as text (134), border (134). The second-most-common color in the system (`--color-wolf`) — carries every secondary paragraph, the "Learning with Duolingo is fun" body lede, and the soft-gray nav link in inactive state.
- **Body soft (`#afafaf`)** — frequency 6. Used as text (3), border (3). The lightest readable gray (`--color-hare`) — appears on disabled text and quiet timestamps.
- **Canvas white (`#ffffff`)** — frequency 8. Used as text (4), background (2), border (2). The dominant canvas, but its raw `total` is low because most page chrome sits on white inherited from `body` rather than being explicitly painted.
- **Link standard (`#0000ee`)** — frequency 4. Used as text (2), border (2). Browser-default blue, scoped to the policy and ToS inline links in the footer — a deliberate choice to inherit user-agent accessibility defaults rather than re-skin policy chrome.
- **Macaw blue (`#1cb0f6`)** — frequency 14. Used as text (9), border (5). The secondary CTA accent (`--color-macaw`) — carries the "I already have an account" outline button text and inline product-tour highlights.
- **Cardinal red (`#ff4b4b`)** — derived from `--color-cardinal` (255, 75, 75). Used as: error states, streak-broken badge, the lost-heart icon in product chrome.
- **Fox orange (`#ff9600`)** — derived from `--color-fox` (255, 150, 0). Used as: active streak flame badge, the "extended streak" panel background.
- **Bee gold (`#ffc800`)** — derived from `--color-bee` (255, 200, 0). Used as: gold-tier league badge, milestone gradient stops, the achievement star icon.
- **Beetle purple (`#ce82ff`)** — derived from `--color-beetle` (206, 130, 255). Used as: super-membership accent, Lily mascot's signature tint, the diamond-league highlight.

The 352 `:root` custom properties extend this with full character costume palettes (Falstaff brown, Eddy red, Lily purple, Vikram pink, Zari magenta), but the marketing surface documented here uses the eighteen tokens above as its working palette.

## Typography

Duolingo runs two custom typefaces with a strict role split: Feather Bold for display, DIN Round for everything else.

**Feather Bold** (`feather, sans-serif`) carries h1 and h2 only. The hero h1 sits at 64px / weight 700 / `-1.28px` letter-spacing on "learn anytime, anywhere"; section h2s drop to 48px / weight 700 / normal tracking on "free. fun. effective.", "backed by science", "stay motivated", "personalized learning". Feather is a Duolingo proprietary face with a thick low-contrast cartoon-display silhouette — Nunito Bold is the closest open-source substitute.

**DIN Round** (`din-round, sans-serif`) handles every UI and body role. The most-frequent signature in the extraction (count 42) is the uppercase button label at `15px / weight 700 / lineHeight 20px / letterSpacing 0.8px / textTransform uppercase` — the same token carries every primary CTA, nav action, and footer category label. Body paragraphs render at 17px / weight 500 / 24px line-height in `{colors.body-muted}`. Secondary nav and small UI text drops to 13px / weight 700 / 16px line-height. The 19px / weight 700 variant carries feature-section subheads.

**Weight strategy**: the system uses weight 500 for body and weight 700 for everything else — there is no weight 400, no weight 600, no weight 300. The two-weight discipline keeps the cartoon-display character of the face from drifting into corporate softness.

## Layout

Sections stack at `{spacing.section}` (96px) gutters with the white canvas running continuously between them. The captured 4500px scroll shows seven primary blocks: top language switcher, hero (mascot cluster + CTA pair), language flag chip row, alternating mascot-scene feature bands (illustration left / heading right and vice versa), and a footer hero with the "learn anytime, anywhere" navy display headline paired with floating phone illustrations.

Content sits in a generous ~1024px max-width column with 16px gutter padding (`0px 16px`) per the extracted spacing data. The language flag row uses 7-tile horizontal rhythm at 101px per tile — a fixed-pixel rhythm rather than a fluid grid. Feature sections alternate column order: text-left-illustration-right on "free. fun. effective.", flipped to illustration-left-text-right on "backed by science", flipped back on "stay motivated". The alternation is the layout's pacing device — no other rhythm interrupts the vertical scroll.

## Elevation & Depth

Duolingo's depth vocabulary rejects atmospheric shadow in favor of **shadow-as-lip**: every primary button carries a 3–4px flat bottom-shadow lip in the press-state color (`{colors.primary-pressed}` — `#58a700`) directly beneath the green fill, giving the CTA a tactile gamepad-button quality. The lip disappears on click (the button drops 3–4px into the lip socket). There is no diffuse multi-stop shadow, no rgba blur, no atmospheric depth — only the flat color slab.

Cards and feature scenes sit flat on the white canvas with no shadow at all. Hairline dividers at `#e5e5e5` separate the language flag row from the feature stack. The system's only soft elevation moment is the floating phone illustration in the footer hero, which renders as drawn cartoon depth (perspective shadow inside the illustration) rather than CSS box-shadow.

## Shapes

The radius vocabulary is anchored by the CSS variable `--web-ui_button-border-radius: 16px` — every primary CTA pill, secondary outline button, and feature card rounds at 16px. Small UI chips and inputs drop to 8px, mid-tier elements use 12px (the extraction's only captured radius), badges and streak chips go fully pill at 9999px.

The 16px radius is uniformly applied — Duolingo does not run a separate small-button geometry, and there are no sharp 0-radius elements in the marketing chrome outside the section text and the language flag images. The pill (`{rounded.full}`) is reserved for status badges (streak flame, gold milestone, error indicator) and the language-chip active state — never the primary button, which keeps its 16px softened-rectangle silhouette.

## Components

- **`button-primary`** — owl-green fill (`{colors.primary}`), white uppercase DIN Round label (`{typography.label-uppercase}`), 16px radius (`{rounded.lg}`), 50px height with `13px 16px` padding. The defining UI element; the shadow-lip beneath is `{colors.primary-pressed}`.
- **`button-secondary`** — white fill (`{colors.canvas}`), macaw-blue uppercase label (`{colors.accent-macaw}`), 2px gray border, same 50px geometry. Used for "I already have an account" and second-action slots.
- **`language-chip`** + **`language-chip-active`** — transparent text-only chip with a flag image; the active variant fills with `{colors.primary-soft}` and switches text to `{colors.primary-pressed}`.
- **`top-nav`** — white 70px-tall bar carrying the Duo wordmark left and the language switcher right.
- **`language-switcher`** — DIN Round uppercase label at 14px / 0.8px letter-spacing.
- **`section-heading-green`** + **`display-heading-navy`** — the two display tokens; never used in the same section.
- **`body-paragraph`** — 17px DIN Round at weight 500 in body-muted gray.
- **`link-inline`** — browser-default `#0000ee` blue, scoped to footer policy text.
- **`feature-scene-card`** — the transparent text-plus-illustration block that carries each section.
- **`app-store-button`** — white pill with thin gray border + dark App Store / Google Play wordmark.
- **`hero-mascot-cluster`** — the transparent grouping wrapper for the floating Duo + Lily + Junior + Bea constellation.
- **`footer-canvas`** — the 96px-padded white footer hero block.
- **`text-input`** + **`text-input-focused`** — 48px-tall white input with 8px radius and a 2px hairline border; focus swaps to macaw-blue 2px border.
- **`hairline-divider`** — 1px `#e5e5e5` line; the only structural divider in the system.
- **`badge-streak`** / **`badge-error`** / **`badge-gold`** — fully-pill chips in fox orange, cardinal red, and bee gold respectively, carrying short uppercase labels in white or navy.

## Do's and Don'ts

**Do** use `#58cc02` for primary CTAs only — never for body text, large background fills, or feature card backgrounds. The brand reserves the green for action signal; treating it as a generic accent dilutes the wordmark voltage.

**Do** keep button labels uppercase at 0.8px letter-spacing — the all-caps treatment is non-negotiable on every primary CTA. Sentence-case labels read as a different brand entirely.

**Do** pair navy display (`#042c60`) with owl-green h2 inside the same page — but never inside the same section. The rhythm depends on a navy hero followed by green section-titles below.

**Do** anchor every button at 16px radius with a 3–4px flat bottom-shadow lip. The lip is the system's signature tactile cue.

**Don't** introduce a second saturated CTA color — Duolingo's secondary action is a white-fill outline pill with macaw-blue text (`#1cb0f6`), not a competing fill. A blue or red primary on the same page breaks the single-voltage discipline.

**Don't** use `#a5ed6e` as a body or canvas background — it's a border-and-text token (frequency 128, all `text + border`, zero `bg`). Scoped to active-state language chips and "correct answer" highlights inside the product chrome. For light surfaces stay on `{colors.canvas}` (#ffffff) or `{colors.primary-soft}` (#d7ffb8) at 14 occurrences.

**Don't** substitute Inter for Feather Bold on display — Inter's higher contrast and tighter spurs break the cartoon-display silhouette the brand depends on. Nunito Bold is the only acceptable open-source replacement, and even then the kerning needs hand-adjustment at 64px.

**Don't** lean on gradient meshes or atmospheric photography as decoration — the entire decoration layer is the mascot illustration set. Stock illustration of "diverse students at laptops" is incompatible with the system's character vocabulary.

**Don't** use weight 400 or weight 600 in DIN Round — the system runs on a strict 500 / 700 weight pair. Intermediate weights read as a different typeface family and break the two-weight discipline.

## Known Gaps

- **In-product chrome not captured** — the lesson screen, league leaderboard, streak-freeze modal, super-membership paywall, and Duolingo Max conversational tutor surfaces are out of scope. This document captures the marketing site at `duolingo.com`, not the app.
- **Mascot character library not enumerated** — the 352 CSS variables include color triplets for Duo, Lily, Junior, Bea, Falstaff, Eddy, Vikram, Zari, Lin, Lucy, Oscar, Bea Junior, but the full character pose library is not catalogued here.
- **Dark mode tokens not documented** — the marketing site is light-only; the `--color-*-always-dark` CSS variable family hints at a dark mode used elsewhere in the product, but is not extracted as a coherent surface ladder.
- **Animation and confetti timings out of scope** — Duolingo's signature celebration animations (XP burst, streak flame, league promotion) and the gamification motion language are not captured here.
- **Form validation states beyond focus** — the input system documented covers default and focused states only; success, warning, and error border treatments are inferred from the badge palette but not directly extracted.
- **Custom typeface licensing** — Feather Bold and DIN Round are licensed Duolingo typefaces with no public web-font distribution. Substitutes are named but pixel-accurate reproduction requires the original files.
