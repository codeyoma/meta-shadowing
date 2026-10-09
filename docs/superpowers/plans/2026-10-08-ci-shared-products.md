# Shared Native Test Products Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve the confirmed remote-ownership review and reduce full hosted CI latency without reducing coverage.

**Architecture:** A single build exports portable Xcode test products. Four existing serial shards consume the same run-scoped artifact, with balanced test selections and fail-closed validation. Runtime presentation separately gates remote ownership.

**Tech Stack:** Swift 6, Swift Testing, Xcode 27, Bash, Ruby, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-10-08-ci-shared-products-design.md`

## Global Constraints

- iOS 26.0 deployment; Xcode 27 and iOS 27 verification.
- Preserve native-only CI, required check names, branch policy and human release approval.
- Four independent serial simulators; no skipped coverage, retries or relaxed assertions.
- Preserve unrelated `tools/` and private local configuration.
- Update PR #127, never merge or change remote rulesets.

## Review Focus

- Cancellation during remote activation must not leave ownership or metadata behind.
- A hidden runtime must not overwrite another owner's Now Playing metadata.
- An artifact from another commit/toolchain must fail before install or test.
- Future tests must have exactly one shard owner.
- Missing, failed or cancelled build/test jobs must never pass the aggregate gate.

### Task 1: Gate remote ownership on presentation

**Files:** `NativeLearningRuntime.swift`, `LearningFlow.swift`, `RuntimeObservationTests.swift`, `LearningFlowTests.swift`.
**Interfaces:** Consume existing `initiallyPresented`; expose idempotent `present()` for the actual presentation handoff.

- [ ] Add a failing hidden-runtime regression that preserves existing Now Playing metadata before presentation and after cancellation.
- [ ] Run the selected native test and observe the ownership assertion fail.
- [ ] Add presentation state and explicit ownership activation; connect `LearningFlow.startPresentedLesson()`.
- [ ] Test explicit presentation, duplicate presentation, cancellation, teardown and existing wired-monitor behavior.
- [ ] Run the affected native lifecycle/entry/flow suites and LearningMedia package suite; expect zero failures.
- [ ] Commit the review correction separately.

### Task 2: Build once, validate and consume portable products

**Files:** `.github/workflows/ci.yml`, `native-ios/scripts/ci-test-products.sh`, `test-ci-test-products.sh`, `ci-build-progress.awk`, `test-ci-build-progress.sh`.
**Interfaces:** `ci-test-products.sh pack BUILD_ROOT ARCHIVE`; `unpack ARCHIVE OUTPUT_ROOT`. Inputs include `GITHUB_SHA`; artifact includes exact Xcode version. Output contains `NativeTests.xctestproducts` and its test app.

- [ ] Add tests executing packaging/validation with real temporary files and controlled Xcode metadata. Reject missing products, wrong commit/toolchain and corrupt archives.
- [ ] Observe RED, then implement tar packaging with a checksummed payload and metadata validation before extraction/use.
- [ ] Add a shared build job without simulator boot; downstream jobs download products, validate, boot, preflight and run `test-without-building -testProductsPath`.
- [ ] Update build-progress regression to execute the relocated workflow command and verify safe preparation phases plus failure propagation.
- [ ] Run packaging/progress/configuration regressions and actionlint/shellcheck; expect pass.
- [ ] Export and relocate real native products locally and execute focused tests from the relocated package; expect pass.

### Task 3: Balance coverage and verify the complete hosted workflow

**Files:** `.github/workflows/ci.yml`, `test-ci-test-shards.sh`, `docs/native-ci.md`, `native-ios/README.md`.
**Interfaces:** Add `CI_OPTIONS_EXTRA_TESTS`, included only by options and excluded from product. Aggregate requires both build and shard success.

- [ ] Expand actual-command regression for all current/future tests and build/shard failure combinations; observe RED.
- [ ] Move settings-summary, font-persistence and rate-preference tests (about 194 seconds in the baseline) to options; preserve exact complements.
- [ ] Require build and every shard success at the existing aggregate gate; run regressions, expect pass.
- [ ] Document architecture, measured baseline and unverified boundaries; commit and request one independent final review.
- [ ] Push the PR update and inspect the full hosted result, actual executed inventory and timings. Investigate any failure without suppressing it.
- [ ] Reply to the confirmed review with tested evidence and report measured improvement or remaining limits.
