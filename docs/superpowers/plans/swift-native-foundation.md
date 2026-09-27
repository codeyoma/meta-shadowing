# Standalone Swift Foundation Implementation Plan — #93

> **For agentic workers:** Use `implement` with `tdd` and sequential inline execution. Run the required `code-review` before the final handoff. Steps use checkboxes for tracking.

**Goal:** Build and test an isolated iOS 26+ Swift application that displays a controlled sample without Expo, React Native, Metro or a JavaScript runtime.

**Architecture:** A SwiftUI app owns an observable main-actor bootstrap model. A small pure Swift model package represents synthetic preview content; a separate foundation package owns local fixture storage and cancellable initialization. This is not the learning engine or the finished replacement. Existing app and CI lanes remain unchanged.

**Tech Stack:** Swift 6 language mode, SwiftUI, Observation, Foundation, local Swift packages, Swift Testing, XCUITest and XcodeGen. Package manifests use Swift tools 6.2 or later; no third-party runtime dependencies.

**Spec:** GitHub #93 and `docs/superpowers/specs/2026-09-27-swift-native-migration-design.md`, especially sections 3, 5 and 7. The roadmap is `2026-09-27-swift-native-roadmap.md`.

## Global Constraints

- Keep all current product features and learning behavior. This ticket establishes the shell; later tickets still own the unported features.
- Keep the current iPhone-first iOS 26+ deployment scope.
- Android will be a separate, later Kotlin-native implementation.
- Automatic cloud sync starts disabled for a fresh test installation. W2 does not link or invoke cloud, purchase, delivery, microphone or media services.
- No benchmark collection or improvement targets.
- Do not replace the physical iPhone app, change accounts, register services or delete data.
- Preserve unrelated acceptance-document, StoreKit-test and untracked changes.
- The user explicitly requested implementation and a commit to the current branch through `implement`. No push, PR, merge or release is implied.

## Review Focus

1. A cancelled or older bootstrap must not publish a ready/error state after inactivity or a newer request. Cover through the bootstrap model's public API.
2. A corrupt or unreadable fixture store must show a recoverable error, not silently reset data. Cover through the workspace API and retry UI.
3. The new shell must not read or mutate the reference app's records. Use a dedicated namespace and test independent temporary roots.
4. The built app must contain only native code and controlled public-safe content, not embedded JS or Apple-service capabilities. Inspect the product and generated settings.
5. Foreground reentry and view recreation must not duplicate initialization or imply learning completion. Cover the bootstrap seam and UI journey; no rewards exist in W2.

## Test seams and review range

The ticket already specifies launch, teardown and composition tests with synthetic
services. Concrete seams proposed for this implementation:

- `PreviewWorkspace.loadLibrary() async throws -> PreviewLibrary`: isolated local storage, content validation, repeat reads and failures.
- `AppBootstrap.activate() async`, `deactivate()` and read-only `state`: ready/error, cancellation, retry and stale-result rejection.
- The built app's accessible library, sample detail, retry and foreground/relaunch behavior: XCUITest.
- Xcode-generated build settings and the compiled app product: independent runtime exclusion and deployment checks.

Review baseline: current `HEAD`, `b3d6f1b08571a1f810a95a20e0ff95b523fb246e`.
Include only this ticket's changes in its commit/review. Prior W1 inventory and
scope documents remain separate local work unless needed as an explicitly listed
dependency; do not sweep them into the commit.

## Task 1: Typed sample and isolated workspace

**Files:**
- Create: `native-ios/Packages/LearningDomain/Package.swift`
- Create: `native-ios/Packages/LearningDomain/Sources/LearningDomain/PreviewLibrary.swift`
- Create: `native-ios/Packages/LearningDomain/Tests/LearningDomainTests/PreviewLibraryTests.swift`
- Create: `native-ios/Packages/AppFoundation/Package.swift`
- Create: `native-ios/Packages/AppFoundation/Sources/AppFoundation/PreviewWorkspace.swift`
- Create: `native-ios/Packages/AppFoundation/Tests/AppFoundationTests/PreviewWorkspaceTests.swift`

**Interfaces:** `PreviewLibrary` is a Sendable, Equatable value with identifiable
lessons and sentence pairs. Decoding validates schema, nonempty content and unique
identities. `PreviewWorkspace(root:)` receives an explicit application-support
root and owns only its `SwiftNativeFoundation/v1` child. `loadLibrary()` seeds
public-safe synthetic content on first use, then validates existing bytes. It
never scans reference storage, imports old progress or resets corrupt data.

- [x] Add a valid synthetic-content decoding test; observe RED before implementing the model.
- [x] Implement the typed model and validation; observe RED/GREEN for schema and invalid-content cases.
- [x] Add a workspace test that loads the same sample twice; observe RED, then implement scoped atomic seeding and loading.
- [x] Verify independent roots, corrupt content preservation, inaccessible storage and cancellation through the workspace API. These additional cases passed against the existing implementation without manufacturing failures.
- [x] Run both package suites and Swift 6 compilation. W3 still owns learning checkpoints, XP and the domain schema.

## Task 2: Native composition and lifecycle

**Files:**
- Create: `native-ios/Packages/AppFoundation/Sources/AppFoundation/AppBootstrap.swift`
- Create: `native-ios/Packages/AppFoundation/Tests/AppFoundationTests/AppBootstrapTests.swift`
- Create: `native-ios/App/MetaShadowingApp.swift`
- Create: `native-ios/App/RootView.swift`
- Create: `native-ios/App/PreviewLibraryView.swift`
- Create: `native-ios/App/PreviewLessonView.swift`
- Create: `native-ios/project.yml`

**Interfaces:** `AppBootstrap` is main-actor isolated and observable. Its state is
`idle`, `loading`, `ready(PreviewLibrary)` or `failed`; it consumes an injected
async load operation, with the real workspace composed only at the app root.
`activate()` loads once and rejects cancelled/stale results; `deactivate()`
invalidates pending work without awarding anything. The app connects scene
phase and SwiftUI task cancellation to that API. Views receive narrow values.

- [x] Test successful activation through an injected synthetic loader; observe RED, then implement the state transition.
- [x] Verify failure/retry, repeated activation, inactivity, late results and cancellation with failing-first lifecycle tests.
- [x] Generate the standalone app with Swift 6, complete concurrency checking, approachable concurrency, main-actor UI isolation and iOS 26.0 minimum.
- [x] Use native NavigationStack, List and semantic typography with explicit unfinished-feature wording.
- [x] Use the existing identity from ignored local configuration and a dedicated simulator; do not replace the reference installation.
- [x] Build Debug and Release without Expo, CocoaPods or Metro. Record observed toolchain/accessibility diagnostics and their limits in the verification report.

## Task 3: Runnable verification and developer handoff

**Files:**
- Create: `native-ios/Tests/AppUITests/NativeFoundationUITests.swift`
- Create: `native-ios/scripts/verify-native-product.sh`
- Create: `native-ios/README.md`
- Modify: `.gitignore`, `AGENTS.md`, `docs/native-ci.md`
- Create: `docs/swift-native/foundation-verification.md`

- [x] Pass UI tests for launch, detail/back, foreground, relaunch, largest accessibility text and retry on iOS 27, per the owner's runtime update.
- [x] Inspect Debug/Release products and reject negative controls containing JS or unexpected service entitlements.
- [x] Ignore generated output and local identity; document reproduction commands and safe simulator selection.
- [x] Update active guidance while preserving reference CI and remote protections.
- [x] Run both complete Swift suites, all new UI tests, `npm run check` and `git diff --check`; inspect the exact staging scope.
- [ ] Commit only #93 files to the current branch. Run the `code-review` Standards and Spec axes against the pinned baseline; fix findings and rerun affected tests before a final corrective commit if needed.
- [ ] Update #93 with verified results and limitations. Do not mark feature parity, physical services, performance gains or public distribution complete.

## Review status

Self-review: ticket requirements map to Tasks 1–3; storage and cancellation
failure modes have explicit tests; later domain/media/service implementation
is excluded. Sequential inline execution remains the selected method.
The owner approved this bounded plan, its test seams and review baseline with
"진행". Implementation proceeds sequentially in the existing isolated worktree.
