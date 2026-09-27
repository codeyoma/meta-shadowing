import CryptoKit
import Foundation
import LearningDomain
import SQLite3
import Testing
@testable import LearningPersistence

@Suite struct SQLiteConnectionTests {
    @Test func closedConnectionRejectsDatabaseOperations() throws {
        let db = try SQLiteConnection(path: ":memory:")
        try db.close()

        #expect(throws: LearningStoreError.sqlite(SQLITE_MISUSE)) { try db.script("SELECT 1") }
        #expect(throws: LearningStoreError.sqlite(SQLITE_MISUSE)) { try db.query("SELECT 1") }
        #expect(throws: LearningStoreError.sqlite(SQLITE_MISUSE)) { try db.execute("SELECT 1") }
        var enteredTransaction = false
        #expect(throws: LearningStoreError.sqlite(SQLITE_MISUSE)) {
            try db.transaction { enteredTransaction = true }
        }
        #expect(!enteredTransaction)
    }

    @Test func repeatedClosePreservesCommittedData() throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appending(path: "close.sqlite").path
        let db = try SQLiteConnection(path: path)
        try db.script("CREATE TABLE fixture(value INTEGER); INSERT INTO fixture VALUES(42)")
        try db.close()
        try db.close()

        let reopened = try SQLiteConnection(path: path)
        #expect(try reopened.query("SELECT value FROM fixture").first?["value"]?.integer == 42)
        #expect(try reopened.query("PRAGMA busy_timeout").first?["timeout"]?.integer == 250)
        try reopened.close()
    }

    @Test func memoryConnectionRollsBackAndChecksParameters() throws {
        let db = try SQLiteConnection(path: ":memory:")
        try LearningSchema.prepare(db, profileID: "guest")
        #expect(try db.query("PRAGMA foreign_keys").first?["foreign_keys"]?.integer == 1)
        #expect(throws: LearningStoreError.self) {
            try db.transaction {
                try db.execute("UPDATE metadata SET revision=1")
                throw LearningStoreError.injectedFailure
            }
        }
        #expect(try db.query("SELECT revision FROM metadata").first?["revision"]?.integer == 0)
        #expect(throws: LearningStoreError.self) { try db.execute("SELECT ?") }
        try db.close()
    }
    @Test func corruptAndFutureSchemaAreNotErased() async throws {
        for future in [false, true] {
            let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
            let digest = SHA256.hash(data: Data("guest".utf8)).map { String(format: "%02x", $0) }.joined()
            let directory = root.appending(path: digest, directoryHint: .isDirectory)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let path = directory.appending(path: "learning.sqlite")
            if future {
                let db = try SQLiteConnection(path: path.path)
                try db.execute("PRAGMA user_version=99"); try db.close()
            } else { try Data("not a database".utf8).write(to: path) }
            let before = try Data(contentsOf: path)
            await #expect(throws: LearningStoreError.self) { try await store(root).open(plan: plan(), preferences: .fresh, writerID: UUID()) }
            #expect(try Data(contentsOf: path) == before)
        }
    }
    @Test func busyAndReadOnlyFailuresAreBounded() throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let path = root.appending(path: "test.sqlite").path
        let first = try SQLiteConnection(path: path), second = try SQLiteConnection(path: path)
        try LearningSchema.prepare(first, profileID: "guest")
        try first.execute("BEGIN IMMEDIATE")
        let start = ContinuousClock.now
        #expect(throws: LearningStoreError.self) { try second.execute("BEGIN IMMEDIATE") }
        #expect(start.duration(to: .now) < .seconds(2))
        try first.execute("ROLLBACK")
        let readOnly = try SQLiteConnection(path: path, readOnly: true)
        #expect(throws: LearningStoreError.self) { try readOnly.execute("UPDATE metadata SET revision=1") }
        #expect(try second.query("SELECT revision FROM metadata").first?["revision"]?.integer == 0)
    }
    @Test func noOpAndDefaultPreferencesDoNotIncrementRevision() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let store = store(root)
        let initial = try await store.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let noOp = try await store.apply(command(initial, .pause))
        #expect(noOp.disposition == .ignored && noOp.backupRevision == 0)
        #expect(try await store.savePreferences(ProfilePreferences(), profileID: "guest") == 0)
        var settings = ProfilePreferences(); settings.learning.rate = 0.75
        #expect(try await store.savePreferences(settings, profileID: "guest") == 1)
        #expect(try await store.savePreferences(settings, profileID: "guest") == 1)
        #expect(try await store.preferences(profileID: "guest") == settings)
    }
}
