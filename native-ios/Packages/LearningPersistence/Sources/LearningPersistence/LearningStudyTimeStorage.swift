import Foundation
import LearningDomain

extension SQLiteLearningStore {
    public func beginStudyTime(handle: LearningHandle, visitID: UUID) throws -> StudyTimeLease {
        let db = try connection(handle.scope.profileID)
        return try db.transaction {
            let generation = try validateTimeWriter(handle, db: db)
            if let row = try db.query("SELECT lease FROM study_time_visit WHERE id=1").first {
                let previous = try decode(StudyTimeLease.self, row["lease"])
                if previous.id == visitID {
                    guard previous.handle.writerID == handle.writerID, previous.handle.scope == handle.scope,
                          previous.generation == generation else { throw LearningStoreError.staleWriter }
                    return previous
                }
            }
            let lease = StudyTimeLease(id: visitID, handle: handle, generation: generation)
            try db.execute("INSERT INTO study_time_visit VALUES(1,?,0,0) ON CONFLICT(id) DO UPDATE SET lease=excluded.lease,cumulative=0,retired=0", [.blob(try encode(lease))])
            return lease
        }
    }
    public func recordStudyTime(_ lease: StudyTimeLease, cumulativeMilliseconds: Int64) throws -> StudyTimeReceipt {
        try saveStudyTime(lease, cumulative: cumulativeMilliseconds, finishing: false)
    }
    public func finishStudyTime(_ lease: StudyTimeLease, cumulativeMilliseconds: Int64) throws -> StudyTimeReceipt {
        try saveStudyTime(lease, cumulative: cumulativeMilliseconds, finishing: true)
    }
    public func readStudyTime(profileID: String, language: String, book: String) throws -> Int64 {
        _ = try StudyTimeCounter(language: language, book: book, replicaID: "validation", milliseconds: 0)
        return try StudyTimeCounter.total(timeCounters(connection(profileID)), language: language, book: book)
    }
    func timeCounters(_ db: SQLiteConnection) throws -> [StudyTimeCounter] {
        try db.query("SELECT language,book,replica,milliseconds FROM study_time").map { row in
            guard let language = row["language"]?.text, let book = row["book"]?.text,
                  let replica = row["replica"]?.text, let amount = row["milliseconds"]?.integer else { throw LearningStoreError.corrupt }
            return try StudyTimeCounter(language: language, book: book, replicaID: replica, milliseconds: amount)
        }
    }
    private func validateTimeWriter(_ handle: LearningHandle, db: SQLiteConnection, requireCurrentPlan: Bool = true) throws -> UUID {
        let state = try readServiceState(db)
        guard let current = leases[handle.writerID]?.handle, current.scope == handle.scope,
              !requireCurrentPlan || current == handle,
              leaseGenerations[handle.writerID] == state.writerGeneration, state.resetIntent == nil else { throw LearningStoreError.staleWriter }
        return state.writerGeneration
    }
    private func saveStudyTime(_ lease: StudyTimeLease, cumulative: Int64, finishing: Bool) throws -> StudyTimeReceipt {
        guard (0...StudyTimeCounter.maximumMilliseconds).contains(cumulative) else { throw LearningError.invalidState }
        let scope = lease.handle.scope, db = try connection(scope.profileID)
        let (receipt, changed) = try db.transaction {
            // The stored visit capability survives an authorized regroup by this writer.
            // Acquiring a capability still requires the exact current learning handle.
            guard try validateTimeWriter(lease.handle, db: db, requireCurrentPlan: false) == lease.generation,
                  let row = try db.query("SELECT lease,cumulative,retired FROM study_time_visit WHERE id=1").first,
                  try decode(StudyTimeLease.self, row["lease"]) == lease,
                  let accepted = row["cumulative"]?.integer, let retired = row["retired"]?.integer else { throw LearningStoreError.staleWriter }
            guard retired == 0 || cumulative <= accepted else { throw LearningStoreError.staleWriter }
            let delta = max(0, cumulative - accepted)
            let before = try StudyTimeCounter.total(timeCounters(db), language: scope.language, book: scope.book)
            guard delta <= StudyTimeCounter.maximumMilliseconds - before else { throw LearningError.invalidState }
            if delta > 0 {
                guard let replica = try db.query("SELECT writer FROM metadata WHERE id=1").first?["writer"]?.text else { throw LearningStoreError.corrupt }
                try db.execute("INSERT INTO study_time VALUES(?,?,?,?) ON CONFLICT(language,book,replica) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds",
                    [.text(scope.language), .text(scope.book), .text(replica), .integer(delta)])
            }
            try db.execute("UPDATE study_time_visit SET cumulative=MAX(cumulative,?),retired=MAX(retired,?) WHERE id=1", [.integer(cumulative), .integer(finishing ? 1 : 0)])
            let revision = try delta > 0 ? incrementRevision(db) : revision(db)
            if failBeforeCommit.contains(scope.profileID) { throw LearningStoreError.injectedFailure }
            return (StudyTimeReceipt(acceptedMilliseconds: max(accepted, cumulative), bookMilliseconds: before + delta,
                backupRevision: revision, retired: finishing || retired == 1), delta > 0)
        }
        if changed { publishRevision(receipt.backupRevision, profileID: scope.profileID) }
        return receipt
    }
}
