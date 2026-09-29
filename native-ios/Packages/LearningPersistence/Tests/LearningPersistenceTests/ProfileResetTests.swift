import Foundation
import CryptoKit
import LearningDomain
import Testing
@testable import LearningPersistence

struct ProfileResetTests {
    @Test func pendingResetPreventsNewPracticeUntilBoundaryIsSettled() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root), lease = try await target.activateService(scope: nil)
        _ = try await target.beginHistoryReset(.local, requestID: UUID(), lease: lease)
        await #expect(throws: LearningStoreError.staleWriter) {
            try await target.open(plan: plan(profile: lease.profileID), preferences: .fresh, writerID: UUID())
        }
        await #expect(throws: LearningStoreError.staleWriter) {
            try await target.savePreferences(.init(libraryLanguage: "french"), profileID: lease.profileID)
        }
    }
    @Test func networkOwnerReplacementDoesNotInvalidateLocalPractice() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root), lease = try await target.activateService(scope: nil)
        let first = try await target.open(plan: plan(profile: lease.profileID), preferences: .fresh, writerID: UUID())
        let ended = try await speaking(target, first)
        try await target.invalidateService(lease)
        _ = try await target.activateService(scope: nil)
        let receipt = try await target.apply(command(ended, .confirm))
        #expect(receipt.earnedXP == 3)
    }
    @Test func versionOneUpgradePreservesExistingLearningAndStartsWithSyncDisabled() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let original = store(root)
        let initial = try await original.open(plan: plan(profile: "local"), preferences: .fresh, writerID: UUID())
        _ = try await original.apply(command(speaking(original, initial), .confirm))
        let before = try await original.exportBackup(profileID: "local")
        let digest = SHA256.hash(data: Data("local".utf8)).map { String(format: "%02x", $0) }.joined()
        let db = try SQLiteConnection(path: root.appendingPathComponent(digest).appendingPathComponent("learning.sqlite").path)
        try db.script("DROP TABLE service_state; PRAGMA user_version=1;")
        try db.close()
        let upgraded = store(root)
        let lease = try await upgraded.activateService(scope: nil)
        #expect(try await upgraded.exportServiceBackup(lease) == before)
        #expect(try await upgraded.serviceState(lease).enabled == false)
    }
    @Test func failedResetRollsBackHistoryAndRetainsRetryIntent() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root), lease = try await target.activateService(scope: nil)
        let initial = try await target.open(plan: plan(profile: lease.profileID), preferences: .fresh, writerID: UUID())
        _ = try await target.apply(command(speaking(target, initial), .confirm))
        await target.revoke(profileID: lease.profileID)
        let request = UUID()
        _ = try await target.beginHistoryReset(.local, requestID: request, lease: lease)
        let before = try await target.exportBackup(profileID: lease.profileID)
        try await target.installFault(profileID: lease.profileID, boundary: "beforeCommit")
        await #expect(throws: LearningStoreError.injectedFailure) { try await target.removeLocalHistory(requestID: request, lease: lease) }
        #expect(try await target.exportBackup(profileID: lease.profileID) == before)
        #expect(try await target.serviceState(lease).resetIntent?.requestID == request)
        try await target.clearFault(profileID: lease.profileID, boundary: "beforeCommit")
        _ = try await target.removeLocalHistory(requestID: request, lease: lease)
        #expect(try await target.serviceState(lease).resetIntent == nil)
    }
    @Test func resetRejectsAWriterRetainedByAnotherStoreConnection() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let current = store(root), staleStore = store(root)
        let lease = try await current.activateService(scope: nil)
        let writer = try await staleStore.open(plan: plan(profile: lease.profileID), preferences: .fresh, writerID: UUID())
        let ended = try await speaking(staleStore, writer)
        let request = UUID()
        _ = try await current.beginHistoryReset(.local, requestID: request, lease: lease)
        _ = try await current.removeLocalHistory(requestID: request, lease: lease)
        await #expect(throws: LearningStoreError.staleWriter) { try await staleStore.apply(command(ended, .confirm)) }
        #expect(try await current.readProgress(scope: plan(profile: lease.profileID).scope, today: StudyDay("2026-09-27")).xp == 0)
    }
    @Test func localResetIsScopedDurableAndDoesNotRequireCloudAuthority() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root), lease = try await target.activateService(scope: nil)
        let initial = try await target.open(plan: plan(profile: lease.profileID), preferences: .fresh, writerID: UUID())
        let ended = try await speaking(target, initial)
        _ = try await target.apply(command(ended, .confirm))
        _ = try await target.savePreferences(.init(libraryLanguage: "french"), profileID: "unrelated")
        let other = try await target.exportBackup(profileID: "unrelated")
        await target.revoke(profileID: lease.profileID)
        let request = UUID()
        _ = try await target.beginHistoryReset(.local, requestID: request, lease: lease)
        let reopened = store(root), active = try await reopened.activateService(scope: nil)
        #expect(try await reopened.serviceState(active).resetIntent?.requestID == request)
        let reset = try await reopened.removeLocalHistory(requestID: request, lease: active)
        #expect(try !LearningBackupCodec.decode(reset.payload).hasLearningData)
        #expect(try await reopened.serviceState(active).enabled == false)
        #expect(try await reopened.exportBackup(profileID: "unrelated") == other)
    }

    @Test func cloudResetRequiresAcceptedIntentAndRetryPreservesNewLearning() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root), lease = try await target.activateService(scope: "account-a")
        let request = UUID()
        let payload = try resetEnvelope(request.uuidString.lowercased())
        await #expect(throws: LearningStoreError.staleWriter) { try await target.adoptReset(payload, lease: lease, expectedGeneration: nil) }
        _ = try await target.beginHistoryReset(.cloud, requestID: request, lease: lease)
        try await target.acceptResetAuthority(requestID: request, generation: request.uuidString.lowercased(), lease: lease)
        _ = try await target.adoptReset(payload, lease: lease, expectedGeneration: nil)
        let remote = store(root.appendingPathComponent("remote"))
        _ = try await remote.restoreIntoEmptyProfile(payload, profileID: "remote")
        let first = try await remote.open(plan: plan(profile: "remote"), preferences: .fresh, writerID: UUID())
        _ = try await remote.apply(command(speaking(remote, first), .confirm))
        _ = try await target.adoptReset(remote.exportBackup(profileID: "remote").payload, lease: lease, expectedGeneration: nil)
        _ = try await target.adoptReset(payload, lease: lease, expectedGeneration: nil)
        #expect(try await target.readProgress(scope: plan(profile: lease.profileID).scope, today: StudyDay("2026-09-27")).xp == 3)
        await #expect(throws: LearningError.self) { try await target.mergeBackup(LearningBackupCodec.encode(.empty), profileID: lease.profileID) }
    }
    @Test func consentAndProfileIdentityPersistButOldOperationsAreRevoked() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let first = store(root)
        let a = try await first.activateService(scope: "account-a")
        #expect(try await first.serviceState(a).enabled == false)
        try await first.setServiceConsent(true, lease: a)
        let reopened = store(root)
        let replacement = try await reopened.activateService(scope: "account-a")
        #expect(replacement.profileID == a.profileID)
        #expect(try await reopened.serviceState(replacement).enabled)
        await #expect(throws: LearningStoreError.staleWriter) { try await first.setServiceConsent(false, lease: a) }
        let b = try await reopened.activateService(scope: "account-b")
        #expect(b.profileID != a.profileID)
        #expect(try await reopened.serviceState(b).enabled == false)
        #expect(try await reopened.activateService(scope: nil).profileID == "local")
    }
}

private func resetEnvelope(_ generation: String) throws -> Data {
    let progress = try JSONSerialization.jsonObject(with: LearningBackupCodec.encode(.empty))
    return try JSONSerialization.data(withJSONObject: ["version": 5, "generation": generation, "progress": progress])
}
