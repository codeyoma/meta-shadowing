# Free Learning Packages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The owner selects the execution method after reviewing this plan.

**Goal:** Remove active Swift purchase functionality and make configured learning packages available through validated explicit free downloads.

**Architecture:** Retain the existing catalog, actor-owned download/installation boundary, SQLite learning store and optional private CloudKit recovery. Remove commerce dependencies instead of replacing them with fake ownership. Preserve immutable content and learning identities.

**Tech Stack:** Swift 6, SwiftUI/UIKit, SQLite, AVFoundation, Background Assets, CloudKit, Swift Testing, XCTest/XCUITest and XcodeGen.

**Spec:** `docs/superpowers/specs/2026-10-01-free-learning-packages-design.md`

## Global Constraints

- iOS 26.0 deployment minimum; iOS 27 Simulator verification only.
- No Expo/React Native/JavaScript runtime in the Swift product; preserve the Expo reference and all Git history.
- No advertising, Android, Supabase mutation, new backend or automatic commerce activation.
- Preserve package keys, manifests, fingerprints, versions, learning book identities, SQLite schema, XP and settings.
- Internal-content restrictions, stage rules, profile boundaries and microphone permissions remain independent of free access.
- No unapproved device replacement, account access, cloud reset, asset upload, TestFlight distribution or public release.
- Preserve unrelated working-tree changes. Stage explicit scoped patches only, especially in already-dirty `PRODUCT.md`.
- Required CI names, branch policy, complete non-commerce test coverage and human release approval remain intact.
- Test-first slices at the four approved public boundaries; no private-method assertions or synthetic progress claimed as installation.
- Review the final implementation before the requested local commit. No push, PR, merge or issue closure is authorized by this plan.

## Review Focus

1. A legacy `PaidDuo` descriptor without a product ID must retain its exact identity and pass delivery configuration validation (Task 1).
2. Internal free content must remain blocked without both existing explicit internal-content flags (Task 1).
3. Cancellation after transport finishes but before publication must not leave a ready partial package; explicit retry must remain possible (Task 2).
4. An existing installed package reopened without a transport or account must retain access and unchanged learning credit/preferences (Task 4).
5. Removing purchase tests must not remove filesystem publication-failure coverage or leave an empty/skipped required CI gate (Tasks 3–4).

## Working context and verification commands

Use the existing linked native worktree and current branch, as requested by the
implement skill. The implementation comparison base is
`e2b3d274757efb0bb9e58f9d8287709fce85815c`; the approved specification is committed
as `ea8bed4`. Confirm HEAD and the index before editing. Do not stage pre-existing
changes in `AGENTS.md`, `PRODUCT.md`, the old recovery report or Expo StoreKit tests.

Use a retained dedicated iOS 27 simulator selected by read-only inventory. Keep
its ID local in `NATIVE_SIM_ID`; never commit or publish device identifiers.
Generate the fictional CI identity with:

```sh
xcodegen generate --spec native-ios/project-ci.yml
```

The focused UI command is:

```sh
xcodebuild test -project native-ios/MetaShadowingNative.xcodeproj \
  -scheme MetaShadowingNative -configuration Debug \
  -destination "platform=iOS Simulator,id=$NATIVE_SIM_ID" \
  -derivedDataPath native-ios/DerivedData -parallel-testing-enabled NO \
  -collect-test-diagnostics never \
  -only-testing:NativeFoundationUITests/AppleServicesUITests \
  CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=-
```

Before Task 3, the existing StoreKit fixture setup may still be needed for old
commerce tests; the new free-access assertions must not use a StoreKit session.
After Task 3, remove setup entirely and run the normal scheme directly.

### Task 1: Delivery configuration without purchase prerequisites

**Files:**
- Modify/test: `native-ios/Packages/AppFoundation/Tests/AppFoundationTests/ServiceConfigurationTests.swift`
- Modify: `native-ios/Packages/AppFoundation/Sources/AppFoundation/ProductServiceConfiguration.swift`
- Modify/test: `native-ios/scripts/configure-apple-services.swift`

**Interfaces:**
- Consumes: `ProductServiceConfiguration.init(values: [String: String], sampleRoot: URL, localVideoRoot: URL? = nil) throws` and `serviceConfiguration(info:entitlements:internalContent:)`.
- Produces: the existing package/listing arrays without a purchase product-ID prerequisite. Configuration mapping emits delivery/cloud keys only. Legacy delivery prefixes remain compatibility inputs, not purchase authority.

- [x] Add `legacyDuoDeliveryConfigurationNeedsNoPurchaseProduct` with a synthetic valid `duo-33-v1` manifest/descriptor, the existing `PaidDuo` delivery keys and no `LearningBookProductID`. Assert the package key, decoded book identity and manifest version remain exact; repeat with a historical product key and assert identical delivery output.
- [x] Run `swift test --package-path native-ios/Packages/AppFoundation --filter ServiceConfigurationTests`. Require the new case to fail because current code rejects the missing product identifier, not because the fixture is invalid.
- [x] Remove only the paid product-ID prerequisite in the catalog configuration and mapper. Ignore legacy purchase metadata; do not emit it. Retain all manifest/hash/key/group validation and internal-content flags.
- [x] Add one case at a time for `FreeDuo` with each missing internal flag, descriptor hash mismatch, duplicate asset IDs and unknown package keys; assert rejection before any listing is published. Run each case red/green where behavior changes; retain existing passing protections.
- [x] Extend the mapper's self-test to require `LearningBookProductID` absent from emitted configuration while legacy delivery and exact cloud/downloader entitlements remain intact. Run `swift native-ios/scripts/configure-apple-services.swift --self-test` and the focused configuration suite.

### Task 2: Free download, installed access and normal UI

**Files:**
- Modify/test: `native-ios/Packages/AppleServices/Tests/AppleServicesTests/ContentDeliveryTests.swift`, `RecoveryTests.swift`, and retained delivery tests.
- Modify: `native-ios/Packages/AppleServices/Sources/AppleServices/Delivery/ContentDelivery.swift`
- Modify: `native-ios/Packages/AppFoundation/Sources/AppFoundation/ProductServicesModel.swift`, `ProductServiceConfiguration.swift`, `InstalledProductCatalog.swift`, `ProductCatalog.swift`
- Modify/test: `native-ios/Packages/AppFoundation/Tests/AppFoundationTests/ProductServicesModelTests.swift`, `InstalledProductCatalogTests.swift`, `ServiceConfigurationTests.swift`
- Modify: `native-ios/App/MetaShadowingApp.swift`, `ServiceTestAssets.swift`, `Browsing/BookCardView.swift`, `Browsing/BookTagsView.swift`, `Browsing/BookDownloadActions.swift`, `Settings/SettingsView.swift`
- Delete: `native-ios/App/Settings/PurchaseRestoreView.swift`
- Modify/test: `native-ios/Tests/AppUITests/AppleServicesUITests.swift`
- Update affected call sites: diagnostic download fixtures and media integration tests, without changing their isolation or cloud authority.

**Interfaces:**
- Produces: `HostedPackage.init(descriptor: DeliveryPackage, assetPackID: String?)`; no `paid` member.
- Produces: `ContentDelivery.init(root: URL, packages: [HostedPackage], transport: @Sendable (HostedPackage) -> (any AssetDelivery)? = ContentDelivery.appleTransport, purgeCache: @escaping @Sendable (HostedPackage) async throws -> Void = ContentDelivery.applePurge) throws`; no paid lease.
- Preserves: `download(packageKey:)`, `installation(packageKey:)`, `state(packageKey:)`, `statuses(packageKey:)`, `cancel(packageKey:)`, `cancelAll()`, `remove(packageKey:)` and change streams.
- Produces: `ProductServicesModel.init(profiles: ProductProfileOwner, store: any ServiceProfileStore, delivery: ContentDelivery, transport: any CloudTransport, packages: [HostedPackage])`; no ownership/access arguments, purchase methods or ownership state.
- Preserves: service confirmations, optional sync, profile transitions, download tasks and lifecycle cancellation.

- [x] Add `configuredPackageDownloadsWithoutPurchaseAuthority` using the existing valid synthetic content fixture initially marked paid, with no paid lease. Assert idle/uninstalled, successful download, ready installation and unchanged descriptor identity. Run `swift test --package-path native-ios/Packages/AppleServices --filter ContentDeliveryTests` and observe the current unauthorized failure.
- [x] Remove paid authorization from `ContentDelivery`; migrate `HostedPackage` and all consumers to the signatures above. Remove `ProductServiceConfiguration.productID`, commerce members/observers from `ProductServicesModel`, and ownership construction from the app root. Update test constructors without fake ownership.
- [x] Re-run focused delivery, catalog and service-model suites after each interface slice. Compile `AppFoundation` regularly with `swift build --package-path native-ios/Packages/AppFoundation`. Retain catalog/profile and delivery-change notifications, but remove commerce-only notifications.
- [x] Add controlled-transport public delivery cases for cancel while held, cancel after non-cooperative completion, explicit retry, corrupt bytes and preserved sibling installation. Assert cancelled/failed operations do not publish a ready installation; retry installs only validated bytes. Verify through `ContentDelivery`, not private state.
- [x] Add `testFreeDownloadsAndSettingsHaveNoCommerceControls`. Launch isolated normal service UI without a StoreKit session; assert explicit download exists, purchase confirmation is absent, installation enables stage selection, XP stays `0 / 100 XP`, and settings retains iCloud/data management but no purchase restoration. Run the case red before removing the UI.
- [x] Delete purchase navigation/view, paid labels and Debug purchase-only launch arguments. Update download-removal copy to retain learning history only. Keep 44-point touch areas and existing icon actions; do not redesign unrelated layout.
- [x] Replace the paid-card and long-price cases with free-access/no-commerce assertions. Preserve the existing largest-text, light/dark, cloud-confirmation, download-removal and profile-reset journeys. Run the focused UI command above and an iOS Debug build.

### Task 3: Remove obsolete commerce implementation and CI setup

**Files:**
- Delete active obsolete source: `native-ios/Packages/AppleServices/Sources/AppleServices/Ownership/OwnershipService.swift`, `PackageAccess.swift`, `PackageAccessLease.swift`, and `Delivery/PaidPackageDownload.swift`
- Delete commerce-only tests: `native-ios/Packages/AppleServices/Tests/AppleServicesTests/OwnershipTests.swift`, `native-ios/Tests/AppleServiceIntegrationTests/OwnershipTests.swift`, its `Fixtures/Books.storekit`, and `native-ios/Tests/StoreKitFixtureSetup/StoreKitFixtureSetupTests.swift`
- Replace: `native-ios/Packages/AppleServices/Tests/AppleServicesTests/PaidDeliveryTests.swift` with `PublicationFailureTests.swift` containing its non-commerce filesystem coverage.
- Modify: `native-ios/project.yml`, `.github/workflows/ci.yml`, `native-ios/scripts/test-ci-configuration.sh`, `native-ios/scripts/verify-native-product.sh` if its diagnostic expectations change.

**Interfaces:**
- Preserves: normal native scheme with complete `NativeFoundationUITests` and `NativeMediaIntegrationTests` targets, serial execution and no skipped/selected test exclusions in the scheme.
- Removes: `NativeAppleServiceTests` only after verifying its directory contains commerce tests only; `NativeStoreKitFixtureSetup`, its setup scheme and `StoreKitTest.framework` references.
- Preserves: required CI jobs and exact player/remaining complementary selections, finalized-result checks, nonzero passed test counts and release approval.

- [x] Change the configuration contract test to require exactly the two remaining complete test targets, no StoreKit setup scheme or framework, and unchanged fictional identity/iOS/Swift settings. Run `bash native-ios/scripts/test-ci-configuration.sh`; observe failure on the existing purchase targets.
- [x] Move publication out-of-space/no-permission and rejected-publication cleanup cases into `PublicationFailureTests.swift` before deleting obsolete paid tests. Keep assertions that staging is cleaned, sibling material remains installed and retry succeeds; remove only entitlement/revocation expectations.
- [x] Remove obsolete source/tests, target dependencies and setup scheme. Remove the CI StoreKit build/setup steps and stale setup comments. Do not reduce UI suite coverage or convert failed tests to skips.
- [x] Run `swift test --package-path native-ios/Packages/AppleServices --filter PublicationFailureTests`, `bash native-ios/scripts/test-ci-configuration.sh`, `bash native-ios/scripts/test-service-build.sh`, the mapper self-test and `actionlint .github/workflows/ci.yml`. Require success.
- [x] Inspect active Swift source/spec/workflow for `OwnershipService`, `PackageAccess`, `StoreKitTest`, `restore-purchases`, `LearningBookProductID` and purchase-only flags. Only explicit legacy-input regression checks or historical documentation may retain those strings. Do not edit Expo source/tests.

### Task 4: Durable acceptance, documentation, full verification and review

**Files:**
- Modify/test: `native-ios/Packages/AppFoundation/Tests/AppFoundationTests/InstalledProductCatalogTests.swift`, `ProductServicesModelTests.swift`
- Modify/test: `native-ios/Tests/AppUITests/AppleServicesUITests.swift`
- Modify scoped hunks: `PRODUCT.md`, `native-ios/README.md`, `docs/native-ci.md`, `docs/learning-contract.md`, `docs/apple-only-foundation.md`, `docs/native-rebuild.md`, `docs/swift-native/apple-services-contract.md`, `docs/swift-native/product-ui-contract.md`
- Add: `docs/swift-native/free-package-acceptance.md` with sanitized evidence and explicit unverified gates.

**Interfaces:**
- Consumes: Tasks 1–3's free catalog/delivery/services, existing `ProductWorkspace` and public `LearningStore` operations.
- Produces: unchanged durable learning/profile semantics, current free-only contracts and independently scoped acceptance evidence.

- [x] Add `offlineInstalledPackageReopenPreservesCheckpointCreditAndPreferences`: install valid synthetic content, save an explicit confirmation and preferences through public learning interfaces, capture their results, then reopen the same roots with a new store/catalog and no delivery transport. Assert access remains allowed and checkpoint/progress/preferences match captured values; opening/downloading again does not increase XP. Never use raw SQL as an assertion shortcut.
- [x] Add a normal UI relaunch assertion to the existing downloaded-learning journey: retain its namespace, checkpoint and preferences; terminate/relaunch; verify retained progress, no automatic player completion and usable installed lesson. Keep reset tests separate and preserve their existing explicit confirmation semantics.
- [x] Update current docs to free-only scope, retained identity/validation/cloud boundaries and the two-target scheme. Mark old paid requirements superseded without altering old evidence. For dirty `PRODUCT.md`, stage only #108's changes against the committed version and preserve the unrelated local rewrite unstaged.
- [x] Run all six package suites: `swift test --package-path native-ios/Packages/LearningDomain`, `LearningPersistence`, `AppFoundation`, `LearningMedia`, `LearningReference`, and `AppleServices` using the same complete command with each package path. Require zero failures.
- [x] Generate `project-ci.yml`; run the complete iOS 27 `MetaShadowingNative` test command above without `-only-testing`. Record zero failures and zero skips from the finalized result bundle. Run unsigned Debug and Release builds and `verify-native-product.sh` on each built app. No StoreKit setup remains.
- [x] Run mapper/video-copy self-tests, CI configuration/downloader/build-progress checks, `node --test scripts/check-branch-policy.test.mjs`, `actionlint` and `git diff --check`. Keep all assertions and distinguish local results from hosted CI.
- [x] Use `/code-review` for independent standards and spec axes against the fixed implementation base. Supply #108 and this written spec. Resolve material findings and rerun affected tests; if code changes after full verification, rerun the complete relevant suite before claiming completion.
- [x] Inspect the staged patch and commit only this issue's implementation, tests, documentation and plan updates on the current branch with `Refs #108` and `Refs #91`. Leave unrelated changes unstaged. Report the commit, review findings and remaining approved-build/hosted-CI/merge gates; do not close #108 or claim signed-device acceptance.

## Execution handoff

The tasks share catalog, service-model and target interfaces, so sequential native
execution in this session is recommended. Independent standards/spec reviewers
run after the completed patch, as required by the implement skill. The alternative
is subagent-driven execution with a fresh implementer/reviewer per task, at higher
context cost. No implementation begins until the owner reviews this plan and
selects the execution method.
