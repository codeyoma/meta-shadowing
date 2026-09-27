import Foundation

typealias BackupRow = [String: BackupJSON]
public struct LearningBackup: Equatable, Sendable {
    var tables: [String: [BackupRow]]
    var clocks: [String: String]
    var runs: [RewardRun]
    public internal(set) var resetGeneration: String?
    public static var empty: Self { Self(tables: Dictionary(uniqueKeysWithValues: columns.keys.map { ($0, []) }), clocks: [:], runs: [], resetGeneration: nil) }
    static let columns: [String: [String]] = [
        "checkpoints": ["package", "stage", "state"], "completions": ["package", "stage", "run", "completed_at"],
        "daily_stages": ["language", "book", "day", "stage"], "stage_awards": ["language", "book", "run", "day", "stage", "xp"],
        "study_days": ["language", "day"], "preferences": ["key", "value"],
        "cycle_credits": ["package", "stage", "run", "language", "book", "phrase_count", "phrase", "confirmed", "credited", "day"],
        "unit_credits": ["package", "stage", "run", "state"]]
    static let keys: [String: [String]] = [
        "checkpoints": ["package", "stage"], "completions": ["package", "stage", "run"], "daily_stages": ["language", "book", "day"],
        "stage_awards": ["language", "book", "run"], "study_days": ["language", "day"], "preferences": ["key"],
        "cycle_credits": ["package", "stage", "run"], "unit_credits": ["package", "stage", "run"]]
    static let languages: Set<String> = ["english", "japanese", "chinese", "german", "spanish", "french"]
    static func key(_ row: BackupRow, _ fields: [String]) throws -> String {
        try BackupJSON.array(fields.map { try row.required($0) }).json()
    }
    static func runKey(_ run: RewardRun) throws -> String {
        try BackupJSON.array([.string(run.scope.packageKey), .integer(run.scope.stage), .string(run.runID)]).json()
    }
    static func checkpointClock(_ package: String, _ stage: Int) throws -> String {
        try BackupJSON.array([.string("checkpoint"), .string(package), .integer(stage)]).json()
    }
    static func preferenceClock(_ key: String) throws -> String { try BackupJSON.array([.string("preference"), .string(key)]).json() }
    mutating func canonicalize() throws {
        for (table, fields) in Self.columns {
            tables[table] = try (tables[table] ?? []).map { ($0, try Self.key($0, fields)) }.sorted { $0.1 < $1.1 }.map(\.0)
        }
        runs = try runs.map { ($0, try Self.runKey($0)) }.sorted { $0.1 < $1.1 }.map(\.0)
    }
    mutating func upsert(_ table: String, _ row: BackupRow) throws {
        let fields = Self.keys[table]!, key = try Self.key(row, fields)
        if let index = try tables[table]?.firstIndex(where: { try Self.key($0, fields) == key }) { tables[table]![index] = row }
        else { tables[table, default: []].append(row) }
    }
    public func profilePreferences() throws -> ProfilePreferences {
        var result = ProfilePreferences()
        for row in tables["preferences"] ?? [] {
            let json = try BackupJSON.parse(row.text("value"), limit: 2048)
            if try row.text("key") == "settings" { result.learning = try JSONDecoder().decode(LearningPreferences.self, from: json.data()) }
            else {
                let selection = try json.object
                result.libraryLanguage = try selection.text("language")
                if selection["book"] != .null { result.libraryBook = try selection.text("book") }
                result.libraryPackageKey = try selection["packageKey"]?.identity()
            }
        }
        return try result.validated()
    }
    public mutating func setPreferences(_ preferences: ProfilePreferences, stamp: String, selectionStamp: String? = nil) throws {
        let preferences = try preferences.validated(); try LearningBackupCodec.validateStamp(stamp)
        try upsert("preferences", ["key": .string("settings"), "value": .string(try BackupJSON.encoded(preferences.learning).json())])
        clocks[try Self.preferenceClock("settings")] = stamp
        if let language = preferences.libraryLanguage {
            var selection: BackupRow = ["language": .string(language), "book": preferences.libraryBook.map(BackupJSON.string) ?? .null]
            if let package = preferences.libraryPackageKey { selection["packageKey"] = .string(package) }
            try upsert("preferences", ["key": .string("selection"), "value": .string(try BackupJSON.object(selection).json())])
            clocks[try Self.preferenceClock("selection")] = selectionStamp ?? stamp
        }
        try canonicalize()
    }
    public var latestClock: String { clocks.values.max() ?? "" }
    public func preferenceStamp(_ key: String) throws -> String { clocks[try Self.preferenceClock(key)] ?? "" }
    public struct CheckpointRecord: Equatable, Sendable {
        public let package: String
        public let stage: Int
        public let runID: String
        public let state: String
        public let stamp: String
    }
    public func checkpointRecords() throws -> [CheckpointRecord] {
        try tables["checkpoints"]!.map { row in
            let package = try row.text("package"), stage = try row.int("stage"), state = try row.text("state")
            return CheckpointRecord(package: package, stage: stage, runID: try BackupJSON.parse(state).object.text("runId"), state: state,
                stamp: clocks[try Self.checkpointClock(package, stage)] ?? "")
        }
    }
    public func completionCounts(scope: LearningScope) throws -> [Int: Int] {
        var counts: [Int: Set<String>] = [:]
        for row in tables["completions"]! where try row.text("package") == scope.packageKey {
            let stage = try row.int("stage"), runID = try row.text("run")
            let root = runs.first { $0.scope.packageKey == scope.packageKey && $0.scope.stage == stage && $0.runID == runID }?.lineage ?? runID
            counts[stage, default: []].insert(root)
        }
        return counts.mapValues(\.count)
    }
    public var hasLearningData: Bool { tables.contains { $0.key != "preferences" && !$0.value.isEmpty } }
    public func rewardLedger(profileID: String) throws -> RewardLedger {
        let normalized = try runs.map { run in
            var result = run
            result.scope = try LearningScope(profileID: profileID, packageKey: run.scope.packageKey, language: run.scope.language, book: run.scope.book, stage: run.scope.stage)
            return result
        }
        var completed: [RunKey: CompletionReceipt] = [:]
        for row in tables["completions"] ?? [] {
            let package = try row.text("package"), stage = try row.int("stage"), runID = try row.text("run")
            let bound = normalized.first { $0.scope.packageKey == package && $0.scope.stage == stage && $0.runID == runID }
            // v1 may contain unbound completion history. Retain it on wire until a caller supplies its package identity.
            guard let bound else { continue }
            let receipt = CompletionReceipt(scope: bound.scope, rootRunID: bound.lineage ?? runID, runID: runID, day: try StudyDay(String(row.text("completed_at").prefix(10))))
            if let old = completed[receipt.key] {
                if receipt.day < old.day || receipt.day == old.day && receipt.runID < old.runID { completed[receipt.key] = receipt }
            } else { completed[receipt.key] = receipt }
        }
        let days = try (tables["study_days"] ?? []).map { PracticeDay(profileID: profileID, language: try $0.text("language"), day: try StudyDay($0.text("day"))) }
        let awards = try (tables["stage_awards"] ?? []).map { row in
            HistoricalAward(profileID: profileID, language: try row.text("language"), book: try row.text("book"), runID: try row.text("run"),
                            stage: try row.int("stage"), day: try StudyDay(row.text("day")), xp: try row.required("xp").integer(0, 10))
        }
        return try RewardLedger(runs: normalized, completions: Array(completed.values), studyDays: days, historicalAwards: awards)
    }
    public func checkpoint(for plan: LearningPlan) throws -> LearningSession? {
        guard let row = try tables["checkpoints"]?.first(where: { try $0.text("package") == plan.scope.packageKey && $0.int("stage") == plan.scope.stage }) else { return nil }
        var state = try BackupSession.decode(row.text("state"), package: plan.scope.packageKey, stage: plan.scope.stage,
            profile: plan.scope.profileID, language: plan.scope.language, book: plan.scope.book)
        guard state.plan.sourceCount == plan.sourceCount else { throw LearningError.incompatibleCheckpoint }
        state.plan = try LearningPlan(scope: plan.scope, runID: state.plan.runID, lineage: state.plan.lineage, sources: plan.sources, groupSize: state.plan.groupSize)
        return state
    }
    public mutating func setCheckpoint(_ state: LearningSession, stamp: String) throws {
        try LearningBackupCodec.validateStamp(stamp)
        try upsert("checkpoints", ["package": .string(state.plan.scope.packageKey), "stage": .integer(state.plan.scope.stage), "state": .string(try BackupSession.encode(state))])
        clocks[try Self.checkpointClock(state.plan.scope.packageKey, state.plan.scope.stage)] = stamp
        try canonicalize()
    }
    public mutating func setLedger(_ ledger: RewardLedger) throws {
        let normalized = try ledger.runs.map { run in
            var value = run
            value.scope = try LearningScope(profileID: "backup", packageKey: run.scope.packageKey, language: run.scope.language, book: run.scope.book, stage: run.scope.stage)
            return value
        }
        runs = try RewardLedger(runs: runs).merged(with: RewardLedger(runs: normalized)).runs
        for receipt in ledger.completions {
            let row: BackupRow = ["package": .string(receipt.scope.packageKey), "stage": .integer(receipt.scope.stage), "run": .string(receipt.runID), "completed_at": .string(receipt.day.rawValue + "T00:00:00Z")]
            let key = try Self.key(row, Self.keys["completions"]!)
            if try !(tables["completions"] ?? []).contains(where: { try Self.key($0, Self.keys["completions"]!) == key }) { try upsert("completions", row) }
        }
        for day in ledger.studyDays { try upsert("study_days", ["language": .string(day.language), "day": .string(day.day.rawValue)]) }
        try materializeRuns()
        try canonicalize()
    }
    mutating func materializeRuns() throws {
        for run in runs {
            let identity: BackupRow = ["package": .string(run.scope.packageKey), "stage": .integer(run.scope.stage), "run": .string(run.runID)]
            let key = try Self.runKey(run), credit = try run.totalXP()
            let existing = try tables["cycle_credits"]?.first { try Self.key($0, Self.keys["cycle_credits"]!) == key }
            let completion = try tables["completions"]?.first { try Self.key($0, Self.keys["completions"]!) == key }
            var unit = try existing?.int("phrase") ?? 0
            if completion != nil { unit = run.observed.count - 1 }
            var row = identity
            row.merge(["language": .string(run.scope.language), "book": .string(run.scope.book), "phrase_count": .integer(run.observed.count),
                       "phrase": .integer(unit), "confirmed": .integer(completion != nil ? run.observed[unit] : try existing?.int("confirmed") ?? 0), "credited": .number(Double(credit)),
                       "day": .string(try existing?.text("day") ?? completion.map { String(try $0.text("completed_at").prefix(10)) } ?? "")]) { _, rhs in rhs }
            try upsert("cycle_credits", row)
            if run.sourceCount > 0 {
                let state: BackupJSON = .object(["counts": .array(run.observed.map(BackupJSON.integer)), "sourceCount": .integer(run.sourceCount),
                    "groupSize": .integer(run.groupSize), "baseline": .number(Double(credit)), "earned": .integer(0)])
                var unit = identity; unit["state"] = .string(try state.json()); try upsert("unit_credits", unit)
            }
        }
    }
}
