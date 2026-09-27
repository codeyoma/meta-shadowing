import Foundation
import LearningDomain
import LearningPersistence

/// Injects only storage latency/failure; all durable behavior uses real SQLite.
actor GatedLearningStore: LearningStore {
    let underlying: SQLiteLearningStore
    var entered = false
    private var suspend = false, fail = false
    private var gate: CheckedContinuation<Void, Never>?
    init(root: URL) { underlying = SQLiteLearningStore(root: root) }
    func suspendNext() { suspend = true; entered = false }
    func failNext() { fail = true }
    func release() { gate?.resume(); gate = nil }
    func open(plan: LearningPlan, preferences: LearningPreferences, writerID: UUID) async throws -> LearningSnapshot { try await underlying.open(plan: plan, preferences: preferences, writerID: writerID) }
    func apply(_ command: LearningCommand) async throws -> CommitReceipt {
        if suspend { suspend = false; entered = true; await withCheckedContinuation { gate = $0 } }
        if fail { fail = false; throw LearningStoreError.injectedFailure }
        return try await underlying.apply(command)
    }
    func readProgress(scope: LearningScope, today: StudyDay) async throws -> LearningProgress { try await underlying.readProgress(scope: scope, today: today) }
    func preferences(profileID: String) async throws -> ProfilePreferences { try await underlying.preferences(profileID: profileID) }
    func savePreferences(_ value: ProfilePreferences, profileID: String) async throws -> Int64 { try await underlying.savePreferences(value, profileID: profileID) }
    func revoke(profileID: String) async { await underlying.revoke(profileID: profileID) }
    func exportBackup(profileID: String) async throws -> BackupSnapshot { try await underlying.exportBackup(profileID: profileID) }
    func mergeBackup(_ data: Data, profileID: String) async throws -> BackupSnapshot { try await underlying.mergeBackup(data, profileID: profileID) }
    func restoreIntoEmptyProfile(_ data: Data, profileID: String) async throws -> BackupSnapshot { try await underlying.restoreIntoEmptyProfile(data, profileID: profileID) }
    func acknowledgeBackup(profileID: String, revision: Int64) async throws { try await underlying.acknowledgeBackup(profileID: profileID, revision: revision) }
}
