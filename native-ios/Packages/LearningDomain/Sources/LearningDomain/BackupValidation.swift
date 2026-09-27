import Foundation

extension LearningBackupCodec {
    static func validateTables(_ tables: [String: [BackupRow]], sessions: [String: LearningSession], units: [String: BackupRow], modern: Bool) throws {
        func keyed(_ table: String, _ fields: [String]? = nil) throws -> [String: BackupRow] {
            try Dictionary(uniqueKeysWithValues: tables[table]!.map { (try LearningBackup.key($0, fields ?? LearningBackup.keys[table]!), $0) })
        }
        let completed = Set(try tables["completions"]!.map { try LearningBackup.key($0, ["stage", "run"]) })
        let history = try keyed("completions"), daily = try keyed("daily_stages"), study = try keyed("study_days"), cycles = try keyed("cycle_credits")
        var usedDaily: Set<String> = [], usedStudy: Set<String> = [], awardsPerDay: [String: Int] = [:]
        for award in tables["stage_awards"]! {
            let dailyKey = try LearningBackup.key(award, ["language", "book", "day"]), studyKey = try LearningBackup.key(award, ["language", "day"])
            guard let chosen = daily[dailyKey], study[studyKey] != nil,
                  completed.contains(try LearningBackup.key(award, ["stage", "run"])) else { throw LearningError.invalidState }
            usedDaily.insert(dailyKey); usedStudy.insert(studyKey)
            if try award.int("xp") == 10 {
                awardsPerDay[dailyKey, default: 0] += 1
                if !modern {
                    guard chosen["stage"] == award["stage"], awardsPerDay[dailyKey]! <= (try chosen.int("stage") <= 10 ? 2 : 3) else { throw LearningError.invalidState }
                }
            }
        }
        for (key, unit) in units {
            guard let row = cycles[key] else { throw LearningError.invalidState }
            let counts = try unit.required("counts").array.map { Int(try $0.integer(0, 100_000)) }
            let phrase = try row.int("phrase")
            guard try row.int("phrase_count") == counts.count, counts.indices.contains(phrase),
                  try row.int("credited") == unit.int("baseline") + unit.int("earned"),
                  counts[phrase] >= (try row.int("confirmed")) else { throw LearningError.invalidState }
            if history[key] != nil {
                let minimum = try row.int("stage") >= 11 ? 1 : 3
                guard counts.allSatisfy({ $0 >= minimum }) else { throw LearningError.invalidState }
            }
        }
        var bindings: [String: String] = [:]
        for (key, row) in cycles {
            let package = try row.text("package"), book = try row.text("book"), language = try row.text("language")
            let prefix = book + "-v", suffix = package.hasPrefix(prefix) ? String(package.dropFirst(prefix.count)) : ""
            guard book.range(of: #"^[a-z0-9]+(?:-[a-z0-9]+)*$"#, options: .regularExpression) != nil,
                  !suffix.isEmpty, suffix.first != "0", suffix.allSatisfy({ $0.isASCII && $0.isNumber }),
                  let version = Int64(suffix), version <= 9_007_199_254_740_991,
                  LearningBackup.languages.contains(language), try row.text("run").utf16.count <= 100 else { throw LearningError.invalidState }
            let phrase = try row.int("phrase"), count = try row.int("phrase_count"), confirmed = try row.int("confirmed"), stage = try row.int("stage")
            guard phrase < count else { throw LearningError.invalidState }
            if units[key] == nil {
                let maximum = Int64(phrase * 100_000 + confirmed) * Int64(stage >= 11 ? 3 : (7...10).contains(stage) ? 4 : 1)
                guard try row.required("credited").integer() <= maximum else { throw LearningError.invalidState }
            }
            let binding = language + ":" + book
            guard bindings[package] == nil || bindings[package] == binding else { throw LearningError.invalidState }
            bindings[package] = binding
            let minimum = stage >= 11 ? 1 : 3, isComplete = history[key] != nil
            if isComplete {
                guard phrase == count - 1, confirmed >= minimum, modern || minimum == 1 || confirmed % 2 == 1 else { throw LearningError.invalidState }
            }
            if try row.text("day") != "" {
                let studyKey = try LearningBackup.key(row, ["language", "day"])
                guard isComplete, study[studyKey] != nil, phrase == count - 1, confirmed >= minimum else { throw LearningError.invalidState }
                usedStudy.insert(studyKey)
            } else if try isComplete && row.int("credited") > 0 { throw LearningError.invalidState }
        }
        for (_, state) in sessions {
            let identity: BackupRow = ["package": .string(state.plan.scope.packageKey), "stage": .integer(state.plan.scope.stage), "run": .string(state.plan.runID)]
            let key = try LearningBackup.key(identity, ["package", "stage", "run"])
            if state.phase == .complete && history[key] == nil { throw LearningError.invalidState }
            if let unit = units[key] {
                let counts = try unit.required("counts").array.map { Int(try $0.integer()) }
                guard try unit.int("sourceCount") == state.plan.sourceCount, try unit.int("groupSize") == state.plan.groupSize,
                      state.units.count == counts.count, zip(state.units, counts).allSatisfy({ $0.confirmed <= $1 }) else { throw LearningError.invalidState }
            } else if let row = cycles[key] {
                guard try row.int("phrase_count") == state.unitCount, try row.int("phrase") >= state.unit,
                      try row.int("phrase") != state.unit || row.int("confirmed") >= state.current.confirmed else { throw LearningError.invalidState }
            }
        }
        if !modern && (usedDaily.count != daily.count || usedStudy.count != study.count) { throw LearningError.invalidState }
    }

    static func decodeSync(_ value: BackupJSON, into result: inout LearningBackup, units: [String: BackupRow],
                           sessions: [String: LearningSession], budget: inout BackupExpansionBudget) throws {
        let raw = try value.object(keys: ["clocks", "runs"])
        let clocks = try raw.required("clocks").object
        var permitted: Set<String> = []
        for row in result.tables["checkpoints"]! { permitted.insert(try LearningBackup.checkpointClock(row.text("package"), row.int("stage"))) }
        for row in result.tables["preferences"]! { permitted.insert(try LearningBackup.preferenceClock(row.text("key"))) }
        guard Set(clocks.keys) == permitted else { throw LearningError.invalidState }
        for (key, value) in clocks { let stamp = try value.string; try validateStamp(stamp); result.clocks[key] = stamp }
        let cycles = try Dictionary(uniqueKeysWithValues: result.tables["cycle_credits"]!.map { (try LearningBackup.key($0, LearningBackup.keys["cycle_credits"]!), $0) })
        var seen: Set<String> = []
        func counts(_ value: BackupJSON) throws -> [Int] {
            let values = try BackupCounts.decode(value, remaining: budget.remaining)
            try budget.reserve(values.count); return values
        }
        for value in try raw.required("runs").array {
            let row = try value.object(keys: ["package", "stage", "run", "language", "book", "sourceCount", "groupSize", "observed", "candidates", "events"], optional: ["lineage"])
            let scope = try scope(row), sourceCount = try row.int("sourceCount", 0, 100_000), size = try row.int("groupSize", 0, 4)
            let runID = try row.required("run").identity(limit: 100), lineage = try row["lineage"]?.identity(limit: 100)
            let observed = try counts(row.required("observed"))
            let candidates = try row.required("candidates").array.map {
                let candidate = try $0.object(keys: ["credited", "counts"])
                return CreditCandidate(credited: try candidate.required("credited").integer(0, LevelProgress.maximumXP), counts: try counts(candidate.required("counts")))
            }
            var events: [ConfirmationReceipt] = []
            try budget.reserve(try row.required("events").array.count)
            for value in try row.required("events").array {
                let event = try value.object(keys: ["unit", "ordinal", "day"], optional: ["multiplier", "weight", "sources"])
                let unit = try event.int("unit", 0, Int64(observed.count - 1)), ordinal = try event.int("ordinal", 1, 100_000)
                let multiplier = try event["multiplier"].map { Int(try $0.integer(3, 3)) }
                guard multiplier == nil || scope.stage >= 11 else { throw LearningError.invalidState }
                let weight = try event["weight"].map { Int(try $0.integer(1, Int64(min(size, sourceCount - unit * size)))) }
                guard weight == nil || (7...10).contains(scope.stage) && multiplier == nil else { throw LearningError.invalidState }
                let sources = try event["sources"].map { raw -> [SourceOrdinal] in
                    guard (7...10).contains(scope.stage) else { throw LearningError.invalidState }
                    try budget.reserve(try raw.array.count)
                    return try raw.array.map {
                        let item = try $0.object(keys: ["source", "ordinal"])
                        return SourceOrdinal(source: try item.int("source", Int64(unit * size), Int64(min(sourceCount, (unit + 1) * size) - 1)), ordinal: try item.int("ordinal", 1, 100_000))
                    }.sorted { $0.source < $1.source }
                }
                guard lineage == nil || sources != nil else { throw LearningError.invalidState }
                events.append(ConfirmationReceipt(unit: unit, ordinal: ordinal, day: try StudyDay(event.text("day")), multiplier: multiplier, weight: weight, sources: sources))
            }
            let run = RewardRun(scope: scope, runID: runID, lineage: lineage, sourceCount: sourceCount, groupSize: size, observed: observed, candidates: candidates, events: events)
            try run.validate()
            let key = try LearningBackup.runKey(run)
            guard seen.insert(key).inserted, let cycle = cycles[key], cycle["language"] == row["language"], cycle["book"] == row["book"],
                  try cycle.int("phrase_count") == observed.count, try cycle.required("credited").integer() == run.totalXP(),
                  observed.indices.contains(try cycle.int("phrase")), observed[try cycle.int("phrase")] >= (try cycle.int("confirmed")) else { throw LearningError.invalidState }
            if let unit = units[key] {
                guard try unit.int("sourceCount") == sourceCount, try unit.int("groupSize") == size,
                      try unit.required("counts").array.map({ Int(try $0.integer()) }) == observed else { throw LearningError.invalidState }
            }
            result.runs.append(run)
        }
        guard seen.count == cycles.count else { throw LearningError.invalidState }
        for row in result.tables["checkpoints"]! {
            guard let state = try sessions[LearningBackup.key(row, ["package", "stage"])] else { throw LearningError.invalidState }
            let run = result.runs.first { $0.scope.packageKey == state.plan.scope.packageKey && $0.scope.stage == state.plan.scope.stage && $0.runID == state.plan.runID }
            guard run?.lineage == state.plan.lineage else { throw LearningError.invalidState }
        }
    }
}
