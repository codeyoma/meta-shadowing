import Foundation

public enum LearningBackupCodec {
    public static func decode(_ data: Data) throws -> LearningBackup {
        do { return try decodeRoot(BackupJSON.parse(data)) } catch { throw LearningError.invalidState }
    }
    static func decodeRoot(_ value: BackupJSON) throws -> LearningBackup {
        let preview = try value.object, version = try preview.int("version", 1, 5)
        if version == 5 {
            let envelope = try value.object(keys: ["version", "generation", "progress"])
            let generation = try envelope.text("generation")
            guard UUID(uuidString: generation) != nil, generation.count == 36,
                  try envelope.required("progress").object.int("version") == 4 else { throw LearningError.invalidState }
            var result = try decodeRoot(envelope.required("progress")); result.resetGeneration = generation
            guard try wireValue(result).data().count <= 16 * 1024 * 1024 else { throw LearningError.invalidState }
            return result
        }
        let root = try value.object(keys: version == 4 ? ["version", "tables", "sync"] : ["version", "tables"])
        var names = Set(LearningBackup.columns.keys)
        if version < 2 { names.remove("cycle_credits") }
        if version < 3 { names.remove("unit_credits") }
        let rawTables = try root.required("tables").object(keys: names)
        var result = LearningBackup.empty
        var budget = BackupExpansionBudget()
        var sessions: [String: LearningSession] = [:], unitStates: [String: BackupRow] = [:]
        var explicitUnitSessions: Set<String> = []
        for (table, columns) in LearningBackup.columns {
            let input = try rawTables[table]?.array ?? []
            var seen: Set<String> = []
            for value in input {
                var row = try value.object(keys: Set(columns))
                for column in columns {
                    let cell = try row.required(column)
                    switch column {
                    case "stage": _ = try cell.integer(1, 16)
                    case "xp": guard [0, 10].contains(try cell.integer(0, 10)) else { throw LearningError.invalidState }
                    case "day": if !(table == "cycle_credits" && cell == .string("")) { _ = try StudyDay(cell.string) }
                    case "phrase_count": _ = try cell.integer(1, 100_000)
                    case "phrase": _ = try cell.integer(0, 99_999)
                    case "confirmed": _ = try cell.integer(0, 100_000)
                    case "credited": _ = try cell.integer(0, LevelProgress.maximumXP)
                    case "completed_at": try validateTimestamp(cell.string)
                    case "state":
                        let text = try cell.string
                        guard text.utf16.count <= 4 * 1024 * 1024, text.utf8.count <= 4 * 1024 * 1024 else { throw LearningError.invalidState }
                        let key = try LearningBackup.key(row, ["package", "stage"] + (table == "unit_credits" ? ["run"] : []))
                        if table == "unit_credits" {
                            let unit = try BackupJSON.parse(text).object(keys: ["counts", "sourceCount", "groupSize", "baseline", "earned"])
                            let count = try unit.int("sourceCount", 1, 100_000), size = try unit.int("groupSize", 1, 4)
                            try budget.reserve((try unit.required("counts").array.count) * 2)
                            let values = try unit.required("counts").array.map { Int(try $0.integer(0, 100_000)) }
                            let baseline = try unit.required("baseline").integer(0, LevelProgress.maximumXP)
                            let earned = try unit.required("earned").integer(0, LevelProgress.maximumXP - baseline)
                            guard values.count == (count + size - 1) / size else { throw LearningError.invalidState }
                            let multiplier = try row.int("stage") >= 11 ? 3 : 1
                            let possible = values.enumerated().reduce(Int64(0)) { $0 + Int64($1.element * min(size, count - $1.offset * size) * multiplier) }
                            guard earned <= possible else { throw LearningError.invalidState }
                            unitStates[key] = unit
                            row[column] = .string(try BackupJSON.object(unit).json())
                        } else {
                            let session = try BackupSession.decode(text, package: row.text("package"), stage: row.int("stage"), backupVersion: version, budget: &budget)
                            sessions[key] = session
                            if try BackupJSON.parse(text).object["unitProgress"] != nil {
                                explicitUnitSessions.insert(try BackupJSON.array([.string(session.plan.scope.packageKey), .integer(session.plan.scope.stage), .string(session.plan.runID)]).json())
                            }
                            row[column] = .string(try BackupSession.encode(session))
                        }
                    case "value": row[column] = .string(try normalizedPreference(key: row.text("key"), value: cell.string))
                    default: _ = try cell.identity()
                    }
                }
                guard seen.insert(try LearningBackup.key(row, LearningBackup.keys[table]!)).inserted else { throw LearningError.invalidState }
                result.tables[table, default: []].append(row)
            }
        }
        for row in result.tables["cycle_credits"]! {
            let key = try LearningBackup.key(row, LearningBackup.keys["cycle_credits"]!)
            if explicitUnitSessions.contains(key), unitStates[key] == nil { throw LearningError.invalidState }
        }
        try validateTables(result.tables, sessions: sessions, units: unitStates, modern: version == 4)
        if version == 4 { try decodeSync(root.required("sync"), into: &result, units: unitStates, sessions: sessions, budget: &budget) }
        else {
            for row in result.tables["checkpoints"]! { result.clocks[try LearningBackup.checkpointClock(row.text("package"), row.int("stage"))] = "" }
            for row in result.tables["preferences"]! { result.clocks[try LearningBackup.preferenceClock(row.text("key"))] = "" }
            for row in result.tables["cycle_credits"]! {
                let key = try LearningBackup.key(row, LearningBackup.keys["cycle_credits"]!), unit = unitStates[key]
                let checkpointKey = try LearningBackup.key(row, ["package", "stage"])
                let checkpoint = sessions[checkpointKey].flatMap { $0.plan.runID == (try? row.text("run")) ? $0 : nil }
                let count = try row.int("phrase_count"), phrase = try row.int("phrase"), confirmed = try row.int("confirmed")
                try budget.reserve(count * 2)
                let observed = try unit.map { try $0.required("counts").array.map { Int(try $0.integer(0, 100_000)) } }
                    ?? (0..<count).map { $0 < phrase ? 100_000 : $0 == phrase ? confirmed : 0 }
                let scope = try scope(row)
                result.runs.append(RewardRun(scope: scope, runID: try row.text("run"), lineage: nil,
                    sourceCount: try unit?.int("sourceCount") ?? checkpoint?.plan.sourceCount ?? 0,
                    groupSize: try unit?.int("groupSize") ?? checkpoint?.plan.groupSize ?? 0, observed: observed,
                    candidates: [CreditCandidate(credited: try row.required("credited").integer(), counts: observed)], events: []))
            }
        }
        _ = try RewardLedger(runs: result.runs)
        // Projection provenance is retained in candidates; never turn a merged total into a new candidate.
        for index in result.tables["unit_credits"]!.indices {
            let row = result.tables["unit_credits"]![index], key = try LearningBackup.key(row, LearningBackup.keys["unit_credits"]!)
            guard let run = try result.runs.first(where: { try LearningBackup.runKey($0) == key }), var unit = unitStates[key] else { throw LearningError.invalidState }
            unit["baseline"] = .number(Double(try run.totalXP())); unit["earned"] = .integer(0)
            result.tables["unit_credits"]![index]["state"] = .string(try BackupJSON.object(unit).json())
        }
        for run in result.runs where run.sourceCount > 0 {
            let key = try LearningBackup.runKey(run)
            if unitStates[key] == nil {
                let unit: BackupJSON = .object(["counts": .array(run.observed.map(BackupJSON.integer)), "sourceCount": .integer(run.sourceCount),
                    "groupSize": .integer(run.groupSize), "baseline": .number(Double(try run.totalXP())), "earned": .integer(0)])
                try result.upsert("unit_credits", ["package": .string(run.scope.packageKey), "stage": .integer(run.scope.stage),
                    "run": .string(run.runID), "state": .string(try unit.json())])
            }
        }
        try result.canonicalize()
        guard try wireValue(result).data().count <= 16 * 1024 * 1024 else { throw LearningError.invalidState }
        return result
    }
    static func scope(_ row: BackupRow) throws -> LearningScope {
        try LearningScope(profileID: "backup", packageKey: row.text("package"), language: row.text("language"), book: row.text("book"), stage: row.int("stage", 1, 16))
    }
    static func normalizedPreference(key: String, value: String) throws -> String {
        let json = try BackupJSON.parse(value, limit: 2048)
        if key == "settings" {
            _ = try json.object(keys: ["mode", "rate"], optional: ["speechView", "groupSize", "crazyWpm", "originalTextSize", "translationTextSize", "originalTextFont", "translationTextFont"])
            let preferences = try JSONDecoder().decode(LearningPreferences.self, from: json.data())
            return try BackupJSON.encoded(preferences).json()
        }
        guard key == "selection" else { throw LearningError.invalidState }
        let row = try json.object(keys: ["language", "book"], optional: ["packageKey"])
        guard LearningBackup.languages.contains(try row.text("language")) else { throw LearningError.invalidState }
        if row["book"] != .null { _ = try row.required("book").identity() }
        if let package = row["packageKey"] { _ = try package.identity(); guard row["book"] != .null else { throw LearningError.invalidState } }
        return try json.json()
    }
    static func validateTimestamp(_ value: String) throws {
        guard value.range(of: #"^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z?$"#, options: .regularExpression) != nil else { throw LearningError.invalidState }
        _ = try StudyDay(String(value.prefix(10)))
        let pieces = value.dropFirst(11).split(separator: ":")
        guard let hour = Int(pieces[0]), hour <= 23, let minute = Int(pieces[1]), minute <= 59,
              let second = Int(pieces[2].prefix(2)), second <= 59 else { throw LearningError.invalidState }
    }
    static func validateStamp(_ stamp: String) throws {
        guard stamp.isEmpty || stamp.range(of: #"^\d{16}:\d{10}:[a-z0-9]{1,100}$"#, options: .regularExpression) != nil
            && (Int64(stamp.prefix(16)) ?? Int64.max) <= 9_007_199_254_740_991 else { throw LearningError.invalidState }
    }
    private static func wireValue(_ backup: LearningBackup) throws -> BackupJSON {
        var backup = backup; try backup.canonicalize()
        let runs = try backup.runs.map { run -> BackupJSON in
            var row: BackupRow = ["package": .string(run.scope.packageKey), "stage": .integer(run.scope.stage), "run": .string(run.runID),
                "language": .string(run.scope.language), "book": .string(run.scope.book), "sourceCount": .integer(run.sourceCount), "groupSize": .integer(run.groupSize),
                "observed": BackupCounts.encode(run.observed), "candidates": .array(run.candidates.map { .object(["credited": .number(Double($0.credited)), "counts": BackupCounts.encode($0.counts)]) }),
                "events": .array(try run.events.map { try BackupJSON.encoded($0) })]
            if let lineage = run.lineage { row["lineage"] = .string(lineage) }; return .object(row)
        }
        var json: BackupJSON = .object(["version": .integer(4), "tables": .object(backup.tables.mapValues { .array($0.map(BackupJSON.object)) }),
            "sync": .object(["clocks": .object(backup.clocks.mapValues(BackupJSON.string)), "runs": .array(runs)])])
        if let generation = backup.resetGeneration { json = .object(["version": .integer(5), "generation": .string(generation), "progress": json]) }
        return json
    }
    public static func encode(_ backup: LearningBackup) throws -> Data {
        let data = try wireValue(backup).data()
        _ = try decode(data)
        return data
    }
}
