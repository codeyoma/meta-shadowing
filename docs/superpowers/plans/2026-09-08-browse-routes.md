# Browse Routes Implementation Plan

> **For agentic workers:** Use test-driven implementation and scoped review. Execute the tightly coupled route and shell changes inline; preserve the shared dirty worktree.

**Goal:** Give languages, lessons, stages and settings distinct routes, and replace cycle dots with a circular activity indicator.

**Architecture:** A persistent learner layout owns top/bottom navigation and browsing context. Each route owns its content and internal scroll area. The player keeps its own controls and live-session drawers; browse settings use a list page and a detail page.

**Tech Stack:** Existing Next.js 16.3.4 App Router, React 19, shadcn/Radix, CSS modules, Vitest and Playwright.

**Spec:** User-approved route proposal in this task, amended to settings index -> session settings detail page.

## Global Constraints

- Keep 8 learning levels and 16 stages, existing session behavior and preference validation.
- Use existing semantic colors, icons, cards, fields and scroll areas; no new dependencies.
- Language page contains only supported language choices. Lesson cards use actual catalog and recorded progress, never fictional goals, levels, locks or books.
- Keep old /home and /setup links working via redirects, and existing /player URLs unchanged.
- No commits, remote writes, database/schema changes, or changes to unrelated work.

## Task 1: Route shell and browse screens

Files: src/app/(learner)/layout.tsx and route pages; src/app/browse-shell.tsx, browse-pages.tsx, browse.module.css; src/lib/browse-navigation.ts; existing bottom-navigation, setup, home entry pages.

- [x] Add E2E failures for language-only page -> filtered lessons -> stages -> settings index -> session detail, reload, back, no document scroll and persistent navigation.
- [x] Add unit coverage for URL context precedence, rejecting cross-language lessons and unpublished stored selections.
- [x] Implement pure context resolver returning { language, lessonId }; links derive their destination from validated context.
- [x] Put shared navigation in one layout. Preserve internal scroll positions by route+context in the mounted provider; never restore document scrolling.
- [x] Render stacked language links and real lesson cards. Empty catalogs show an actionable empty state.
- [x] Render settings index with only '세션 설정'; detail reuses existing level-specific controls and saves preferences. Stage gear opens this page retaining stage and lesson context. Player session controls remain in-place so leaving a settings view does not reset playback.
- [x] Redirect legacy routes. Verify direct routes, selected nav, refresh, keyboard and saved preferences.

## Task 2: Circular cycle indicator and verification

Files: practice.module.css, e2e/player-nav-cycles.spec.ts, e2e/browse-routes.spec.ts.

- [x] Write failing rendered checks proving pending cycles have no dots and only current cycle has an animated arc.
- [x] Replace dot/orbit with thin pale track and rotating blue border arc; preserve connector fill and completed checks. Respect reduced motion and hidden documents.
- [x] Run unit tests, targeted browser tests on mobile/desktop, typecheck, shared-UI check and production build in isolated .next output.
- [x] Perform one batched visual inspection (430x932, desktop, short phone), fix concrete issues, confirm once. Keep screenshots outside repo.
- [x] Obtain scoped code review and report actual verification results and remaining limitations.

## Verification and handoff

- Final acceptance: 60 mobile/desktop Playwright tests passed, covering separate destinations, persistent navigation/scroll, language context, settings list/detail, stage return/start, completion return, ring motion, reduced motion, and player drawer focus/gestures.
- Unit tests: 398 passed, 1 integration test skipped. Shared UI primitive check passed. Production build passed with the new routes; no remote deployment or database changes were made.
- Scoped review found and verified fixes for lesson-list scroll resetting when another lesson is selected and missing stage numbers in completion history. Completion actions now return to the practiced language's lesson list.
- Batched visual inspection plus one confirmation covered 430x932 mobile, 1280x900 desktop and 320x568 short phone screens. Screenshot evidence is retained locally. No page exceptions were captured; a resource 404 was logged.
- Broader historical playback-history checks are NOT claimed green. The session-records run reported four mobile failures (audio confirmation/timing, grouped reload resume, paused-clock settings navigation, and paused-clock completion/history navigation), then hit a Turbopack cache failure and was interrupted. The direct-player grouped reload path does not execute browse navigation or completion callbacks; its root cause remains unverified and was left outside this route change. Local Supabase integration tests were not run.
- Keep the user's dirty worktree intact. No commit or push.
