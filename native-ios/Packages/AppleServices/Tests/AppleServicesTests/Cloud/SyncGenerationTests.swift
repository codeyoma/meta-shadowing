import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import AppleServices

struct SyncGenerationTests {
    @Test func staleRememberedStateCannotEnableTheNewAccount() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SuspendedServiceStore(root: root)
        let old = try await store.activateService(scope: "old")
        try await store.setServiceConsent(true, lease: old)
        try await store.selectServiceScope("old")
        await store.pauseState(scope: "old")
        let cloud = GenerationCloud()
        let coordinator = SyncCoordinator(store: store, transport: cloud)
        let pending = Task { await coordinator.refreshAccount() }
        for _ in 0..<500 {
            if await store.waiting { break }
            try await Task.sleep(for: .milliseconds(2))
        }
        #expect(await store.waiting)
        await cloud.select(.available("new"))
        await coordinator.refreshAccount()
        await store.release()
        await pending.value
        #expect(await coordinator.snapshot.account == .available("new"))
        #expect(await coordinator.snapshot.enabled == false)
        await coordinator.stop()
    }
    @Test func staleGuestActivationCannotReplaceTheNewAccountLease() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SuspendedServiceStore(root: root)
        let cloud = GenerationCloud()
        let coordinator = SyncCoordinator(store: store, transport: cloud)
        await coordinator.refreshAccount()
        await store.pauseActivation()
        let generation = await coordinator.snapshot.generation
        let pending = Task { try? await coordinator.removeLocal(generation: generation) }
        for _ in 0..<500 {
            if await store.waiting { break }
            try await Task.sleep(for: .milliseconds(2))
        }
        #expect(await store.waiting)
        await cloud.select(.available("new"))
        await coordinator.refreshAccount()
        let expected = await coordinator.lease
        await store.release()
        await pending.value
        #expect(await coordinator.lease == expected)
        await coordinator.stop()
    }
}

/// Suspend only the storage boundary under test; all actual state uses SQLite.
private actor SuspendedServiceStore: ServiceProfileStore {
    let base: SQLiteLearningStore
    var pausedScope: String?
    var pauseNextActivation = false
    var continuation: CheckedContinuation<Void, Never>?
    var waiting: Bool { continuation != nil }
    init(root: URL) { base = SQLiteLearningStore(root: root) }
    func pauseState(scope: String) { pausedScope = scope }
    func pauseActivation() { pauseNextActivation = true }
    func release() { continuation?.resume(); continuation = nil }
    func activateService(scope: String?) async throws -> ServiceProfileLease {
        let value = try await base.activateService(scope: scope)
        if pauseNextActivation { pauseNextActivation = false; await withCheckedContinuation { continuation = $0 } }
        return value
    }
    func serviceState(_ lease: ServiceProfileLease) async throws -> ServiceProfileState {
        let value = try await base.serviceState(lease)
        if pausedScope == lease.scope, pausedScope != nil {
            pausedScope = nil
            await withCheckedContinuation { continuation = $0 }
        }
        return value
    }
    func invalidateService(_ lease: ServiceProfileLease) async throws { try await base.invalidateService(lease) }
    func setServiceConsent(_ enabled: Bool, lease: ServiceProfileLease) async throws { try await base.setServiceConsent(enabled, lease: lease) }
    func setGuestImportPending(_ pending: Bool, lease: ServiceProfileLease) async throws { try await base.setGuestImportPending(pending, lease: lease) }
    func selectedServiceScope() async throws -> String? { try await base.selectedServiceScope() }
    func selectServiceScope(_ scope: String?) async throws { try await base.selectServiceScope(scope) }
    func backupChanges(profileID: String) async throws -> AsyncStream<Int64> { try await base.backupChanges(profileID: profileID) }
    func exportServiceBackup(_ lease: ServiceProfileLease) async throws -> BackupSnapshot { try await base.exportServiceBackup(lease) }
    func mergeBackups(_ payloads: [Data], lease: ServiceProfileLease) async throws -> BackupSnapshot { try await base.mergeBackups(payloads, lease: lease) }
    func acknowledgeService(_ lease: ServiceProfileLease, revision: Int64, baseToken: String) async throws { try await base.acknowledgeService(lease, revision: revision, baseToken: baseToken) }
    func beginHistoryReset(_ kind: HistoryResetKind, requestID: UUID, lease: ServiceProfileLease) async throws -> HistoryResetIntent { try await base.beginHistoryReset(kind, requestID: requestID, lease: lease) }
    func acceptResetAuthority(requestID: UUID, generation: String, lease: ServiceProfileLease) async throws { try await base.acceptResetAuthority(requestID: requestID, generation: generation, lease: lease) }
    func adoptReset(_ payload: Data, lease: ServiceProfileLease, expectedGeneration: String?) async throws -> BackupSnapshot { try await base.adoptReset(payload, lease: lease, expectedGeneration: expectedGeneration) }
    func removeLocalHistory(requestID: UUID, lease: ServiceProfileLease) async throws -> BackupSnapshot { try await base.removeLocalHistory(requestID: requestID, lease: lease) }
    func finishHistoryReset(requestID: UUID, lease: ServiceProfileLease) async throws { try await base.finishHistoryReset(requestID: requestID, lease: lease) }
    func readLanguageProgress(profileID: String, language: String, today: StudyDay) async throws -> LanguageStudyProgress { try await base.readLanguageProgress(profileID: profileID, language: language, today: today) }
    func readCheckpoint(plan: LearningPlan) async throws -> LearningSession? { try await base.readCheckpoint(plan: plan) }
    func open(plan: LearningPlan, preferences: LearningPreferences, writerID: UUID) async throws -> LearningSnapshot { try await base.open(plan: plan, preferences: preferences, writerID: writerID) }
    func apply(_ command: LearningCommand) async throws -> CommitReceipt { try await base.apply(command) }
    func readProgress(scope: LearningScope, today: StudyDay) async throws -> LearningProgress { try await base.readProgress(scope: scope, today: today) }
    func preferences(profileID: String) async throws -> ProfilePreferences { try await base.preferences(profileID: profileID) }
    func savePreferences(_ value: ProfilePreferences, profileID: String) async throws -> Int64 { try await base.savePreferences(value, profileID: profileID) }
    func revoke(profileID: String) async { await base.revoke(profileID: profileID) }
    func revoke(writerID: UUID) async { await base.revoke(writerID: writerID) }
    func exportBackup(profileID: String) async throws -> BackupSnapshot { try await base.exportBackup(profileID: profileID) }
    func mergeBackup(_ data: Data, profileID: String) async throws -> BackupSnapshot { try await base.mergeBackup(data, profileID: profileID) }
    func restoreIntoEmptyProfile(_ data: Data, profileID: String) async throws -> BackupSnapshot { try await base.restoreIntoEmptyProfile(data, profileID: profileID) }
    func acknowledgeBackup(profileID: String, revision: Int64) async throws { try await base.acknowledgeBackup(profileID: profileID, revision: revision) }
}

private actor GenerationCloud: CloudTransport {
    var selected = CloudAccount.unknown
    func select(_ value: CloudAccount) { selected = value }
    func account() -> CloudAccount { selected }
    func accountChanges() -> AsyncStream<Void> { AsyncStream { $0.finish() } }
    func list(scope: String) throws -> [CloudBackup] { throw ProgressCloudError.offline }
    func read(scope: String, id: String) throws -> Data { throw ProgressCloudError.unavailable }
    func publish(scope: String, revision: Int64, payload: Data, base: String) throws -> CloudPublication { throw ProgressCloudError.unavailable }
    func reset(scope: String, requestID: UUID, expectedGeneration: String?, payload: Data) throws -> CloudPublication { throw ProgressCloudError.unavailable }
    func cleanupAdopted(scope: String, base: String, abandoned: String?) throws -> Bool { throw ProgressCloudError.unavailable }
    func discardLocal(scope: String) { }
    func stop() { }
}
