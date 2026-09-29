import Foundation
import LearningDomain

extension SQLiteLearningStore {
    func importedBackup(_ db: SQLiteConnection) throws -> LearningBackup {
        guard let data = try db.query("SELECT state FROM backup_imports WHERE id=1").first?["state"]?.data else { return .empty }
        return try LearningBackupCodec.decode(data)
    }
    func progress(_ ledger: RewardLedger, db: SQLiteConnection, scope: LearningScope, today: StudyDay) throws -> LearningProgress {
        let ordinary = try ledger.progress(scope: scope, today: today)
        var history = try importedBackup(db)
        try history.setLedger(ledger)
        var latest: LearningSelection?
        for row in try db.query("SELECT package,stage,run,clock FROM checkpoints WHERE clock<>'' ORDER BY clock DESC,package ASC,stage DESC") {
            if let run = ledger.runs.first(where: {
                $0.scope.packageKey == row["package"]?.text && Int64($0.scope.stage) == row["stage"]?.integer && $0.runID == row["run"]?.text
            }) {
                latest = try LearningSelection(scope: run.scope, stamp: row["clock"]?.text ?? "")
                break
            }
        }
        return try LearningProgress(xp: ordinary.xp, streak: ordinary.streak, completedRuns: history.completionCounts(scope: scope), latestLearning: latest)
    }
    func snapshotBackup(_ db: SQLiteConnection) throws -> LearningBackup {
        var backup = try importedBackup(db)
        try backup.setLedger(readLedger(db))
        for row in try db.query("SELECT state,clock FROM checkpoints") where row["state"]?.data != nil {
            let state = try decode(LearningSession.self, row["state"])
            try backup.setCheckpoint(state, stamp: row["clock"]?.text ?? "")
        }
        let preference = try db.query("SELECT state,clock,selection_clock FROM preferences WHERE id=1").first
        try backup.setPreferences(decode(ProfilePreferences.self, preference?["state"]), stamp: preference?["clock"]?.text ?? "", selectionStamp: preference?["selection_clock"]?.text ?? "")
        return backup
    }
    func backupReceipt(_ db: SQLiteConnection, backup: LearningBackup) throws -> BackupSnapshot {
        guard let row = try db.query("SELECT revision,acknowledged FROM metadata WHERE id=1").first,
              let revision = row["revision"]?.integer, let acknowledged = row["acknowledged"]?.integer else { throw LearningStoreError.corrupt }
        return BackupSnapshot(payload: try LearningBackupCodec.encode(backup), revision: revision, acknowledgedRevision: acknowledged, resetGeneration: backup.resetGeneration)
    }
    public func exportBackup(profileID: String) throws -> BackupSnapshot {
        let db = try connection(profileID)
        return try db.transaction { try backupReceipt(db, backup: snapshotBackup(db)) }
    }
    public func mergeBackup(_ data: Data, profileID: String) throws -> BackupSnapshot {
        try mergeBackups([data], profileID: profileID)
    }
    public func mergeBackups(_ payloads: [Data], profileID: String) throws -> BackupSnapshot {
        try mergeBackups(payloads, profileID: profileID, lease: nil)
    }
    public func mergeBackups(_ payloads: [Data], lease: ServiceProfileLease) throws -> BackupSnapshot {
        try mergeBackups(payloads, profileID: lease.profileID, lease: lease)
    }
    private func mergeBackups(_ payloads: [Data], profileID: String, lease: ServiceProfileLease?) throws -> BackupSnapshot {
        guard payloads.count <= 256,
              payloads.reduce(0, { $0 + min($1.count, 67_108_865) }) <= 67_108_864 else { throw LearningError.invalidState }
        let incoming = try payloads.map(LearningBackupCodec.decode)
        let db = try connection(profileID)
        return try db.transaction {
            if let lease {
                guard try validateService(lease, db: db).resetIntent == nil else { throw LearningStoreError.staleWriter }
            }
            let current = try snapshotBackup(db)
            let merged = try incoming.reduce(current) { try $0.merged(with: $1) }
            if current == merged { return try backupReceipt(db, backup: current) }
            try installBackup(merged, db: db, profileID: profileID)
            _ = try incrementRevision(db)
            if failBeforeCommit.contains(profileID) { throw LearningStoreError.injectedFailure }
            return try backupReceipt(db, backup: merged)
        }
    }
    public func restoreIntoEmptyProfile(_ data: Data, profileID: String) throws -> BackupSnapshot {
        let incoming = try LearningBackupCodec.decode(data)
        let db = try connection(profileID)
        return try db.transaction {
            let current = try snapshotBackup(db)
            guard !current.hasLearningData, try revision(db) == 0, !leases.values.contains(where: { $0.handle.scope.profileID == profileID }) else { throw LearningStoreError.staleWriter }
            try installBackup(incoming, db: db, profileID: profileID)
            _ = try incrementRevision(db)
            if failBeforeCommit.contains(profileID) { throw LearningStoreError.injectedFailure }
            return try backupReceipt(db, backup: snapshotBackup(db))
        }
    }
    public func acknowledgeBackup(profileID: String, revision: Int64) throws {
        let db = try connection(profileID)
        try db.transaction {
            guard revision >= 0, revision <= (try self.revision(db)) else { throw LearningStoreError.revisionExhausted }
            try db.execute("UPDATE metadata SET acknowledged=MAX(acknowledged,?) WHERE id=1", [.integer(revision)])
        }
    }
    func installBackup(_ backup: LearningBackup, db: SQLiteConnection, profileID: String) throws {
        let payload = try LearningBackupCodec.encode(backup), ledger = try backup.rewardLedger(profileID: profileID)
        try writeLedger(ledger, db: db)
        try db.execute("INSERT INTO backup_imports VALUES(1,?) ON CONFLICT(id) DO UPDATE SET state=excluded.state", [.blob(payload)])
        for record in try backup.checkpointRecords() {
            try db.execute("INSERT INTO checkpoints(package,stage,run,state,clock,wire) VALUES(?,?,?,NULL,?,?) ON CONFLICT(package,stage) DO UPDATE SET run=excluded.run,state=NULL,clock=excluded.clock,wire=excluded.wire",
                [.text(record.package), .integer(Int64(record.stage)), .text(record.runID), .text(record.stamp), .text(record.state)])
        }
        try db.execute("UPDATE preferences SET state=?,clock=?,selection_clock=? WHERE id=1",
            [.blob(try encode(backup.profilePreferences())), .text(try backup.preferenceStamp("settings")), .text(try backup.preferenceStamp("selection"))])
        try db.execute("UPDATE metadata SET clock=MAX(clock,?),generation=? WHERE id=1", [.text(backup.latestClock), backup.resetGeneration.map(SQLValue.text) ?? .null])
    }
}
