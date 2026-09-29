import Foundation
import LearningDomain

extension SQLiteLearningStore {
    public func beginHistoryReset(_ kind: HistoryResetKind, requestID: UUID, lease: ServiceProfileLease) throws -> HistoryResetIntent {
        let db = try connection(lease.profileID)
        return try db.transaction {
            var state = try validateService(lease, db: db)
            guard kind == .local || lease.scope != nil else { throw LearningStoreError.invalidProfile }
            guard !leases.values.contains(where: { $0.handle.scope.profileID == lease.profileID }) else { throw LearningStoreError.staleWriter }
            if let intent = state.resetIntent {
                guard intent.requestID == requestID, intent.kind == kind else { throw LearningStoreError.staleWriter }
                return intent
            }
            let intent = HistoryResetIntent(requestID: requestID, kind: kind, expectedGeneration: try snapshotBackup(db).resetGeneration)
            state.resetIntent = intent
            if kind != .remoteBoundary { state.enabled = false; state.guestImportPending = false }
            try writeServiceState(state, db: db)
            try serviceFault(lease)
            return intent
        }
    }
    public func acceptResetAuthority(requestID: UUID, generation: String, lease: ServiceProfileLease) throws {
        let db = try connection(lease.profileID)
        try db.transaction {
            var state = try validateService(lease, db: db)
            guard UUID(uuidString: generation) != nil, generation.count == 36,
                  state.resetIntent?.requestID == requestID, state.resetIntent?.kind != .local,
                  lease.scope != nil else { throw LearningStoreError.staleWriter }
            state.resetIntent?.acceptedGeneration = generation
            try writeServiceState(state, db: db)
            try serviceFault(lease)
        }
    }
    public func adoptReset(_ payload: Data, lease: ServiceProfileLease, expectedGeneration: String?) throws -> BackupSnapshot {
        let incoming = try LearningBackupCodec.decode(payload)
        let db = try connection(lease.profileID)
        return try db.transaction {
            let state = try validateService(lease, db: db)
            guard let intent = state.resetIntent, intent.kind != .local,
                  let accepted = intent.acceptedGeneration, accepted == incoming.resetGeneration,
                  !leases.values.contains(where: { $0.handle.scope.profileID == lease.profileID }) else { throw LearningStoreError.staleWriter }
            let current = try snapshotBackup(db)
            guard current.resetGeneration == expectedGeneration || current.resetGeneration == accepted else { throw LearningStoreError.staleWriter }
            // A lost reply/relaunch must merge, not repeat a destructive replacement.
            let next: LearningBackup
            if current.resetGeneration == accepted { next = try current.merged(with: incoming) }
            else { try clearLearningRows(db); next = incoming }
            if next != current {
                try installBackup(next, db: db, profileID: lease.profileID)
                _ = try incrementRevision(db)
            }
            try serviceFault(lease)
            return try backupReceipt(db, backup: snapshotBackup(db))
        }
    }
    public func removeLocalHistory(requestID: UUID, lease: ServiceProfileLease) throws -> BackupSnapshot {
        let db = try connection(lease.profileID)
        return try db.transaction {
            var state = try validateService(lease, db: db)
            guard state.resetIntent?.requestID == requestID, state.resetIntent?.kind == .local,
                  !leases.values.contains(where: { $0.handle.scope.profileID == lease.profileID }) else { throw LearningStoreError.staleWriter }
            let generation = try snapshotBackup(db).resetGeneration
            try clearLearningRows(db)
            var empty = try LearningBackupCodec.encode(.empty)
            if let generation {
                empty = try JSONSerialization.data(withJSONObject: ["version": 5, "generation": generation,
                    "progress": JSONSerialization.jsonObject(with: empty)])
            }
            try installBackup(LearningBackupCodec.decode(empty), db: db, profileID: lease.profileID)
            _ = try incrementRevision(db)
            state.enabled = false; state.baseToken = ""; state.resetIntent = nil
            state.learningGeneration = try readServiceState(db).writerGeneration
            try writeServiceState(state, db: db)
            try serviceFault(lease)
            return try backupReceipt(db, backup: snapshotBackup(db))
        }
    }
    public func finishHistoryReset(requestID: UUID, lease: ServiceProfileLease) throws {
        let db = try connection(lease.profileID)
        try db.transaction {
            var state = try validateService(lease, db: db)
            guard let intent = state.resetIntent, intent.requestID == requestID, intent.kind != .local,
                  let accepted = intent.acceptedGeneration, try snapshotBackup(db).resetGeneration == accepted else { throw LearningStoreError.staleWriter }
            state.resetIntent = nil
            try writeServiceState(state, db: db)
            try serviceFault(lease)
        }
    }
    private func clearLearningRows(_ db: SQLiteConnection) throws {
        var state = try readServiceState(db)
        state.learningGeneration = UUID()
        try writeServiceState(state, db: db)
        for table in ["checkpoints", "reward_runs", "completions", "study_days", "historical_awards", "backup_imports", "commands"] {
            try db.execute("DELETE FROM \(table)")
        }
        try db.execute("UPDATE preferences SET state=?,clock='',selection_clock='' WHERE id=1", [.blob(try encode(ProfilePreferences()))])
        try db.execute("UPDATE metadata SET clock='',generation=NULL WHERE id=1")
    }
    private func serviceFault(_ lease: ServiceProfileLease) throws {
        if failBeforeCommit.contains(lease.profileID) { throw LearningStoreError.injectedFailure }
    }
}
