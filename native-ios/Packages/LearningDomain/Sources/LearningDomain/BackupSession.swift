import Foundation

enum BackupSession {
    static func decode(_ input: String, package: String, stage: Int, backupVersion: Int = 4,
                       profile: String = "backup", language: String = "english", book: String? = nil) throws -> LearningSession {
        var budget = BackupExpansionBudget()
        return try decode(input, package: package, stage: stage, backupVersion: backupVersion,
                          profile: profile, language: language, book: book, budget: &budget)
    }
    static func decode(_ input: String, package: String, stage: Int, backupVersion: Int = 4,
                       profile: String = "backup", language: String = "english", book: String? = nil,
                       budget: inout BackupExpansionBudget) throws -> LearningSession {
        let json = try BackupJSON.parse(input)
        let preview = try json.object, version = try preview.int("version", 1, 2)
        var required: Set<String> = ["version", "runId", "stage", "phraseCount", "phrase", "mode", "rate", "confirmed", "planned", "phase", "running", "audioSeconds", "remainingMs"]
        if version == 2 { required.formUnion(["sourcePhraseCount", "groupSize"]) }
        var optional: Set<String> = ["reveal"]
        if backupVersion >= 3 { optional.insert("unitProgress") }
        if backupVersion >= 4 { optional.formUnion(["sourceProgress", "lineage"]) }
        let row = try json.object(keys: required, optional: optional)
        let grouped = (7...10).contains(stage), silent = stage >= 11
        guard (version == 2) == grouped, try row.int("stage", 1, 16) == stage,
              ["manual", "auto"].contains(try row.text("mode")), case .bool = row["running"] else { throw LearningError.invalidState }
        let size = grouped ? try row.int("groupSize", 2, 4) : 1
        let count = grouped ? try row.int("sourcePhraseCount", 1, 100_000) : try row.int("phraseCount", 1, 100_000)
        let units = (count + size - 1) / size
        try budget.reserve(count * 2 + units * 3)
        guard try row.int("phraseCount", 1, 100_000) == units else { throw LearningError.invalidState }
        let selected = try row.int("phrase", 0, Int64(units - 1))
        let current = UnitProgress(confirmed: try row.int("confirmed", 0, 100_000), planned: try row.int("planned", silent ? 1 : 3, 100_000))
        let allUnits: [UnitProgress]
        if let raw = row["unitProgress"] {
            allUnits = try raw.array.map {
                let unit = try $0.object(keys: ["confirmed", "planned"])
                return UnitProgress(confirmed: try unit.int("confirmed", 0, 100_000), planned: try unit.int("planned", silent ? 1 : 3, 100_000))
            }
            guard allUnits.count == units, allUnits[selected] == current else { throw LearningError.invalidState }
        } else {
            allUnits = (0..<units).map { $0 == selected ? current : UnitProgress(confirmed: $0 < selected ? 3 : 0, planned: 3) }
        }
        let sources: [SourceProgress]
        if let raw = row["sourceProgress"] {
            guard grouped, row["unitProgress"] != nil else { throw LearningError.invalidState }
            sources = try raw.array.map {
                let unit = try $0.object(keys: ["confirmed", "planned"], optional: ["closed"])
                guard unit["closed"] == nil || unit["closed"] == .bool(true) else { throw LearningError.invalidState }
                return SourceProgress(confirmed: try unit.int("confirmed", 0, 100_000), planned: try unit.int("planned", 3, 100_000), closed: unit["closed"] == .bool(true))
            }
            guard sources.count == count else { throw LearningError.invalidState }
        } else { sources = (0..<count).map { SourceProgress(confirmed: allUnits[$0 / size].confirmed, planned: allUnits[$0 / size].planned) } }
        let lineage = try row["lineage"]?.identity(limit: 100)
        guard lineage == nil || grouped && row["sourceProgress"] != nil else { throw LearningError.invalidState }
        guard let suffix = package.range(of: "-v", options: .backwards) else { throw LearningError.invalidIdentity }
        let scope = try LearningScope(profileID: profile, packageKey: package, language: language,
                                      book: book ?? String(package[..<suffix.lowerBound]), stage: stage)
        let plan = try LearningPlan(scope: scope, runID: row.required("runId").identity(limit: 100), lineage: lineage,
            sources: (0..<count).map { LearningSource(index: $0, text: "", translation: "") }, groupSize: size)
        func finite(_ key: String) throws -> Double {
            guard case let .number(value) = row[key], value.isFinite, value >= 0 else { throw LearningError.invalidState }
            return value
        }
        _ = try finite("remainingMs")
        var reveal: RevealSpeed?
        if let raw = row["reveal"] {
            guard silent else { throw LearningError.invalidState }
            let value = try raw.object(keys: ["speed", "wpm"])
            reveal = RevealSpeed(level: try value.int("speed", 1, 4), WPM: try value.int("wpm", 1, 999))
        }
        guard let phase = LearningSession.Phase(rawValue: try row.text("phase")) else { throw LearningError.invalidState }
        let session = LearningSession(plan: plan, sourceProgress: sources, unit: selected, phase: phase, running: false,
            rate: try finite("rate"), positionSeconds: try finite("audioSeconds"), reveal: reveal)
        try session.validate()
        guard session.units == allUnits else { throw LearningError.invalidState }
        return try session.validatedForRestore(expected: scope, sourceCount: count)
    }
    static func encode(_ state: LearningSession) throws -> String {
        try state.validate()
        var row: [String: BackupJSON] = [
            "version": .integer(state.plan.groupSize > 1 ? 2 : 1), "runId": .string(state.plan.runID),
            "stage": .integer(state.plan.scope.stage), "phraseCount": .integer(state.unitCount), "phrase": .integer(state.unit),
            "mode": .string("manual"), "rate": .number(state.rate), "confirmed": .integer(state.current.confirmed),
            "planned": .integer(state.current.planned), "phase": .string(state.phase.rawValue), "running": .bool(false),
            "audioSeconds": .number(state.positionSeconds), "remainingMs": .integer(0),
            "unitProgress": .array(state.units.map { .object(["confirmed": .integer($0.confirmed), "planned": .integer($0.planned)]) })]
        if state.plan.groupSize > 1 {
            row["sourcePhraseCount"] = .integer(state.plan.sourceCount); row["groupSize"] = .integer(state.plan.groupSize)
            if state.plan.lineage != nil || state.sourceProgress.contains(where: \.closed) {
                row["sourceProgress"] = .array(state.sourceProgress.map {
                    var value: [String: BackupJSON] = ["confirmed": .integer($0.confirmed), "planned": .integer($0.planned)]
                    if $0.closed { value["closed"] = .bool(true) }; return .object(value)
                })
            }
        }
        if let lineage = state.plan.lineage { row["lineage"] = .string(lineage) }
        if let reveal = state.reveal { row["reveal"] = .object(["speed": .integer(reveal.level), "wpm": .integer(reveal.WPM)]) }
        return try BackupJSON.object(row).json()
    }
}
