import Foundation
import LearningDomain

extension SQLiteLearningStore {
    public func apply(_ command: LearningCommand) throws -> CommitReceipt {
        guard let prior = leases[command.handle.writerID], prior.handle.scope == command.handle.scope else { throw LearningStoreError.staleWriter }
        let db = try connection(command.handle.scope.profileID), payload = try encode(command)
        let receipt = try db.transaction {
            let service = try readServiceState(db)
            guard service.resetIntent == nil, service.writerGeneration == leaseGenerations[command.handle.writerID] else { throw LearningStoreError.staleWriter }
            if let saved = try db.query("SELECT payload,receipt FROM commands WHERE id=?", [.text(command.id.uuidString)]).first {
                guard saved["payload"]?.data == payload else { throw LearningStoreError.commandConflict }
                let result = try decode(CommitReceipt.self, saved["receipt"])
                return CommitReceipt(snapshot: result.snapshot, backupRevision: result.backupRevision, earnedXP: 0,
                    disposition: .duplicate, committedXP: result.committedXP)
            }
            guard prior.handle == command.handle, prior.writerVersion == command.expectedVersion,
                  prior.writerVersion < Int64.max else { throw LearningStoreError.staleWriter }
            let bindings: [SQLValue] = [.text(prior.handle.scope.packageKey), .integer(Int64(prior.handle.scope.stage))]
            let occupant = try db.query("SELECT run,state FROM checkpoints WHERE package=? AND stage=?", bindings).first
            if let occupant, occupant["run"]?.text == prior.session.plan.runID {
                let saved: LearningSession
                if occupant["state"]?.data != nil { saved = try decode(LearningSession.self, occupant["state"]) }
                else {
                    guard let imported = try importedBackup(db).checkpoint(for: prior.session.plan) else { throw LearningStoreError.corrupt }
                    saved = imported
                }
                // Compare the durable predecessor inside the write transaction. Running is process-local.
                let expected = try prior.session.validatedForRestore(expected: prior.handle.scope, sourceCount: prior.session.plan.sourceCount)
                guard try saved.validatedForRestore(expected: prior.handle.scope, sourceCount: prior.session.plan.sourceCount) == expected else {
                    throw LearningStoreError.staleWriter
                }
            }
            let transition = try LearningReducer.reduce(prior.session, event: command.event)
            if transition.session == prior.session {
                return CommitReceipt(snapshot: prior, backupRevision: try revision(db), earnedXP: 0, disposition: .ignored)
            }
            let today = try day(), ledger = try readLedger(db)
            let nextLedger = try ledger.record(transition: transition, day: today)
            let beforeXP = try ledger.totalXP(language: command.handle.scope.language)
            let state = transition.session
            let handle = LearningHandle(writerID: prior.handle.writerID, scope: prior.handle.scope, planID: state.plan.runID)
            try writeLedger(nextLedger, db: db)
            let earnedPractice = transition.completed || !transition.confirmedSources.isEmpty
            let ownsSlot = occupant == nil || occupant?["run"]?.text == prior.session.plan.runID
            var changed = nextLedger != ledger
            if ownsSlot || earnedPractice {
                // Playback is process-local. A lifecycle pause alone must not promote resume ordering.
                let encoded = try encode(state.validatedForRestore(expected: state.plan.scope, sourceCount: state.plan.sourceCount))
                if occupant?["state"]?.data != encoded {
                    let stamp = try nextStamp(db)
                    try db.execute("INSERT INTO checkpoints(package,stage,run,state,clock) VALUES(?,?,?,?,?) ON CONFLICT(package,stage) DO UPDATE SET run=excluded.run,state=excluded.state,clock=excluded.clock",
                        bindings + [.text(state.plan.runID), .blob(encoded), .text(stamp)])
                    changed = true
                }
            }
            let backupRevision = try changed ? incrementRevision(db) : revision(db)
            let nextProgress = try progress(nextLedger, db: db, scope: command.handle.scope, today: today)
            let next = LearningSnapshot(handle: handle, writerVersion: prior.writerVersion + 1, session: state, progress: nextProgress)
            let result = CommitReceipt(snapshot: next, backupRevision: backupRevision, earnedXP: max(0, nextProgress.xp - beforeXP), disposition: .applied)
            try db.execute("INSERT INTO commands(id,writer,payload,receipt) VALUES(?,?,?,?)",
                [.text(command.id.uuidString), .text(handle.writerID.uuidString), .blob(payload), .blob(try encode(result))])
            if failBeforeCommit.contains(handle.scope.profileID) { throw LearningStoreError.injectedFailure }
            return result
        }
        // COMMIT has succeeded. A delayed duplicate must never replace a newer lease.
        if receipt.disposition == .applied {
            leases[command.handle.writerID] = receipt.snapshot
            publishRevision(receipt.backupRevision, profileID: command.handle.scope.profileID)
        }
        return receipt
    }
    func writeLedger(_ ledger: RewardLedger, db: SQLiteConnection) throws {
        for run in ledger.runs {
            let state = try encode(run), bindings: [SQLValue] = [.text(run.scope.packageKey), .integer(Int64(run.scope.stage)), .text(run.runID)]
            if try db.query("SELECT state FROM reward_runs WHERE package=? AND stage=? AND run=?", bindings).first?["state"]?.data != state {
                try db.execute("INSERT INTO reward_runs VALUES(?,?,?,?,?) ON CONFLICT(package,stage,run) DO UPDATE SET state=excluded.state,credited=excluded.credited",
                    bindings + [.blob(state), .integer(try run.totalXP())])
            }
        }
        for receipt in ledger.completions {
            try db.execute("INSERT INTO completions VALUES(?,?,?,?) ON CONFLICT(package,stage,run) DO UPDATE SET state=excluded.state",
                [.text(receipt.scope.packageKey), .integer(Int64(receipt.scope.stage)), .text(receipt.rootRunID), .blob(try encode(receipt))])
        }
        for day in ledger.studyDays {
            try db.execute("INSERT OR IGNORE INTO study_days VALUES(?,?,?)", [.text(day.language), .text(day.day.rawValue), .blob(try encode(day))])
        }
        for award in ledger.historicalAwards {
            try db.execute("INSERT INTO historical_awards VALUES(?,?,?,?) ON CONFLICT(language,book,run) DO UPDATE SET state=excluded.state",
                [.text(award.language), .text(award.book), .text(award.runID), .blob(try encode(award))])
        }
    }
}

// Internal fault seams operate only on injected stores. No app launch flag enables them.
extension SQLiteLearningStore {
    func installFault(profileID: String, boundary: String) throws {
        if boundary == "beforeCommit" { failBeforeCommit.insert(profileID); return }
        guard ["reward_runs", "completions", "checkpoints", "study_days", "metadata", "commands"].contains(boundary) else { throw LearningStoreError.injectedFailure }
        let operation = boundary == "metadata" ? "UPDATE" : "INSERT"
        try connection(profileID).script("CREATE TRIGGER injected_fault BEFORE \(operation) ON \(boundary) BEGIN SELECT RAISE(ABORT,'injected storage fault'); END;")
    }
    func clearFault(profileID: String, boundary: String) throws {
        failBeforeCommit.remove(profileID)
        try connection(profileID).execute("DROP TRIGGER IF EXISTS injected_fault")
    }
    func inspect(profileID: String) throws -> Data {
        let db = try connection(profileID)
        var rows: [String: [[String: SQLValue]]] = [:]
        for table in ["metadata", "reward_runs", "completions", "checkpoints", "study_days", "preferences", "commands", "historical_awards", "backup_imports"] {
            rows[table] = try db.query("SELECT * FROM \(table) ORDER BY rowid")
        }
        return try encode(rows)
    }
}
