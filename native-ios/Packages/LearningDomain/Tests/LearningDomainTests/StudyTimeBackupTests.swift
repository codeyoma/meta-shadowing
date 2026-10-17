import Foundation
import Testing
@testable import LearningDomain

struct StudyTimeBackupTests {
    private func counter(_ replica: String, _ amount: Int64) throws -> StudyTimeCounter {
        try StudyTimeCounter(language: "english", book: "sample", replicaID: replica, milliseconds: amount)
    }
    private func backup(_ replica: String, _ amount: Int64) throws -> LearningBackup {
        var value = LearningBackup.empty
        try value.setStudyTimeCounters([counter(replica, amount)])
        return value
    }
    @Test func counterUnionIsIdempotentCommutativeAndAssociative() throws {
        let a = try backup("aaa", 10_000), b = try backup("aaa", 8_000), c = try backup("bbb", 4_000)
        #expect(try a.merged(with: a) == a)
        #expect(try a.merged(with: b) == b.merged(with: a))
        #expect(try a.merged(with: b).merged(with: c) == a.merged(with: b.merged(with: c)))
        #expect(try a.merged(with: b).merged(with: c).studyMilliseconds(language: "english", book: "sample") == 14_000)
        let encoded = try LearningBackupCodec.encode(a.merged(with: c))
        #expect(try LearningBackupCodec.decode(encoded).studyTimeCounters == [counter("aaa", 10_000), counter("bbb", 4_000)])
        #expect(try backup("aaa", 1).hasLearningData)
        #expect(try backup("aaa", 1).rewardLedger(profileID: "guest").runs.isEmpty)
    }
    @Test func legacyBackupsHaveZeroTime() throws {
        let current = try BackupJSON.parse(LearningBackupCodec.encode(.empty)).object
        let progress = current["progress"] ?? .object(current)
        for version in 1...5 {
            var root = try progress.object
            if version < 4 { root.removeValue(forKey: "sync") }
            if version < 3 {
                var tables = try root.required("tables").object
                tables.removeValue(forKey: "unit_credits")
                if version == 1 { tables.removeValue(forKey: "cycle_credits") }
                root["tables"] = .object(tables)
            }
            root["version"] = .integer(min(version, 4))
            let wire: BackupJSON = version == 5
                ? .object(["version": .integer(5), "generation": .string(UUID().uuidString), "progress": .object(root)])
                : .object(root)
            let decoded = try LearningBackupCodec.decode(wire.data())
            #expect(decoded.studyTimeCounters.isEmpty)
            #expect(try decoded.studyMilliseconds(language: "english", book: "sample") == 0)
        }
    }
    @Test func versionSixKeepsResetGenerationAndRejectsDifferentGenerations() throws {
        let generation = UUID().uuidString.lowercased()
        let a = try backup("aaa", 12_500).withResetGeneration(generation)
        let wire = try BackupJSON.parse(LearningBackupCodec.encode(a)).object
        #expect(try wire.int("version") == 6)
        #expect(Set(wire.keys) == ["version", "generation", "progress", "studyTime"])
        #expect(try LearningBackupCodec.decode(BackupJSON.object(wire).data()) == a)
        #expect(throws: LearningError.self) { try a.merged(with: backup("bbb", 1)) }
        #expect(throws: LearningError.self) { try a.withResetGeneration("invalid") }
    }
    @Test func rejectInvalidOrOversizedTimeBackup() throws {
        let valid = try backup("aaa", 1)
        var root = try BackupJSON.parse(LearningBackupCodec.encode(valid)).object
        let good = try BackupJSON.encoded(counter("aaa", 1))
        for amount in [-1.0, 1.5, 9_007_199_254_740_992] {
            var row = try good.object; row["milliseconds"] = .number(amount)
            root["studyTime"] = .array([.object(row)])
            #expect(throws: LearningError.self) { try LearningBackupCodec.decode(BackupJSON.object(root).data()) }
        }
        root["studyTime"] = .array([good, good])
        #expect(throws: LearningError.self) { try LearningBackupCodec.decode(BackupJSON.object(root).data()) }
        root["studyTime"] = .array([try .encoded(counter("aaa", StudyTimeCounter.maximumMilliseconds)), try .encoded(counter("bbb", 1))])
        #expect(throws: LearningError.self) { try LearningBackupCodec.decode(BackupJSON.object(root).data()) }
        let oversized = Data(repeating: 32, count: 16 * 1024 * 1024 + 1)
        #expect(throws: LearningError.self) { try LearningBackupCodec.decode(oversized) }
    }
}
