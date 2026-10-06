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

Device updates dated 2026-09-30 distinguish the initially installed `ea22154`
candidate from later TestFlight 1.0 (5) observations on the approved iPhone/iPad.
Owner-reported results are labeled separately from agent-observed journeys in
[cutover acceptance](cutover-acceptance.md). A device `passed` accepts only that
representative journey, not every parameter or a public release. `partial`
retains the unchecked hardware/service portion.

| Feature ID | Implementation / native boundary | Relevant automated coverage | Automated | Device | Live service |
| --- | --- | --- | --- | --- | --- |
| launch-animation | implemented: `App/LaunchGateView.swift`, `App/LaunchArtworkView.swift` | `Tests/MediaIntegrationTests/LaunchArtworkTests.swift`; LearningMedia `LaunchPlaybackTests` | passed | P | N |
| launch-haptics | implemented: LearningMedia `HapticPattern`, `NativeHapticPlayer` | `Tests/MediaIntegrationTests/NativeHapticTests.swift`; LearningMedia `HapticPatternTests` | passed | P (#103; older W4 launch result retained) | N |
| library-navigation | implemented: `App/Browsing/ProductTabsView.swift`; native three-tab shell | `Tests/AppUITests/ProductUITests.swift` | passed | passed (2026-09-30) | N |
| library-selection | implemented: AppFoundation `ProductModel`, `ProductWorkspace` | AppFoundation `ProductWorkspaceTests`, `ProductModelTests` | passed | P | N |
| library-cards | implemented: `App/Browsing/BookCardView.swift`, `BookTagsView.swift`; paid/sample/free metadata and minimum curriculum XP | `Tests/AppUITests/ProductUITests.swift`, `AppleServicesUITests.swift` paid-card regression | passed | partial (sample/free; paid unavailable) | N |
| library-resume | implemented: AppFoundation `ProductWorkspace.openLesson`; `App/Player/LearningFlow.swift` | AppFoundation `ProductWorkspaceTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| library-download-ui | implemented: `App/Browsing/BookDownloadActions.swift` | `Tests/AppUITests/AppleServicesUITests.swift`, `DownloadLabUITests.swift`; AppleServices `ContentDeliveryTests` | passed | partial (TestFlight sample acquisition/cancel/retry owner-reported; 2026-09-30) | partial (TestFlight sample passed per owner; system-interruption recovery pending; internal free DUO failure undiagnosed) |
| study-header | implemented: `App/Browsing/StudyHeaderView.swift`; language-scoped progress | `Tests/AppUITests/ProductUITests.swift`; LearningPersistence `LearningBrowsingTests` | passed | passed (2026-09-30) | N |
| stage-map | implemented: `App/Browsing/StagePathView.swift`; domain unlock rules | AppFoundation `ProductWorkspaceTests`; `Tests/AppUITests/ProductUITests.swift` | passed | P | N |
| stages-subtitle | implemented: LearningDomain policies/reducer; `App/Player/LearningContentView.swift` | LearningDomain `ReferenceTraceTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| stages-first-word | implemented: LearningDomain text policies; LearningMedia presentation | LearningDomain `LearningTextTests`; `Tests/AppUITests/ProductAccessibilityUITests.swift` | passed | passed (Stages 5/10; 2026-09-30) | N |
| stages-grouped | implemented: LearningDomain plans; native segment transports | LearningDomain `LearningPlanTests`, `ReferenceTraceTests`; `Tests/MediaIntegrationTests/VideoSegmentTransportTests.swift` | passed | P | N |
| stages-reveal | implemented: LearningDomain `RevealTimeline`; LearningMedia `SilentRevealClock` | LearningDomain `ReferenceTraceTests`, `RevealTimelineTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| manual-confirmation | implemented: LearningDomain reducer; real SQLite/controller | LearningDomain `LearningSessionTests`; AppFoundation `LearningControllerTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| regroup-lineage | implemented: LearningDomain `LearningRegrouping` | LearningDomain `LearningRegroupingTests`, `ReferenceTraceTests`; LearningPersistence `SQLiteLearningStoreTests` | passed | P | N |
| sentence-navigation | implemented: `App/Player/AllSentencesView.swift`; domain navigation | LearningDomain `LearningNavigationTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | passed (paused grouped selection; 2026-09-30) | N |
| player-lifecycle | implemented: `App/Player/LearningFlow.swift`; LearningMedia runtime/coordinator | `Tests/MediaIntegrationTests/NativeLifecycleTests.swift`, `ReferenceLifecycleTests.swift`; LearningMedia coordinator tests | passed | partial (Home/relaunch/exit; #103 hardware pending) | N |
| player-options-guide | implemented: `App/Player/LearningOptionsView.swift`, `LearningGuideView.swift` | `Tests/MediaIntegrationTests/LearningGuideTests.swift`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| progress-journal | implemented: LearningPersistence SQLite transaction boundary | LearningPersistence `SQLiteLearningStoreTests`; AppFoundation `LearningControllerTests` | passed | passed (checkpoint/credit/relaunch/integrity; 2026-09-30) | N |
| progress-rewards | implemented: LearningDomain reward/level/streak receipts | LearningDomain `LearningRewardsTests`, `LearningProgressTests`, `ReferenceTraceTests` | passed | P | N |
| progress-feedback | implemented: committed haptics and expiring native XP/completion receipts in `App/Player/LearningRewardView.swift` | AppFoundation `CommittedFeedbackTests` (including imported XP and lost replies); LearningMedia `HapticPatternTests`; `PlayerUITests` receipt/relaunch regression | passed | partial (XP receipt observed; #103 haptics pending) | N |
| progress-profile | implemented: AppFoundation `ProductProfileOwner`; profile-scoped stores | AppFoundation `ProductProfileOwnerTests`; LearningPersistence `ServiceStorageTests` | passed | P | P |
| progress-reset | implemented: scoped confirmations and durable reset generations | AppleServices `ResetTests`; LearningPersistence `ProfileResetTests`; AppFoundation `ProductServicesModelTests`; `DownloadLabTests`, `DownloadLabUITests` | passed | partial (scoped iPad-local reset/recovery owner-reported; 2026-09-30) | P (real cloud reset/stale-client recovery; controlled lab is not live evidence) |
| settings-rate | implemented: `App/Settings/RateEditorView.swift`; paused session edits remain separate | `Tests/AppUITests/ProductUITests.swift`, `PlayerUITests.swift`; LearningDomain `LearningPreferencesTests` | passed | P | N |
| settings-typography | implemented: `App/Settings/TypographyEditorView.swift`, `App/Shared/LearningFont.swift` | AppFoundation `LearningTypographyDraftTests`; `Tests/AppUITests/ProductUITests.swift` | passed | passed (size/save/relaunch/restoration; 2026-09-30) | N |
| settings-display-group | implemented: `App/Settings/LearningPreferencesView.swift`; domain regrouping | LearningDomain `LearningPreferencesTests`, `LearningRegroupingTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| settings-speaking-speed | implemented: `App/Settings/RevealSpeedEditorView.swift`; reveal drafts | AppFoundation `LearningRevealSpeedDraftTests`; `Tests/AppUITests/PlayerUITests.swift` | passed | P | N |
| media-audio | implemented: LearningMedia `AudioQueueTransport` | `Tests/MediaIntegrationTests/AudioQueueTransportTests.swift`, `LearningFlowTests.swift` | passed | P (#103) | N |
| media-video | implemented: LearningMedia `VideoSegmentTransport`; native video surface | `Tests/MediaIntegrationTests/VideoSegmentTransportTests.swift`; `Tests/AppUITests/PlayerUITests.swift` | passed | P (#103) | N |
| media-remote | implemented: LearningMedia remote owner/gate | LearningMedia `LessonRemoteStateTests`; `Tests/MediaIntegrationTests/NativeLifecycleTests.swift` | passed | P (#103) | N |
| media-monitor | implemented: LearningMedia monitoring/engine; `App/Player/VoiceMonitorControls.swift` | LearningMedia `VoiceMonitoringTests`, `LessonAudioSessionTests` | passed | partial (owner-confirmed wired audibility on the initial candidate and Siri recovery on a later signed Debug candidate; call/lock-return recovery and exit cleanup on TestFlight 1.0 (5); learning stays paused; permission/gain, unsupported routes, completion and new graph-recovery edge remain P; #103) | N |
| reference-analysis | implemented: LearningReference readers; AppFoundation analysis; native graph/detail UI | LearningReference reader/relation tests; AppFoundation `ProductAnalysisTests`; `Tests/AppUITests/ReferenceToolsUITests.swift` | passed | P | N |
| reference-dictionary | implemented: `App/Reference/PlayerDictionaryText.swift`, `DictionaryPresenter.swift` | `Tests/MediaIntegrationTests/DictionaryOwnershipTests.swift`; `Tests/AppUITests/ReferenceToolsUITests.swift` | passed | passed (visible-word installed definitions; 2026-09-30) | N |
| reference-analysis-dictionary | implemented: `App/Reference/AnalysisDictionaryButton.swift`, `DictionaryRequestOwner.swift` | `Tests/MediaIntegrationTests/ReferenceLifecycleTests.swift`, `DictionaryOwnershipTests.swift` | passed | P | N |
| reference-copy | implemented: `App/Reference/SentenceCopyButton.swift`; source-only copy | `Tests/AppUITests/ReferenceToolsUITests.swift` | passed | P | N |
| purchase-entitlement | implemented: AppleServices ownership/access lease | `Tests/AppleServiceIntegrationTests/OwnershipTests.swift`; AppleServices `OwnershipTests` | passed | P | P |
| purchase-restore | implemented: `App/Settings/PurchaseRestoreView.swift`; explicit StoreKit sync | `Tests/AppleServiceIntegrationTests/OwnershipTests.swift` | passed | P | P |
| delivery-install | implemented: AppleServices validators/atomic installer | AppleServices `InstallationTests`, `ManifestTests`, `DeliveryTests`; `DownloadLabTests` | passed | partial (TestFlight sample acquisition/offline opening owner-reported; 2026-09-30) | partial (sample passed per owner; other packages and system-interruption recovery pending) |
| delivery-paid | implemented: AppleServices paid download and authorization revision | AppleServices `PaidDeliveryTests`, `ContentDeliveryTests` | passed | P | P |
| delivery-storage | implemented: AppleServices recovery/cache separation | AppleServices `StorageTests`, `RecoveryTests` | passed | P | P |
| delivery-video | implemented: AppleServices `LocalVideoSource`; pinned syntax/timing | AppleServices `ManifestTests`; AppFoundation `InstalledProductCatalogTests`; internal copy boundary self-test | passed | P | P (hosted source only) |
| cloud-consent | implemented: `App/Settings/CloudSyncView.swift`; native sync coordinator | AppleServices `SyncCoordinatorTests`; AppFoundation `ProductServicesModelTests`; service UI tests | passed | partial (agent-observed explicit one-time Development and two-device Production sync; auto-sync stays off; 2026-09-30) | partial (approved existing accounts only; account-switch/permission/quota recovery pending) |
| cloud-merge | implemented: validated domain codec and SQLite atomic reconciliation | LearningDomain `LearningBackupTests`; LearningPersistence `LearningBackupStorageTests`; AppleServices cloud tests | passed | partial (agent-observed sequential iPhone/iPad Production checkpoint/settings recovery, repeated-sync and cold-relaunch deduplication; 2026-09-30) | partial (single-device Development and sequential two-device Production passed; concurrent/offline-divergent merge and real cloud reset pending) |
| cloud-ownership | implemented: profile/authority/lifetime-scoped coordination | AppleServices `CloudOwnerTests`, `SyncGenerationTests`, `NetworkAvailabilityTests`; AppFoundation profile tests | passed | P | P |
| accessibility-controls | implemented: labels, hidden-text representation, native controls; manual VoiceOver excluded | `Tests/AppUITests/ProductAccessibilityUITests.swift`, `PlayerUITests.swift`, `ReferenceToolsUITests.swift` | passed | P (non-VoiceOver) | N |
| accessibility-motion | implemented: launch/controls honor Reduce Motion; focused service journeys verified with the system setting enabled | LearningMedia `LaunchPlaybackTests`; Task 3 system-setting journeys | passed | P | N |
| accessibility-appearance | implemented: semantic surfaces; focused light/dark/large-text confirmations visually inspected | `Tests/AppUITests/ProductAccessibilityUITests.swift`; Task 3 rendered inspection | passed | P | N |
| developer-tools | implemented: Debug-only `App/Diagnostics/DeveloperToolsView.swift`; isolated analysis/media fixtures, presentation-only preview and real-core controlled download/local recovery lab | Release product guard; `AppleServicesUITests` diagnostic regression; `DownloadLabTests` and `DownloadLabUITests` | passed | N (development-only; lab directly operated on dedicated simulator) | N (controlled transfer/local backup never count as live service) |

## Audit findings and resolution tracking

- **G1 — card metadata, resolved locally:** paid listings no longer claim to be samples. Cards display the existing minimum whole-curriculum estimate without awarding XP or granting access. Focused UI regression passed after failing on the original card.
- **G2 — visible committed feedback, resolved locally:** command-keyed receipts carry the original transaction's XP award and new-completion state. Imported language XP cannot inflate the receipt, and lost replies retain one unpublished receipt. The native presentation expires, honors Reduce Motion, stops on inactivity/exit, and stays quiet on restore or failed saves. Focused package and UI regressions passed.
- **G3 — app icon, resolved locally:** since 2026-10-06 (#122), the standalone target uses the layered Icon Composer icon `native-ios/App/AppIcon.icon` in place of the flat asset-catalog icon. Its top layer is a separate 1024×1024 copy, made with owner approval from `assets/brand/app-icon-full-bleed.png` using macOS `sips`; that 1254×1254 source file is unchanged. Default and Dark show this existing icon, and Clear and Tinted show the unchanged `mascot.png`. Built-product verification checks the compiled primary icon.
- **G4 — diagnostics, resolved locally:** Settings exposes a Debug-only chooser. Analysis and audio/monitoring use isolated public fixtures. The presentation-only preview does not call storage, delivery, purchase or learning APIs. A separate approved lab drives real delivery validation/installation and SQLite reset/local backup recovery with a controlled ten-second transfer, isolated UUID storage and owned teardown. Neither tool proves live Apple-hosted or cloud reset acceptance. Native foreground ownership and Release exclusion are verified; no performance measurements are collected.
- **G5 — local evidence gaps, resolved:** the long StoreKit price and service confirmations passed at the largest text size, including light/dark and actual system Reduce Motion checks. No real purchase or fabricated entitlement was used. System motion preferences were restored afterward. Physical and live-service evidence remain separate gates.

## Scope notes

The native three-tab shell is an approved interaction modernization; the reference's inert mascot is not a fourth functional destination. Native spacing and controls need not match Expo geometry. Account/profile state, explicit confirmation, content authority, settings, and reference access rules must match.

The supplied launch-haptic hardware result from #95/#103 is historical, not a pass for the final candidate. Live StoreKit, Apple-hosted delivery and private CloudKit checks remain separate gates. See [cutover acceptance](cutover-acceptance.md) for fresh results and unresolved operations.
