import CryptoKit
import Foundation
import LearningDomain

extension SQLiteLearningStore: ServiceProfileStore {
    public func selectedServiceScope() throws -> String? {
        try readServiceState(connection("local")).selectedScope
    }
    public func selectServiceScope(_ scope: String?) throws {
        if let scope {
            guard !scope.isEmpty, scope.utf8.count <= 256,
                  !scope.unicodeScalars.contains(where: { $0.value < 32 }) else { throw LearningStoreError.invalidProfile }
        }
        let db = try connection("local")
        try db.transaction {
            var state = try readServiceState(db)
            state.selectedScope = scope
            try writeServiceState(state, db: db)
        }
    }
    public func backupChanges(profileID: String) throws -> AsyncStream<Int64> {
        let revision = try revision(connection(profileID))
        let id = UUID()
        let (stream, continuation) = AsyncStream<Int64>.makeStream(bufferingPolicy: .bufferingNewest(1))
        revisionListeners[profileID, default: [:]][id] = continuation
        continuation.yield(revision)
        continuation.onTermination = { [weak self] _ in Task { await self?.removeRevisionListener(id, profileID: profileID) } }
        return stream
    }
    func publishRevision(_ revision: Int64, profileID: String) {
        for listener in revisionListeners[profileID]?.values ?? [:].values { listener.yield(revision) }
    }
    private func removeRevisionListener(_ id: UUID, profileID: String) { revisionListeners[profileID]?[id] = nil }
    public func exportServiceBackup(_ lease: ServiceProfileLease) throws -> BackupSnapshot {
        let db = try connection(lease.profileID)
        return try db.transaction {
            _ = try validateService(lease, db: db)
            return try backupReceipt(db, backup: snapshotBackup(db))
        }
    }
    public func acknowledgeService(_ lease: ServiceProfileLease, revision: Int64, baseToken: String) throws {
        let db = try connection(lease.profileID)
        try db.transaction {
            var state = try validateService(lease, db: db)
            guard revision >= 0, revision <= (try self.revision(db)), baseToken.utf8.count <= 65_536 else { throw LearningStoreError.revisionExhausted }
            try db.execute("UPDATE metadata SET acknowledged=MAX(acknowledged,?) WHERE id=1", [.integer(revision)])
            state.baseToken = baseToken
            try writeServiceState(state, db: db)
            if failBeforeCommit.contains(lease.profileID) { throw LearningStoreError.injectedFailure }
        }
    }
    public func activateService(scope: String?) throws -> ServiceProfileLease {
        if let scope {
            guard !scope.isEmpty, scope.utf8.count <= 256,
                  !scope.unicodeScalars.contains(where: { $0.value < 32 }) else { throw LearningStoreError.invalidProfile }
        }
        let profileID = scope.map { "cloud-" + SHA256.hash(data: Data($0.utf8)).map { String(format: "%02x", $0) }.joined() } ?? "local"
        let db = try connection(profileID)
        return try db.transaction {
            var state = try readServiceState(db)
            guard state.scope == nil || state.scope == scope else { throw LearningStoreError.invalidProfile }
            state.scope = scope
            state.learningGeneration = state.writerGeneration
            state.generation = UUID()
            try writeServiceState(state, db: db)
            return ServiceProfileLease(profileID: profileID, scope: scope, generation: state.generation)
        }
    }
    public func invalidateService(_ lease: ServiceProfileLease) throws {
        let db = try connection(lease.profileID)
        try db.transaction {
            var state = try validateService(lease, db: db)
            state.learningGeneration = state.writerGeneration
            state.generation = UUID()
            try writeServiceState(state, db: db)
        }
    }
    public func serviceState(_ lease: ServiceProfileLease) throws -> ServiceProfileState {
        try validateService(lease, db: connection(lease.profileID))
    }
    public func setServiceConsent(_ enabled: Bool, lease: ServiceProfileLease) throws {
        let db = try connection(lease.profileID)
        try db.transaction {
            var state = try validateService(lease, db: db)
            guard !enabled || lease.scope != nil else { throw LearningStoreError.invalidProfile }
            guard !enabled || state.resetIntent == nil else { throw LearningStoreError.staleWriter }
            state.enabled = enabled
            state.activated = true
            try writeServiceState(state, db: db)
        }
    }
    public func setGuestImportPending(_ pending: Bool, lease: ServiceProfileLease) throws {
        let db = try connection(lease.profileID)
        try db.transaction {
            var state = try validateService(lease, db: db)
            guard lease.scope != nil, state.resetIntent == nil else { throw LearningStoreError.staleWriter }
            state.guestImportPending = pending
            try writeServiceState(state, db: db)
        }
    }
    func readServiceState(_ db: SQLiteConnection) throws -> ServiceProfileState {
        try decode(ServiceProfileState.self, db.query("SELECT state FROM service_state WHERE id=1").first?["state"])
    }
    func writeServiceState(_ state: ServiceProfileState, db: SQLiteConnection) throws {
        try db.execute("UPDATE service_state SET state=? WHERE id=1", [.blob(try encode(state))])
    }
    func validateService(_ lease: ServiceProfileLease, db: SQLiteConnection) throws -> ServiceProfileState {
        let state = try readServiceState(db)
        guard state.generation == lease.generation, state.scope == lease.scope else { throw LearningStoreError.staleWriter }
        return state
    }
}
