import Foundation
import Testing
@testable import LearningDomain

@Suite struct LearningBackupTests {
    @Test func smallLegacyPayloadCannotExpandWithoutAnAggregateBudget() throws {
        var payload = try BackupJSON.parse(empty(1)).object
        var tables = try payload.required("tables").object
        var rows: [BackupJSON] = []
        for stage in 1...6 {
            var state = try BackupJSON.parse(BackupSession.encode(startSession(stage: stage))).object
            state.removeValue(forKey: "unitProgress")
            state["phraseCount"] = .integer(100_000)
            rows.append(.object(["package": .string("sample-v1"), "stage": .integer(stage), "state": .string(try BackupJSON.object(state).json())]))
        }
        tables["checkpoints"] = .array(rows); payload["tables"] = .object(tables)
        let data = try BackupJSON.object(payload).data()
        #expect(data.count < 4096)
        #expect(throws: LearningError.self) { _ = try LearningBackupCodec.decode(data) }
    }
    @Test func legacyCycleFallbackAlsoConsumesTheSharedExpansionBudget() throws {
        var payload = try BackupJSON.parse(empty(2)).object, tables = try payload.required("tables").object
        tables["cycle_credits"] = .array((1...6).map { stage in .object([
            "package": .string("sample-v1"), "stage": .integer(stage), "run": .string("legacy"),
            "language": .string("english"), "book": .string("sample"), "phrase_count": .integer(100_000),
            "phrase": .integer(0), "confirmed": .integer(0), "credited": .integer(0), "day": .string("")
        ]) })
        payload["tables"] = .object(tables)
        #expect(throws: LearningError.self) { _ = try LearningBackupCodec.decode(BackupJSON.object(payload).data()) }
    }
    func empty(_ version: Int) throws -> Data {
        var names = ["checkpoints", "completions", "daily_stages", "stage_awards", "study_days", "preferences"]
        if version >= 2 { names.append("cycle_credits") }
        if version >= 3 { names.append("unit_credits") }
        var root: [String: Any] = ["version": version, "tables": Dictionary(uniqueKeysWithValues: names.map { ($0, [Int]()) })]
        if version == 4 { root["sync"] = ["clocks": [:], "runs": []] as [String: Any] }
        return try JSONSerialization.data(withJSONObject: root, options: [.sortedKeys])
    }
    @Test func supportedBackupVersionsNormalizeWithoutRewards() throws {
        let canonical = try LearningBackupCodec.decode(empty(4))
        for version in 1...4 {
            let backup = try LearningBackupCodec.decode(empty(version))
            #expect(backup == canonical)
            #expect(try LearningBackupCodec.decode(LearningBackupCodec.encode(backup)) == backup)
            #expect(try backup.rewardLedger(profileID: "guest").totalXP(language: "english") == 0)
        }
    }
    @Test func oversizedMalformedAndDuplicateKeysAreRejected() throws {
        #expect(throws: LearningError.self) { try LearningBackupCodec.decode(Data(repeating: 32, count: 16 * 1024 * 1024 + 1)) }
        let duplicate = Data("{\"version\":4,\"version\":4,\"tables\":{},\"sync\":{}}".utf8)
        #expect(throws: LearningError.self) { try LearningBackupCodec.decode(duplicate) }
        #expect(throws: LearningError.self) { try LearningBackupCodec.decode(empty(5)) }
        #expect(throws: LearningError.self) { try LearningBackupCodec.decode(Data("{\"version\":4}".utf8)) }
    }
    @Test func countsAreBoundedBeforeExpansion() throws {
        #expect(try BackupCounts.decode(.string("100000*0"), remaining: 100_000).count == 100_000)
        #expect(throws: LearningError.self) { try BackupCounts.decode(.string("100001*0"), remaining: 100_000) }
        #expect(throws: LearningError.self) { try BackupCounts.decode(.string("100000*0,1*0"), remaining: 100_000) }
        #expect(throws: LearningError.self) { try BackupCounts.decode(.string("2*0"), remaining: 1) }
        #expect(throws: LearningError.self) { try BackupCounts.decode(.string("9999999999999999999999*0"), remaining: 100_000) }
    }
    @Test func mergeOrdersConverge() throws {
        let base = try LearningBackupCodec.decode(empty(4))
        #expect(try base.merged(with: base) == base)
        var a = base, b = base, c = base
        try a.setPreferences(ProfilePreferences(), stamp: "0000000000000001:0000000000:a")
        var settings = ProfilePreferences(); settings.learning.rate = 0.75
        try b.setPreferences(settings, stamp: "0000000000000001:0000000000:b")
        settings.learning.rate = 1.5
        try c.setPreferences(settings, stamp: "0000000000000002:0000000000:c")
        #expect(try a.merged(with: b) == b.merged(with: a))
        #expect(try a.merged(with: b).merged(with: c) == a.merged(with: b.merged(with: c)))
        #expect(try a.merged(with: c).profilePreferences().learning.rate == 1.5)
    }
    @Test func goldenBackupsPreserveHistoricalAndModernCredit() throws {
        let url = try #require(Bundle.module.url(forResource: "backup-reference", withExtension: "json", subdirectory: "Fixtures"))
        let root = try BackupJSON.parse(Data(contentsOf: url)).object
        for entry in try root.required("backups").array {
            let row = try entry.object, name = try row.text("name")
            let backup = try LearningBackupCodec.decode(row.required("payload").data())
            let expected: Int64 = name == "empty-v4" ? 0 : name == "historical-v1" ? 10 : name == "grouped-and-silent-v4" ? 11 : 3
            #expect(try backup.rewardLedger(profileID: "guest").totalXP(language: "english") == expected, "\(name)")
            #expect(try LearningBackupCodec.decode(LearningBackupCodec.encode(backup)) == backup, "\(name)")
            #expect(try backup.merged(with: backup) == backup, "\(name)")
        }
    }
    @Test func inconsistentReceiptsClocksAndCompletedHistoryAreRejected() throws {
        let url = try #require(Bundle.module.url(forResource: "backup-reference", withExtension: "json", subdirectory: "Fixtures"))
        let entries = try BackupJSON.parse(Data(contentsOf: url)).object.required("backups").array
        let modern = try #require(entries.first { try $0.object.text("name") == "completed-v4" }).object.required("payload").object
        for mode in ["completion", "study", "clock", "xp", "events", "package", "counts", "missing-unit-credit"] {
            var altered = modern
            var tables = try altered.required("tables").object, sync = try altered.required("sync").object
            switch mode {
            case "completion": tables["completions"] = .array([])
            case "study": tables["study_days"] = .array([])
            case "clock": sync["clocks"] = .object([:])
            case "missing-unit-credit": tables["unit_credits"] = .array([])
            case "xp":
                var rows = try tables.required("cycle_credits").array, row = try rows[0].object
                row["credited"] = .integer(200); rows[0] = .object(row); tables["cycle_credits"] = .array(rows)
            default:
                var runs = try sync.required("runs").array, run = try runs[0].object
                if mode == "events" {
                    var events = try run.required("events").array; events.append(events[0]); run["events"] = .array(events)
                } else if mode == "package" { run["package"] = .string("other-v1") }
                else { run["observed"] = .string("100001*0") }
                runs[0] = .object(run); sync["runs"] = .array(runs)
            }
            altered["tables"] = .object(tables); altered["sync"] = .object(sync)
            #expect(throws: LearningError.self, "\(mode)") { try LearningBackupCodec.decode(BackupJSON.object(altered).data()) }
        }
    }
}
