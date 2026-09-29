# Native cutover feature matrix — #99

Audit baseline: `5cc59aa`, tree equal to merged `dev` at `1096342` (2026-09-29).
This document preserves the 48 W1 feature IDs without depending on untracked W1 drafts.
The Expo source remains a behavioral reference, not part of the shipped Swift app.

## Evidence legend

Implementation and acceptance are different axes. `implemented` means the corresponding
native path exists and was inspected; it does not mean every device journey passed.
`partial` names a known gap. Automated `passed` records the final #99 local package and simulator coverage.
It does not represent hosted CI, physical-device, or live-service acceptance.

All source/test paths below are relative to `native-ios/`. `P` = pending; `N` =
not-applicable (no live service involved). Device `P` requires a representative
normal-app journey or the hardware checks in #103. No manual VoiceOver check is
required, per the owner; accessible names and hidden-text protections remain required.

| Feature ID | Implementation / native boundary | Relevant automated coverage | Automated | Device | Live service |
| --- | --- | --- | --- | --- | --- |
| launch-animation | implemented: `App/LaunchGateView.swift`, `App/LaunchArtworkView.swift` | `Tests/MediaIntegrationTests/LaunchArtworkTests.swift`; LearningMedia `LaunchPlaybackTests` | passed | P | N |
| launch-haptics | implemented: LearningMedia `HapticPattern`, `NativeHapticPlayer` | `Tests/MediaIntegrationTests/NativeHapticTests.swift`; LearningMedia `HapticPatternTests` | passed | P (#103; older W4 launch result retained) | N |
| library-navigation | implemented: `App/Browsing/ProductTabsView.swift`; native three-tab shell | `Tests/AppUITests/ProductUITests.swift` | passed | P | N |
| library-selection | implemented: AppFoundation `ProductModel`, `ProductWorkspace` | AppFoundation `ProductWorkspaceTests`, `ProductModelTests` | passed | P | N |
| library-cards | implemented: `App/Browsing/BookCardView.swift`, `BookTagsView.swift`; paid/sample/free metadata and minimum curriculum XP | `Tests/AppUITests/ProductUITests.swift`, `AppleServicesUITests.swift` paid-card regression | passed | P | N |
| library-resume | implemented: AppFoundation `ProductWorkspace.openLesson`; `App/Player/LearningFlow.swift` | AppFoundation `ProductWorkspaceTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| library-download-ui | implemented: `App/Browsing/BookDownloadActions.swift` | `Tests/AppUITests/AppleServicesUITests.swift`; AppleServices `ContentDeliveryTests` | passed | P | P |
| study-header | implemented: `App/Browsing/StudyHeaderView.swift`; language-scoped progress | `Tests/AppUITests/ProductUITests.swift`; LearningPersistence `LearningBrowsingTests` | passed | P | N |
| stage-map | implemented: `App/Browsing/StagePathView.swift`; domain unlock rules | AppFoundation `ProductWorkspaceTests`; `Tests/AppUITests/ProductUITests.swift` | passed | P | N |
| stages-subtitle | implemented: LearningDomain policies/reducer; `App/Player/LearningContentView.swift` | LearningDomain `ReferenceTraceTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| stages-first-word | implemented: LearningDomain text policies; LearningMedia presentation | LearningDomain `LearningTextTests`; `Tests/AppUITests/ProductAccessibilityUITests.swift` | passed | P | N |
| stages-grouped | implemented: LearningDomain plans; native segment transports | LearningDomain `LearningPlanTests`, `ReferenceTraceTests`; `Tests/MediaIntegrationTests/VideoSegmentTransportTests.swift` | passed | P | N |
| stages-reveal | implemented: LearningDomain `RevealTimeline`; LearningMedia `SilentRevealClock` | LearningDomain `ReferenceTraceTests`, `RevealTimelineTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| manual-confirmation | implemented: LearningDomain reducer; real SQLite/controller | LearningDomain `LearningSessionTests`; AppFoundation `LearningControllerTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| regroup-lineage | implemented: LearningDomain `LearningRegrouping` | LearningDomain `LearningRegroupingTests`, `ReferenceTraceTests`; LearningPersistence `SQLiteLearningStoreTests` | passed | P | N |
| sentence-navigation | implemented: `App/Player/AllSentencesView.swift`; domain navigation | LearningDomain `LearningNavigationTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| player-lifecycle | implemented: `App/Player/LearningFlow.swift`; LearningMedia runtime/coordinator | `Tests/MediaIntegrationTests/NativeLifecycleTests.swift`, `ReferenceLifecycleTests.swift`; LearningMedia coordinator tests | passed | P (#103) | N |
| player-options-guide | implemented: `App/Player/LearningOptionsView.swift`, `LearningGuideView.swift` | `Tests/MediaIntegrationTests/LearningGuideTests.swift`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| progress-journal | implemented: LearningPersistence SQLite transaction boundary | LearningPersistence `SQLiteLearningStoreTests`; AppFoundation `LearningControllerTests` | passed | P | N |
| progress-rewards | implemented: LearningDomain reward/level/streak receipts | LearningDomain `LearningRewardsTests`, `LearningProgressTests`, `ReferenceTraceTests` | passed | P | N |
| progress-feedback | implemented: committed haptics and expiring native XP/completion receipts in `App/Player/LearningRewardView.swift` | AppFoundation `CommittedFeedbackTests` (including imported XP and lost replies); LearningMedia `HapticPatternTests`; `PlayerUITests` receipt/relaunch regression | passed | P (#103) | N |
| progress-profile | implemented: AppFoundation `ProductProfileOwner`; profile-scoped stores | AppFoundation `ProductProfileOwnerTests`; LearningPersistence `ServiceStorageTests` | passed | P | P |
| progress-reset | implemented: scoped confirmations and durable reset generations | AppleServices `ResetTests`; LearningPersistence `ProfileResetTests`; AppFoundation `ProductServicesModelTests` | passed | P | P |
| settings-rate | implemented: `App/Settings/RateEditorView.swift`; paused session edits remain separate | `Tests/AppUITests/ProductUITests.swift`, `PlayerUITests.swift`; LearningDomain `LearningPreferencesTests` | passed | P | N |
| settings-typography | implemented: `App/Settings/TypographyEditorView.swift`, `App/Shared/LearningFont.swift` | AppFoundation `LearningTypographyDraftTests`; `Tests/AppUITests/ProductUITests.swift` | passed | P | N |
| settings-display-group | implemented: `App/Settings/LearningPreferencesView.swift`; domain regrouping | LearningDomain `LearningPreferencesTests`, `LearningRegroupingTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| settings-speaking-speed | implemented: `App/Settings/RevealSpeedEditorView.swift`; reveal drafts | AppFoundation `LearningRevealSpeedDraftTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| media-audio | implemented: LearningMedia `AudioQueueTransport` | `Tests/MediaIntegrationTests/AudioQueueTransportTests.swift`, `LearningFlowTests.swift` | passed | P (#103) | N |
| media-video | implemented: LearningMedia `VideoSegmentTransport`; native video surface | `Tests/MediaIntegrationTests/VideoSegmentTransportTests.swift`; `Tests/AppUITests/PlayerUITests.swift` | passed | P (#103) | N |
| media-remote | implemented: LearningMedia remote owner/gate | LearningMedia `LessonRemoteStateTests`; `Tests/MediaIntegrationTests/NativeLifecycleTests.swift` | passed | P (#103) | N |
| media-monitor | implemented: LearningMedia monitoring/engine; `App/Player/VoiceMonitorControls.swift` | LearningMedia `VoiceMonitoringTests`, `LessonAudioSessionTests` | passed | P (#103) | N |
| reference-analysis | implemented: LearningReference readers; AppFoundation analysis; native graph/detail UI | LearningReference reader/relation tests; AppFoundation `ProductAnalysisTests`; `Tests/AppUITests/ReferenceToolsUITests.swift` | passed | P | N |
| reference-dictionary | implemented: `App/Reference/PlayerDictionaryText.swift`, `DictionaryPresenter.swift` | `Tests/MediaIntegrationTests/DictionaryOwnershipTests.swift`; `Tests/AppUITests/ReferenceToolsUITests.swift` | passed | P | N |
| reference-analysis-dictionary | implemented: `App/Reference/AnalysisDictionaryButton.swift`, `DictionaryRequestOwner.swift` | `Tests/MediaIntegrationTests/ReferenceLifecycleTests.swift`, `DictionaryOwnershipTests.swift` | passed | P | N |
| reference-copy | implemented: `App/Reference/SentenceCopyButton.swift`; source-only copy | `Tests/AppUITests/ReferenceToolsUITests.swift` | passed | P | N |
| purchase-entitlement | implemented: AppleServices ownership/access lease | `Tests/AppleServiceIntegrationTests/OwnershipTests.swift`; AppleServices `OwnershipTests` | passed | P | P |
| purchase-restore | implemented: `App/Settings/PurchaseRestoreView.swift`; explicit StoreKit sync | `Tests/AppleServiceIntegrationTests/OwnershipTests.swift` | passed | P | P |
| delivery-install | implemented: AppleServices validators/atomic installer | AppleServices `InstallationTests`, `ManifestTests`, `DeliveryTests` | passed | P | P |
| delivery-paid | implemented: AppleServices paid download and authorization revision | AppleServices `PaidDeliveryTests`, `ContentDeliveryTests` | passed | P | P |
| delivery-storage | implemented: AppleServices recovery/cache separation | AppleServices `StorageTests`, `RecoveryTests` | passed | P | P |
| delivery-video | implemented: AppleServices `LocalVideoSource`; pinned syntax/timing | AppleServices `ManifestTests`; AppFoundation `InstalledProductCatalogTests`; internal copy boundary self-test | passed | P | P (hosted source only) |
| cloud-consent | implemented: `App/Settings/CloudSyncView.swift`; native sync coordinator | AppleServices `SyncCoordinatorTests`; AppFoundation `ProductServicesModelTests`; service UI tests | passed | P | P |
| cloud-merge | implemented: validated domain codec and SQLite atomic reconciliation | LearningDomain `LearningBackupTests`; LearningPersistence `LearningBackupStorageTests`; AppleServices cloud tests | passed | P | P |
| cloud-ownership | implemented: profile/authority/lifetime-scoped coordination | AppleServices `CloudOwnerTests`, `SyncGenerationTests`, `NetworkAvailabilityTests`; AppFoundation profile tests | passed | P | P |
| accessibility-controls | implemented: labels, hidden-text representation, native controls; manual VoiceOver excluded | `Tests/AppUITests/ProductAccessibilityUITests.swift`, `PlayerUITests.swift`, `ReferenceToolsUITests.swift` | passed | P (non-VoiceOver) | N |
| accessibility-motion | implemented: launch/controls honor Reduce Motion; focused service journeys verified with the system setting enabled | LearningMedia `LaunchPlaybackTests`; Task 3 system-setting journeys | passed | P | N |
| accessibility-appearance | implemented: semantic surfaces; focused light/dark/large-text confirmations visually inspected | `Tests/AppUITests/ProductAccessibilityUITests.swift`; Task 3 rendered inspection | passed | P | N |
| developer-tools | implemented: Debug-only `App/Diagnostics/DeveloperToolsView.swift`; isolated analysis/media fixtures and presentation-only download preview | Release product guard; `AppleServicesUITests` diagnostic isolation/cancel/error/edit regression | passed | N (development-only) | N |

## Audit findings and resolution tracking

- **G1 — card metadata, resolved locally:** paid listings no longer claim to be samples. Cards display the existing minimum whole-curriculum estimate without awarding XP or granting access. Focused UI regression passed after failing on the original card.
- **G2 — visible committed feedback, resolved locally:** command-keyed receipts carry the original transaction's XP award and new-completion state. Imported language XP cannot inflate the receipt, and lost replies retain one unpublished receipt. The native presentation expires, honors Reduce Motion, stops on inactivity/exit, and stays quiet on restore or failed saves. Focused package and UI regressions passed.
- **G3 — app icon, resolved locally:** the standalone target now selects its AppIcon asset catalog. With owner approval, the original opaque `assets/brand/app-icon-full-bleed.png` was resized from 1254×1254 to 1024×1024 using macOS `sips`; the source artwork remains untouched. Built-product verification checks the compiled primary icon. The development display-name suffix is not a public-release decision.
- **G4 — diagnostics, resolved locally:** Settings exposes a Debug-only chooser. Analysis and audio/monitoring use isolated public fixtures. The download preview preserves ten-second progress, cancellation, storage-error/retry, edit/remove and reset controls without calling storage, delivery, purchase or learning APIs. Native foreground ownership remains in force; no latency/performance measurements are collected. Release exclusion still requires final built-product verification.
- **G5 — local evidence gaps, resolved:** the long StoreKit price and service confirmations passed at the largest text size, including light/dark and actual system Reduce Motion checks. No real purchase or fabricated entitlement was used. System motion preferences were restored afterward. Physical and live-service evidence remain separate gates.

## Scope notes

The native three-tab shell is an approved interaction modernization; the reference's inert mascot is not a fourth functional destination. Native spacing and controls need not match Expo geometry. Account/profile state, explicit confirmation, content authority, settings, and reference access rules must match.

The supplied launch-haptic hardware result from #95/#103 is historical, not a pass for the final candidate. Live StoreKit, Apple-hosted delivery and private CloudKit checks remain separate gates. See [cutover acceptance](cutover-acceptance.md) for fresh results and unresolved operations.
