import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import AppleServices

@CloudActor struct SyncCoordinatorTests {
    @Test func twoInstallationsConvergeWithoutDuplicateCreditAfterColdRestart() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try makeSyncFixture(root.appendingPathComponent("first"))
        let secondRoot = root.appendingPathComponent("second")
        let second = try makeSyncFixture(secondRoot, cloud: first.cloud)
        await first.coordinator.refreshAccount()
        try await first.coordinator.refresh(generation: first.coordinator.snapshot.generation)
        let firstProfile = await first.coordinator.snapshot.profileID
        _ = try await earnFixtureProgress(first.store, profile: firstProfile, run: "first-installation")
        try await first.coordinator.refresh(generation: first.coordinator.snapshot.generation)

        await second.coordinator.refreshAccount()
        let initialProfile = await second.coordinator.snapshot.profileID
        #expect(try await second.store.readLanguageProgress(profileID: initialProfile, language: "english", today: StudyDay("2026-09-27")).xp == 0)
        #expect(await second.coordinator.snapshot.enabled == false)
        try await second.coordinator.refresh(generation: second.coordinator.snapshot.generation)
        let secondProfile = await second.coordinator.snapshot.profileID
        #expect(try await second.store.readLanguageProgress(profileID: secondProfile, language: "english", today: StudyDay("2026-09-27")).xp == 3)
        _ = try await earnFixtureProgress(second.store, profile: secondProfile, run: "second-installation")
        try await second.coordinator.refresh(generation: second.coordinator.snapshot.generation)
        try await first.coordinator.refresh(generation: first.coordinator.snapshot.generation)
        #expect(try await first.store.readLanguageProgress(profileID: firstProfile, language: "english", today: StudyDay("2026-09-27")).xp == 6)
        await second.coordinator.stop()

        let reopened = try makeSyncFixture(secondRoot, cloud: first.cloud)
        await reopened.coordinator.refreshAccount()
        #expect(await reopened.coordinator.snapshot.profileID == secondProfile)
        #expect(await reopened.coordinator.snapshot.enabled == false)
        let before = try await reopened.store.exportBackup(profileID: secondProfile).payload
        try await reopened.coordinator.refresh(generation: reopened.coordinator.snapshot.generation)
        try await reopened.coordinator.refresh(generation: reopened.coordinator.snapshot.generation)
        #expect(try await reopened.store.readLanguageProgress(profileID: secondProfile, language: "english", today: StudyDay("2026-09-27")).xp == 6)
        #expect(try await reopened.store.exportBackup(profileID: secondProfile).payload == before)
        #expect(await first.coordinator.snapshot.enabled == false)
        #expect(await reopened.coordinator.snapshot.enabled == false)
        await reopened.coordinator.stop()
        await first.coordinator.stop()
    }
    @Test func coldStaleInstallationAdoptsResetWithoutResurrectingOfflineCredit() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let first = try makeSyncFixture(root.appendingPathComponent("first"))
        let secondRoot = root.appendingPathComponent("second")
        let second = try makeSyncFixture(secondRoot, cloud: first.cloud)
        let guest = try await earnFixtureProgress(second.store, profile: "local", run: "separate-guest")
        await first.coordinator.refreshAccount()
        try await first.coordinator.refresh(generation: first.coordinator.snapshot.generation)
        let firstProfile = await first.coordinator.snapshot.profileID
        _ = try await earnFixtureProgress(first.store, profile: firstProfile, run: "before-reset")
        try await first.coordinator.refresh(generation: first.coordinator.snapshot.generation)
        await second.coordinator.refreshAccount()
        try await second.coordinator.refresh(generation: second.coordinator.snapshot.generation)
        let secondProfile = await second.coordinator.snapshot.profileID
        _ = try await earnFixtureProgress(second.store, profile: secondProfile, run: "offline-stale-learning")
        first.cloud.failFetch = true
        await #expect(throws: ProgressCloudError.offline) {
            try await second.coordinator.refresh(generation: second.coordinator.snapshot.generation)
        }
        #expect(try await second.store.readLanguageProgress(profileID: secondProfile, language: "english", today: StudyDay("2026-09-27")).xp == 6)
        await second.coordinator.stop()
        first.cloud.failFetch = false

        try await first.coordinator.deleteCloud(generation: first.coordinator.snapshot.generation)
        let reset = try #require(await first.store.exportBackup(profileID: firstProfile).resetGeneration)
        #expect(try await first.store.readLanguageProgress(profileID: firstProfile, language: "english", today: StudyDay("2026-09-27")).xp == 0)
        await first.coordinator.stop()
        let reopened = try makeSyncFixture(secondRoot, cloud: first.cloud)
        await reopened.coordinator.refreshAccount()
        #expect(try await reopened.store.readLanguageProgress(profileID: secondProfile, language: "english", today: StudyDay("2026-09-27")).xp == 6)
        try await reopened.coordinator.refresh(generation: reopened.coordinator.snapshot.generation)
        #expect(try await reopened.store.readLanguageProgress(profileID: secondProfile, language: "english", today: StudyDay("2026-09-27")).xp == 0)
        #expect(try await reopened.store.exportBackup(profileID: secondProfile).resetGeneration == reset)
        #expect(try await reopened.store.exportBackup(profileID: "local").payload == guest)
        #expect(await reopened.coordinator.snapshot.enabled == false)
        _ = try await earnFixtureProgress(reopened.store, profile: secondProfile, run: "after-reset")
        try await reopened.coordinator.refresh(generation: reopened.coordinator.snapshot.generation)
        try await reopened.coordinator.refresh(generation: reopened.coordinator.snapshot.generation)
        #expect(try await reopened.store.readLanguageProgress(profileID: secondProfile, language: "english", today: StudyDay("2026-09-27")).xp == 3)
        #expect(try await reopened.store.exportBackup(profileID: secondProfile).resetGeneration == reset)
        await reopened.coordinator.stop()
    }
    @Test(arguments: [CloudAccount.unknown, .unavailable], [false, true])
    func reconnectRechecksAccountAndHonorsSavedConsent(initialAccount: CloudAccount, enabled: Bool) async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        if !enabled { try await fixture.coordinator.disable(generation: fixture.coordinator.snapshot.generation) }
        let profile = await fixture.coordinator.snapshot.profileID
        await fixture.coordinator.stop()

        var online = false
        let owner = ProgressCloudOwner(cacheDirectory: { root.appendingPathComponent("reconnect-\($0)") }, activationAccess: {
            .init(identity: { fixture.cloud.account }, makeTransport: {
                try ProgressTransport(directory: root.appendingPathComponent("reconnect-\($0)"), scope: $0, cloud: fixture.cloud)
            })
        })
        let store = SQLiteLearningStore(root: root.appendingPathComponent("learning"))
        let coordinator = SyncCoordinator(store: store, transport: NativeCloudTransport(owner: owner,
            account: { online ? .available(fixture.cloud.account) : initialAccount }))
        await coordinator.refreshAccount()
        #expect(await coordinator.snapshot.account == initialAccount)
        #expect(await coordinator.snapshot.profileID == profile)
        let revision = try await store.savePreferences(.init(libraryLanguage: "french"), profileID: profile)
        let before = try await store.exportBackup(profileID: profile)
        #expect(before.acknowledgedRevision < revision)

        // A reconnect while backgrounded cannot reactivate services.
        await coordinator.setActive(false)
        online = true
        await coordinator.networkAvailable()
        #expect(await coordinator.snapshot.account == initialAccount)
        #expect(try await store.exportBackup(profileID: profile) == before)
        online = false
        await coordinator.setActive(true)
        await coordinator.networkAvailable()
        #expect(await coordinator.snapshot.account == initialAccount)
        #expect(try await store.exportBackup(profileID: profile) == before)

        online = true
        await coordinator.networkAvailable()
        #expect(await coordinator.snapshot.account == .available(fixture.cloud.account))
        #expect(await coordinator.snapshot.profileID == profile)
        #expect(await coordinator.snapshot.enabled == enabled)
        let after = try await store.exportBackup(profileID: profile)
        #expect(after.acknowledgedRevision == (enabled ? revision : before.acknowledgedRevision))
        #expect(try await store.preferences(profileID: profile).libraryLanguage == "french")
        await coordinator.stop()
    }
    @Test func explicitCloudDeleteWorksAfterDisablingAutomaticSync() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        try await fixture.coordinator.disable(generation: fixture.coordinator.snapshot.generation)
        try await fixture.coordinator.deleteCloud(generation: fixture.coordinator.snapshot.generation)
        #expect(fixture.cloud.records[ProgressTransport.sharedHead]?.resetGeneration != nil)
        #expect(await fixture.coordinator.snapshot.enabled == false)
        await fixture.coordinator.stop()
    }
    @Test func localDeleteAfterDisablingSyncRetainsGuestAndDeletesDisplayedAccount() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        _ = try await fixture.store.savePreferences(.init(libraryLanguage: "french"), profileID: profile)
        _ = try await fixture.store.savePreferences(.init(libraryLanguage: "japanese"), profileID: "local")
        try await fixture.coordinator.disable(generation: fixture.coordinator.snapshot.generation)
        try await fixture.coordinator.removeLocal(generation: fixture.coordinator.snapshot.generation)
        #expect(try await fixture.store.preferences(profileID: profile) == ProfilePreferences())
        #expect(try await fixture.store.preferences(profileID: "local").libraryLanguage == "japanese")
        #expect(await fixture.coordinator.snapshot.profileID == profile)
        await fixture.coordinator.stop()
    }
    @Test func failedGuestImportResumesAfterRestartWithoutLosingTheChoice() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        _ = try await earnFixtureProgress(fixture.store, profile: "local", run: "guest-retry")
        fixture.cloud.failFetch = true
        await fixture.coordinator.refreshAccount()
        await #expect(throws: ProgressCloudError.offline) {
            try await fixture.coordinator.enable(importGuest: true, generation: fixture.coordinator.snapshot.generation)
        }
        await fixture.coordinator.stop()
        fixture.cloud.failFetch = false
        await fixture.coordinator.refreshAccount()
        let profile = await fixture.coordinator.snapshot.profileID
        #expect(try await fixture.store.readLanguageProgress(profileID: profile, language: "english", today: StudyDay("2026-09-27")).xp == 3)
        await fixture.coordinator.stop()
    }
    @Test func unfinishedGuestResetResumesEvenWhenAnAccountIsAvailable() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        _ = try await fixture.store.savePreferences(.init(libraryLanguage: "french"), profileID: "local")
        let guest = try await fixture.store.activateService(scope: nil)
        _ = try await fixture.store.beginHistoryReset(.local, requestID: UUID(), lease: guest)
        await fixture.coordinator.refreshAccount()
        let current = try await fixture.store.activateService(scope: nil)
        #expect(try await fixture.store.serviceState(current).resetIntent == nil)
        #expect(try await fixture.store.preferences(profileID: "local") == ProfilePreferences())
        #expect(fixture.cloud.records.isEmpty)
        await fixture.coordinator.stop()
    }
    @Test func offlineRestartKeepsThePreviouslySelectedProfileWithoutCloudWrites() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        await fixture.coordinator.stop()
        let records = fixture.cloud.records
        let owner = ProgressCloudOwner(activationAccess: { throw ProgressCloudError.unavailable })
        let offline = SyncCoordinator(store: SQLiteLearningStore(root: root.appendingPathComponent("learning")),
            transport: NativeCloudTransport(owner: owner, account: { .unknown }))
        await offline.refreshAccount()
        #expect(await offline.snapshot.profileID == profile)
        #expect(await offline.snapshot.account == .unknown)
        #expect(fixture.cloud.records.keys == records.keys)
        await offline.stop()
    }
    @Test func publicationOnlyAcknowledgesTheExportedRevision() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        let exported = try await fixture.store.savePreferences(.init(libraryLanguage: "french"), profileID: profile)
        var later: Int64?
        fixture.cloud.onSave = { _ in
            guard later == nil else { return }
            later = try? await fixture.store.savePreferences(.init(libraryLanguage: "japanese"), profileID: profile)
        }
        try await fixture.coordinator.refresh(generation: fixture.coordinator.snapshot.generation)
        let receipt = try await fixture.store.exportBackup(profileID: profile)
        #expect(receipt.acknowledgedRevision == exported)
        #expect(receipt.revision == later)
        #expect(receipt.revision > receipt.acknowledgedRevision)
        await fixture.coordinator.stop()
    }
    @Test func disabledOneShotRefreshDoesNotEnableAutomaticPublication() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.refresh(generation: fixture.coordinator.snapshot.generation)
        #expect(await fixture.coordinator.snapshot.enabled == false)
        let current = fixture.cloud.records[ProgressTransport.sharedHead]?.current
        let profile = await fixture.coordinator.snapshot.profileID
        _ = try await fixture.store.savePreferences(.init(libraryLanguage: "french"), profileID: profile)
        await fixture.coordinator.localDidCommit()
        try await Task.sleep(for: .milliseconds(2200))
        #expect(fixture.cloud.records[ProgressTransport.sharedHead]?.current == current)
        await fixture.coordinator.stop()
    }
    @Test func incompatibleGuestImportDoesNotPartiallyAdoptRemoteReset() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        _ = try await earnFixtureProgress(fixture.store, profile: profile, run: "preserve-until-validated")
        let before = try await fixture.store.exportBackup(profileID: profile)
        let other = try ProgressTransport(directory: root.appendingPathComponent("other"), scope: "test-scope", cloud: fixture.cloud)
        let request = UUID()
        let empty = try JSONSerialization.data(withJSONObject: ["version": 5, "generation": request.uuidString.lowercased(),
            "progress": JSONSerialization.jsonObject(with: LearningBackupCodec.encode(.empty))])
        _ = try await other.reset(scope: "test-scope", requestId: request.uuidString.lowercased(), expectedGeneration: "", json: String(decoding: empty, as: UTF8.self))
        await #expect(throws: (any Error).self) {
            try await fixture.coordinator.refresh(importGuest: true, generation: fixture.coordinator.snapshot.generation)
        }
        #expect(try await fixture.store.exportBackup(profileID: profile).payload == before.payload)
        await fixture.coordinator.stop()
    }
    @Test func committedPreferencesAutomaticallyPublishWhenEnabled() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        let revision = try await fixture.store.savePreferences(.init(libraryLanguage: "french"), profileID: profile)
        for _ in 0..<80 {
            if try await fixture.store.exportBackup(profileID: profile).acknowledgedRevision >= revision { break }
            try await Task.sleep(for: .milliseconds(50))
        }
        #expect(try await fixture.store.exportBackup(profileID: profile).acknowledgedRevision == revision)
        await fixture.coordinator.stop()
    }
    @Test func failedCloudResetResumesThePersistedRequestAfterRestart() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        fixture.cloud.saveFailure = .offline
        await #expect(throws: ProgressCloudError.offline) {
            try await fixture.coordinator.deleteCloud(generation: fixture.coordinator.snapshot.generation)
        }
        #expect(await fixture.coordinator.snapshot.resetPending)
        fixture.cloud.saveFailure = nil
        await fixture.coordinator.stop()
        await fixture.coordinator.refreshAccount()
        #expect(await fixture.coordinator.snapshot.resetPending == false)
        #expect(await fixture.coordinator.snapshot.enabled == false)
        #expect(try await fixture.store.exportBackup(profileID: profile).resetGeneration != nil)
        await fixture.coordinator.stop()
    }

    @Test func explicitGuestImportUnionsHistoryWithoutDuplicatingCredit() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        _ = try await earnFixtureProgress(fixture.store, profile: "local", run: "guest-run")
        let remote = SQLiteLearningStore(root: root.appendingPathComponent("remote"))
        let payload = try await earnFixtureProgress(remote, profile: "remote", run: "remote-run")
        let seeder = try ProgressTransport(directory: root.appendingPathComponent("seed"), scope: "test-scope", cloud: fixture.cloud)
        _ = try await seeder.publish(scope: "test-scope", revision: 1, json: String(decoding: payload, as: UTF8.self), base: "")
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: true, generation: fixture.coordinator.snapshot.generation)
        try await fixture.coordinator.refresh(importGuest: true, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        #expect(try await fixture.store.readLanguageProgress(profileID: profile, language: "english", today: StudyDay("2026-09-27")).xp == 6)
        await fixture.coordinator.stop()
    }
    @Test func enabledConsentSurvivesCoordinatorRestartAndLocalDeleteLeavesCloudUntouched() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        _ = try await earnFixtureProgress(fixture.store, profile: profile, run: "local-only-reset")
        try await fixture.coordinator.refresh(generation: fixture.coordinator.snapshot.generation)
        let before = fixture.cloud.records
        await fixture.coordinator.stop()
        await fixture.coordinator.refreshAccount()
        #expect(await fixture.coordinator.snapshot.enabled)
        #expect(await fixture.coordinator.snapshot.profileID == profile)
        try await fixture.coordinator.removeLocal(generation: fixture.coordinator.snapshot.generation)
        #expect(fixture.cloud.records.keys == before.keys)
        #expect(fixture.cloud.records[ProgressTransport.sharedHead]?.current == before[ProgressTransport.sharedHead]?.current)
        #expect(try await fixture.store.readLanguageProgress(profileID: profile, language: "english", today: StudyDay("2026-09-27")).xp == 0)
        #expect(await fixture.coordinator.snapshot.enabled == false)
        await fixture.coordinator.stop()
    }
    @Test func remoteResetIsAdoptedWithoutResurrectingLocalHistory() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        _ = try await earnFixtureProgress(fixture.store, profile: profile, run: "old-learning")
        try await fixture.coordinator.refresh(generation: fixture.coordinator.snapshot.generation)
        let other = try ProgressTransport(directory: root.appendingPathComponent("other"), scope: "test-scope", cloud: fixture.cloud)
        let request = UUID()
        let progress = try JSONSerialization.jsonObject(with: LearningBackupCodec.encode(.empty))
        let empty = try JSONSerialization.data(withJSONObject: ["version": 5, "generation": request.uuidString.lowercased(), "progress": progress])
        _ = try await other.reset(scope: "test-scope", requestId: request.uuidString.lowercased(), expectedGeneration: "", json: String(decoding: empty, as: UTF8.self))
        try await fixture.coordinator.refresh(generation: fixture.coordinator.snapshot.generation)
        #expect(try await fixture.store.readLanguageProgress(profileID: profile, language: "english", today: StudyDay("2026-09-27")).xp == 0)
        #expect(try await fixture.store.exportBackup(profileID: profile).resetGeneration == request.uuidString.lowercased())
        #expect(await fixture.coordinator.snapshot.enabled)
        await fixture.coordinator.stop()
    }
    @Test func cloudResetPublishesBoundaryAndClearsOnlyActiveProfile() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        _ = try await earnFixtureProgress(fixture.store, profile: profile, run: "before-reset")
        let guest = try await earnFixtureProgress(fixture.store, profile: "local", run: "guest")
        try await fixture.coordinator.refresh(generation: fixture.coordinator.snapshot.generation)
        try await fixture.coordinator.deleteCloud(generation: fixture.coordinator.snapshot.generation)
        let snapshot = await fixture.coordinator.snapshot
        #expect(!snapshot.enabled)
        #expect(try await fixture.store.readLanguageProgress(profileID: profile, language: "english", today: StudyDay("2026-09-27")).xp == 0)
        #expect(try await fixture.store.exportBackup(profileID: "local").payload == guest)
        #expect(fixture.cloud.records[ProgressTransport.sharedHead]?.resetGeneration != nil)
        await fixture.coordinator.stop()
    }
    @Test func oldAccountRefreshCannotRevokeNewProfilesWriter() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let gate = TestGate()
        defer { gate.open() }
        var entered = false
        fixture.cloud.onStop = { entered = true; await gate.wait() }
        let old = Task { await fixture.coordinator.refreshAccount() }
        while !entered { await Task.yield() }
        fixture.cloud.onStop = nil
        fixture.cloud.account = "new-scope"
        fixture.cloud.records = [:]; fixture.cloud.assets = [:]
        await fixture.coordinator.refreshAccount()
        try await fixture.coordinator.enable(importGuest: false, generation: fixture.coordinator.snapshot.generation)
        let profile = await fixture.coordinator.snapshot.profileID
        let plan = try LearningPlan.make(scope: .init(profileID: profile, packageKey: "fixture-v1", language: "english", book: "fixture", stage: 11), runID: "new-account",
            sources: [.init(index: 0, text: "Hello", translation: "안녕")], groupSize: 2)
        var writer = try await fixture.store.open(plan: plan, preferences: .fresh, writerID: UUID())
        for event in [LearningEvent.resume, .playbackEnded] {
            writer = try await fixture.store.apply(.init(handle: writer.handle, id: UUID(), expectedVersion: writer.writerVersion, event: event)).snapshot
        }
        gate.open()
        await old.value
        let receipt = try await fixture.store.apply(.init(handle: writer.handle, id: UUID(), expectedVersion: writer.writerVersion, event: .confirm))
        #expect(receipt.earnedXP == 3)
        try await fixture.coordinator.deleteCloud(generation: fixture.coordinator.snapshot.generation)
        await fixture.coordinator.stop()
    }
    @Test func explicitEnableRestoresCloudBeforeAnyLocalPublication() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = try makeSyncFixture(root)
        let remote = SQLiteLearningStore(root: root.appendingPathComponent("remote"))
        let payload = try await earnFixtureProgress(remote, profile: "remote", run: "remote-run")
        let seeder = try ProgressTransport(directory: root.appendingPathComponent("seed"), scope: "test-scope", cloud: fixture.cloud)
        _ = try await seeder.publish(scope: "test-scope", revision: 1, json: String(decoding: payload, as: UTF8.self), base: "")
        await fixture.coordinator.refreshAccount()
        let generation = await fixture.coordinator.snapshot.generation
        try await fixture.coordinator.enable(importGuest: false, generation: generation)
        let state = await fixture.coordinator.snapshot
        #expect(state.enabled)
        #expect(try await fixture.store.readLanguageProgress(profileID: state.profileID, language: "english", today: StudyDay("2026-09-27")).xp == 3)
        let current = try #require(fixture.cloud.records[ProgressTransport.sharedHead]?.current)
        let backup = try LearningBackupCodec.decode(#require(fixture.cloud.assets[current.id]))
        #expect(try backup.rewardLedger(profileID: "check").totalXP(language: "english") == 3)
        await fixture.coordinator.stop()
    }
    @Test func freshStoreDoesNotPublishWithoutExplicitConsent() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let cloud = TestCloud()
        let owner = ProgressCloudOwner(cacheDirectory: { root.appendingPathComponent("cache-\($0)") }, activationAccess: {
            .init(identity: { "test-scope" }, makeTransport: {
                try ProgressTransport(directory: root.appendingPathComponent("cache-\($0)"), scope: $0, cloud: cloud)
            })
        })
        let transport = NativeCloudTransport(owner: owner, account: { .available("test-scope") })
        let store = SQLiteLearningStore(root: root.appendingPathComponent("learning"))
        let coordinator = SyncCoordinator(store: store, transport: transport)
        await coordinator.refreshAccount()
        let state = await coordinator.snapshot
        #expect(state.account == .available("test-scope"))
        #expect(!state.enabled)
        #expect(cloud.records.isEmpty)
        await coordinator.stop()
    }
}

@CloudActor private func makeSyncFixture(_ root: URL, cloud sharedCloud: TestCloud? = nil) throws -> (cloud: TestCloud, store: SQLiteLearningStore, coordinator: SyncCoordinator) {
    let cloud = sharedCloud ?? TestCloud()
    let owner = ProgressCloudOwner(cacheDirectory: { root.appendingPathComponent("cache-\($0)") }, activationAccess: {
        .init(identity: { cloud.account }, makeTransport: {
            try ProgressTransport(directory: root.appendingPathComponent("cache-\($0)"), scope: $0, cloud: cloud)
        })
    })
    let transport = NativeCloudTransport(owner: owner, account: { .available(cloud.account) })
    let store = SQLiteLearningStore(root: root.appendingPathComponent("learning"))
    return (cloud, store, SyncCoordinator(store: store, transport: transport))
}

private func earnFixtureProgress(_ store: SQLiteLearningStore, profile: String, run: String) async throws -> Data {
    let plan = try LearningPlan.make(scope: .init(profileID: profile, packageKey: "fixture-v1", language: "english", book: "fixture", stage: 11), runID: run,
        sources: [.init(index: 0, text: "Hello", translation: "안녕")], groupSize: 2)
    var state = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
    for event in [LearningEvent.resume, .playbackEnded, .confirm] {
        state = try await store.apply(.init(handle: state.handle, id: UUID(), expectedVersion: state.writerVersion, event: event)).snapshot
    }
    await store.revoke(profileID: profile)
    return try await store.exportBackup(profileID: profile).payload
}
