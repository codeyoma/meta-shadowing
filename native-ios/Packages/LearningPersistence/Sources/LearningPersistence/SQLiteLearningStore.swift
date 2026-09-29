import Foundation
import CryptoKit
import LearningDomain

public actor SQLiteLearningStore: LearningStore {
    let root: URL
    let now: @Sendable () -> Date
    let calendar: Calendar
    var connections: [String: SQLiteConnection] = [:]
    var leases: [UUID: LearningSnapshot] = [:]
    var leaseGenerations: [UUID: UUID] = [:]
    var revisionListeners: [String: [UUID: AsyncStream<Int64>.Continuation]] = [:]
    var failBeforeCommit: Set<String> = []
    public init(root: URL, now: @escaping @Sendable () -> Date = Date.init, calendar: Calendar = .current) {
        self.root = root; self.now = now; self.calendar = calendar
    }
    func connection(_ profileID: String) throws -> SQLiteConnection {
        guard !profileID.isEmpty, profileID.utf16.count <= 200,
              profileID.trimmingCharacters(in: .whitespacesAndNewlines) == profileID,
              !profileID.unicodeScalars.contains(where: { $0.value < 32 }), root.isFileURL else { throw LearningStoreError.invalidProfile }
        if let connection = connections[profileID] { return connection }
        let digest = SHA256.hash(data: Data(profileID.utf8)).map { String(format: "%02x", $0) }.joined()
        let directory = root.appending(path: digest, directoryHint: .isDirectory)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        // Do not follow a replaced profile directory out of the injected storage namespace.
        guard directory.resolvingSymlinksInPath().deletingLastPathComponent().path == root.resolvingSymlinksInPath().path else {
            throw LearningStoreError.invalidProfile
        }
        let file = directory.appending(path: "learning.sqlite")
        do {
            if try file.resourceValues(forKeys: [.isSymbolicLinkKey]).isSymbolicLink == true { throw LearningStoreError.invalidProfile }
        } catch let error as CocoaError where error.code == .fileReadNoSuchFile {
            // A new profile has no database yet. SQLite creates only this file.
        }
        let db = try SQLiteConnection(path: file.path)
        try LearningSchema.prepare(db, profileID: profileID)
        connections[profileID] = db
        return db
    }
    func day() throws -> StudyDay { try StudyDay.at(now(), calendar: calendar) }
    public func open(plan: LearningPlan, preferences: LearningPreferences, writerID: UUID) throws -> LearningSnapshot {
        guard leases[writerID] == nil else { throw LearningStoreError.staleWriter }
        _ = try preferences.validated()
        let db = try connection(plan.scope.profileID)
        let (snapshot, generation) = try db.transaction {
        guard try readServiceState(db).resetIntent == nil else { throw LearningStoreError.staleWriter }
        let ledger = try readLedger(db)
        var state = try LearningSession.start(plan: plan, preferences: preferences)
        if let row = try db.query("SELECT state FROM checkpoints WHERE package=? AND stage=?", [.text(plan.scope.packageKey), .integer(Int64(plan.scope.stage))]).first {
            let saved: LearningSession
            if row["state"]?.data != nil { saved = try decode(LearningSession.self, row["state"]) }
            else {
                guard let imported = try importedBackup(db).checkpoint(for: plan) else { throw LearningStoreError.corrupt }
                saved = imported
            }
            guard saved.plan.scope == plan.scope, saved.plan.sourceCount == plan.sourceCount,
                  saved.plan.sources == plan.sources else { throw LearningError.incompatibleCheckpoint }
            if saved.phase != .complete && !ledger.completions.contains(where: { $0.scope == plan.scope && $0.rootRunID == saved.plan.rootRunID }) {
                state = try saved.validatedForRestore(expected: plan.scope, sourceCount: plan.sourceCount)
            }
        }
        let handle = LearningHandle(writerID: writerID, scope: plan.scope, planID: state.plan.runID)
        let snapshot = LearningSnapshot(handle: handle, writerVersion: 0, session: state, progress: try progress(ledger, db: db, scope: plan.scope, today: day()))
        return (snapshot, try readServiceState(db).writerGeneration)
        }
        leases[writerID] = snapshot
        leaseGenerations[writerID] = generation
        return snapshot
    }
    public func readProgress(scope: LearningScope, today: StudyDay) throws -> LearningProgress {
        let db = try connection(scope.profileID)
        return try progress(readLedger(db), db: db, scope: scope, today: today)
    }
    public func preferences(profileID: String) throws -> ProfilePreferences {
        try decode(ProfilePreferences.self, connection(profileID).query("SELECT state FROM preferences WHERE id=1").first?["state"])
    }
    public func savePreferences(_ value: ProfilePreferences, profileID: String) throws -> Int64 {
        let value = try value.validated()
        let data = try encode(value), db = try connection(profileID)
        let committed = try db.transaction {
            guard try readServiceState(db).resetIntent == nil else { throw LearningStoreError.staleWriter }
            if try db.query("SELECT state FROM preferences WHERE id=1").first?["state"]?.data == data { return try revision(db) }
            let oldRow = try db.query("SELECT state,clock,selection_clock FROM preferences WHERE id=1").first
            let old = try decode(ProfilePreferences.self, oldRow?["state"]), stamp = try nextStamp(db)
            let settingsStamp = old.learning == value.learning ? oldRow?["clock"]?.text ?? "" : stamp
            let selectionStamp = old.libraryLanguage == value.libraryLanguage && old.libraryBook == value.libraryBook && old.libraryPackageKey == value.libraryPackageKey ? oldRow?["selection_clock"]?.text ?? "" : stamp
            try db.execute("UPDATE preferences SET state=?,clock=?,selection_clock=? WHERE id=1", [.blob(data), .text(settingsStamp), .text(selectionStamp)])
            return try incrementRevision(db)
        }
        publishRevision(committed, profileID: profileID)
        return committed
    }
    public func revoke(profileID: String) {
        let writers = leases.values.filter { $0.handle.scope.profileID == profileID }.map { $0.handle.writerID }
        for writer in writers { leaseGenerations[writer] = nil }
        leases = leases.filter { $0.value.handle.scope.profileID != profileID }
    }
    public func revoke(writerID: UUID) { leases.removeValue(forKey: writerID); leaseGenerations[writerID] = nil }
    func readLedger(_ db: SQLiteConnection) throws -> RewardLedger {
        let runs = try db.query("SELECT state FROM reward_runs").map { try decode(RewardRun.self, $0["state"]) }
        let completed = try db.query("SELECT state FROM completions").map { try decode(CompletionReceipt.self, $0["state"]) }
        let days = try db.query("SELECT state FROM study_days").map { try decode(PracticeDay.self, $0["state"]) }
        let awards = try db.query("SELECT state FROM historical_awards").map { try decode(HistoricalAward.self, $0["state"]) }
        return try RewardLedger(runs: runs, completions: completed, studyDays: days, historicalAwards: awards)
    }
    func revision(_ db: SQLiteConnection) throws -> Int64 {
        guard let value = try db.query("SELECT revision FROM metadata WHERE id=1").first?["revision"]?.integer,
              value >= 0 else { throw LearningStoreError.corrupt }
        return value
    }
    func incrementRevision(_ db: SQLiteConnection) throws -> Int64 {
        let current = try revision(db)
        guard current < Int64.max else { throw LearningStoreError.revisionExhausted }
        try db.execute("UPDATE metadata SET revision=? WHERE id=1", [.integer(current + 1)])
        return current + 1
    }
    func nextStamp(_ db: SQLiteConnection) throws -> String {
        guard let row = try db.query("SELECT clock,writer FROM metadata WHERE id=1").first,
              let previous = row["clock"]?.text, let writer = row["writer"]?.text else { throw LearningStoreError.corrupt }
        let pieces = previous.split(separator: ":")
        let seconds = now().timeIntervalSince1970
        guard seconds.isFinite, seconds <= 9_007_199_254_740 else { throw LearningStoreError.revisionExhausted }
        let wall = Int64(max(0, seconds) * 1000)
        let last = pieces.first.flatMap { Int64($0) } ?? 0
        let physical = max(wall, last)
        let ordinal = physical == last ? (pieces.count > 1 ? Int64(pieces[1]) ?? 0 : 0) + 1 : 0
        guard ordinal <= 9_999_999_999 else { throw LearningStoreError.revisionExhausted }
        let stamp = String(format: "%016lld:%010lld:%@", physical, ordinal, writer)
        try db.execute("UPDATE metadata SET clock=? WHERE id=1", [.text(stamp)])
        return stamp
    }
}
