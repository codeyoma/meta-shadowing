# Library storage and cycle choices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task by task.

**Goal:** Deliver the approved owned/store library and local-material management, and apply the latest third/fifth-cycle interaction rules.
**Architecture:** Preserve the pure session/player engine, verified StoreKit ownership and existing native package adapters. Native constrained filesystem operations remain separate from learning persistence. The library consumes a small storage interface and tested presentation rules.
**Tech Stack:** Expo React Native, TypeScript, Swift actors, Background Assets, SQLite, node:test and native delivery tests.
**Spec:** docs/superpowers/specs/2026-09-13-library-storage-design.md and the owner's latest cycle comment.

## Global Constraints

- Work only in the existing native-iphone-rebuild worktree; preserve pre-existing edits. No commit, push, deployment, real purchase or physical-device data deletion.
- Deletion preserves purchase ownership, checkpoints, completion history, XP, preferences, library selection and cloud progress.
- Only exact catalog-selected material directories are eligible. Reject symlinks and unexpected paths. Serialize deletion with installation/download.
- Keep samples labeled 샘플, never treat sample availability as a purchase receipt or map the current paid product to a sample.
- Show third-cycle choices from playback start, but disable both during audio playback. After fifth-cycle audio ends, one explicit Next tap confirms and advances.
- Test behavior with isolated fixtures and public boundaries, not source-text assertions. Never claim real Apple cache reclamation from simulator tests.

### Task 1: Latest cycle interaction rules

**Files:** Modify src/core/session.ts, player.ts, player-presentation.ts and corresponding tests; src/core/journal.test.ts; src/components/player-controls.tsx; src/app/player.tsx if needed; docs/learning-contract.md.
**Consumes:** Existing session phases, Player audio/save boundary and third-choice visibility.
**Produces:** Third-cycle visible but playback-locked actions; one-tap fifth completion with durable exactly-once progression. No storage/UI-library interface changes.

- [x] Read AGENTS.md, docs/native-rebuild.md and docs/learning-contract.md. Follow TDD. Inspect actual PlayerControls location before editing.
- [x] RED: amend tests that currently allow a choice during third listening. Assert visibility remains true while main action is wait; repeat and next reducer/Player calls during listening do not change state or stop audio. After audio-ended, both actions work. Paused listening remains resumable but cannot skip an unfinished playback.
- [x] RED: construct planned=5, confirmed=4, phase=speaking. Assert one next action advances phrase or completes the final phrase, persists once and ignores stale callbacks. Cover failed persistence/retry and no duplicate journal XP/completion.
- [x] Run focused tests: `npx tsx --test src/core/session.test.ts src/core/player.test.ts src/core/player-presentation.test.ts src/core/journal.test.ts`; record expected failures.
- [x] Implement minimal shared eligibility predicates, retaining third-cycle visibility independently from action eligibility. Disable repeat while main action is not next, or use an equally explicit tested control-state boundary. Preserve audio generation cancellation and ordinary first/second/fourth confirmations.
- [x] Update learning contract and full-run fixtures for the latest semantics; run focused tests then `npm run check`. Self-review and report exact test evidence. Do not commit.

### Task 2: Safe measured local-material storage API

**Files:** src/native/package.ts, hosted-package.ts; new src/native/package-storage.ts and optional focused src/core/package-storage.ts with tests; modules/package-delivery/index.ts; modules/package-delivery/ios/PackageInstallation.swift, PackageDownload.swift, PackageDeliveryModule.swift; optional focused PackageStorage.swift; tests/delivery/Tests storage tests. Extend app.plugin.js only if a concrete configured package key must be injected.
**Consumes:** Exact bundled and Apple-hosted sample catalog identities, immutable package manifest, actor serialization and Background Assets configured pack ID.
**Produces:** `readPackageStorage(pack: LearningPackage): Promise<{ bytes: number; installed: boolean; busy: boolean }>` and `removePackageMaterials(pack: LearningPackage): Promise<{ cacheCleared: boolean }>` exported from src/native/package-storage.ts. Unsupported identities reject. A false cacheCleared means local removal succeeded but Apple cache cleanup is incomplete; retry remains possible with no installed copy.

- [x] Read AGENTS.md, native rebuild, learning contract and docs/apple-only-foundation.md plus approved library spec. Read complete existing package adapters before extending.
- [x] RED: native real-file fixtures verify actual byte measurement (not manifest sum), missing=zero, selected-only removal, repeated deletion, foreign path/symlink rejection and staging cleanup. Preserve sibling files and a learning-record fixture.
- [x] RED: actor tests verify busy deletion rejection, no late install after deletion, start blocked during asynchronous purge, purge failure returns incomplete while status no longer ready, and retry purge works with missing local copy.
- [x] Implement exact catalog guards, measured local bytes, native filesystem containment and actor-owned removal/cache purge. Use existing real Background Assets remove API as diagnostic implementation does, but normal configured pack only. Keep diagnostics isolated. Bundled removal shares install lock and deletes only installed/staging copies, not app assets.
- [x] Add behavioral integration coverage using actual SQLite journal plus isolated package files: delete only selected material, reinstall, restore identical checkpoint and history/XP with no new events. The pure/shared boundary may accept filesystem ports to run real node fixture I/O; never copy the production algorithm into tests.
- [x] Run relevant native delivery tests through tests/delivery/project.yml XcodeGen project and `npm run check`. Report native destination and results; real Apple cache reclamation is not a simulator assertion. Self-review the API contract and report. Do not commit.

### Task 3: Owned/store sections and material-management UI

**Files:** src/app/(tabs)/index.tsx; src/components/library-book.tsx, hosted-library-book.tsx and purchase card at its actual location; new focused owned-book card and material-management hook/components as needed; new src/core/library-presentation.ts and tests. Keep diagnostics using their existing separate controls.
**Consumes:** Task 2's readPackageStorage/removePackageMaterials exact interface, existing verified StoreKit snapshot/purchasePresentation, installation progress/cancellation and useBookRecords.
**Produces:** Approved native library UI; no new purchase-to-package mapping, data schema or progress mutation.

- [x] Read approved spec and existing card/purchase/theme patterns. Follow applicable Expo UI skill and TDD.
- [x] RED: pure presentation tests select owned/store section for owned/not-owned/unknown/error/pending states; samples explicitly labeled; paid owned without mapping cannot Study/Download; missing price shows 가격 확인 불가 and disables purchase. Add measured-size formatting and busy/edit action-state tests.
- [x] Implement two titled sections 구매한 도서 and 상점 with 편집/완료 above list, retaining banner and language. Owned samples have separate accessible Study and Download icon targets; verified installed state disables redundant download. Preserve busy progress and cancellation.
- [x] Store price is localized StoreKit price above a 구매하기 button. Preserve existing retry, pending, failure, cancellation and uncertain ownership protections. Owned unmapped paid product appears as 학습 자료 준비 중 with disabled controls.
- [x] Edit reads actual storage info; confirmation names book and learning-record preservation. Delete calls only adapter, refreshes installation state and retains progress. Disclose bundled-source limitation and size exclusions. On incomplete Apple purge show actionable retry even after local copy removed. A failed read/delete never reports success or stale ready state.
- [x] Run focused presentation tests then `npm run check`. Self-review all UI states and exact adapter usage. Do not commit. Controller will build simulator and verify both appearances and material flow using controlled sample only.

## Final verification

- [x] Independent task reviews and broad integrated diff review; fix important findings.
- [x] Fresh `npm run check`, native delivery tests, simulator build/install.
- [x] Simulator: third-playback disabled controls; after-ended choices enabled; fifth one-tap advance; both library appearances, separate controls, edit cancel/remove/reinstall with progress preserved.
- [x] Report unverified real Apple service/cache limits, no publication, and any residual findings.
