# App-wide shadcn design refactor

**Goal:** Migrate every generic interactive UI/control to official shadcn components and apply the supplied DESIGN.md without changing real content or learning behavior.

**Architecture:** Shared registry-generated Radix shadcn primitives in `src/components/ui`, semantic Tailwind v4 tokens in `src/app/globals.css`, and app-specific compositions for dialogue, learning cycles, and lesson paths. Native semantic content, audio, and the original brand mark remain appropriate HTML/SVG. No alternate home-grown control library.

**Tech Stack:** Existing Next.js 16 / React 19 / TypeScript, Tailwind v4, official shadcn registry with Radix primitives, Lucide icons. Licensed font files are unavailable; use DESIGN.md's documented Nunito and Quicksand substitutes, self-hosted through font packages.

**Spec:** Root `DESIGN.md` is the sole visual authority. User approved proceeding on 2026-09-07. Existing behavior requirements in `docs/design/meta-shadowing-ui.md` remain binding; its previous dark palette is superseded.

**Global Constraints:** Preserve all pre-existing dirty changes. Do not change backend data, secrets, deployment settings, session engines, or real lesson content. Do not add dummy sections or proprietary mascot assets. Preserve manual confirmation, automatic timer confirmation, third-check chime, bottom drawer, English/Korean alternating dialogue, keyboard shortcuts, focus return, and pause-on-overlay. Use dark navy foreground on green controls where necessary for accessible contrast. No commit or release in this task.

## Tasks

- [x] Foundation: install Tailwind and initialize official shadcn; inspect generated files; centralize DESIGN.md tokens and reusable variants. Files: `components.json`, `postcss.config.mjs`, `package.json`, lockfile, `src/components/ui/*`, `src/lib/utils.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/app/ui.tsx`.
- [x] Learner screens: migrate entry, home, setup, session controls, install help, completion summary, and version notice. Use Field/Input/NativeSelect, ToggleGroup, Drawer, Accordion, Empty, Alert, and Button compositions. Preserve actual content, route params, and selections. Files: relevant `src/app/*.tsx`, `src/app/home/*`, `src/app/setup/*`.
- [x] Player: migrate header/footer controls, progress, error states, drawer and help to shadcn. Keep custom learning visualization as app composition. Files: `src/app/player/*.tsx`, `practice.module.css`; do not change hooks or engines.
- [x] Admin: migrate login/import/defaults/lesson management forms, tables, status, and actions. Preserve validation and publication flows. Files: `src/app/admin/**/*.tsx`.
- [x] Integration: remove obsolete duplicate component CSS; inspect for raw generic controls outside `src/components/ui`; update only semantic selectors invalidated by the migration, never weaken behavioral expectations.
- [x] Verification: `npm run typecheck`, `npm test`, `npm run build`, and full Playwright suite with existing Chrome. Protect existing tests: manual completed recording remains unchecked until Continue; auto speaking timer expiry confirms; third confirmation waits for Repeat/Next; overlay pauses and restores opener; dialogue pairs remain left/right; entry and admin validation remain intact.
- [x] One batched desktop/mobile visual and interaction inspection across entry/home/setup/player/admin, followed by a single defect batch and at most one confirmation round. Restore LAN development server and report evidence/limitations.

## Ownership

Main agent owns dependencies, primitives, global theme, shared icons, documentation, and integration verification. Independent learner, player, and admin migrations may run in parallel only with disjoint file ownership; no parallel Next servers or dependency edits.
