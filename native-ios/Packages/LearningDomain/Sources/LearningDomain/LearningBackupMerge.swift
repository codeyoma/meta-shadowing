import Foundation

extension LearningBackup {
    public func merged(with other: Self) throws -> Self {
        guard resetGeneration == other.resetGeneration else { throw LearningError.invalidState }
        var result = Self.empty; result.resetGeneration = resetGeneration
        result.clocks = clocks
        for (key, stamp) in other.clocks { result.clocks[key] = max(result.clocks[key] ?? "", stamp) }
        result.runs = try RewardLedger(runs: runs).merged(with: RewardLedger(runs: other.runs)).runs
        for (table, fields) in Self.keys {
            var rows: [String: BackupRow] = [:]
            for row in tables[table]! + other.tables[table]! {
                let key = try Self.key(row, fields)
                guard let old = rows[key] else { rows[key] = row; continue }
                // Inputs use canonical column order; compare values in that order for exact stable ties.
                var chosen = try Self.key(old, Self.columns[table]!) < Self.key(row, Self.columns[table]!) ? old : row
                switch table {
                case "checkpoints", "preferences":
                    let clock = try table == "checkpoints" ? Self.checkpointClock(row.text("package"), row.int("stage")) : Self.preferenceClock(row.text("key"))
                    let left = clocks[clock] ?? "", right = other.clocks[clock] ?? ""
                    if left != right { chosen = left > right ? old : row }
                case "stage_awards":
                    guard old["stage"] == row["stage"] else { throw LearningError.invalidState }
                    if try old.int("xp") != row.int("xp") { chosen = try old.int("xp") > row.int("xp") ? old : row }
                case "completions": chosen = try old.text("completed_at") < row.text("completed_at") ? old : row
                case "cycle_credits":
                    guard old["language"] == row["language"], old["book"] == row["book"], old["phrase_count"] == row["phrase_count"] else { throw LearningError.invalidState }
                    let difference = try old.int("phrase") - row.int("phrase")
                    let frontier = try difference == 0 ? old.int("confirmed") - row.int("confirmed") : difference
                    if frontier != 0 { chosen = frontier > 0 ? old : row }
                    chosen["day"] = .string(try [old.text("day"), row.text("day")].filter { !$0.isEmpty }.min() ?? "")
                default: break
                }
                rows[key] = chosen
            }
            result.tables[table] = Array(rows.values)
        }
        result.tables["unit_credits"] = []
        try result.materializeRuns(); try result.canonicalize()
        // Validate cross-record integrity after union, before persistence sees the result.
        return try LearningBackupCodec.decode(LearningBackupCodec.encode(result))
    }
}
