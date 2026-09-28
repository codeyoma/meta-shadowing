import Foundation
import LearningDomain
import Testing
@testable import LearningPersistence

@Suite struct LearningBrowsingTests {
    @Test func emptyLanguageAndProfileDoNotBorrowProgress() async throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root), p = try plan(stage: 1)
        let initial = try await db.open(plan: p, preferences: .fresh, writerID: UUID())
        _ = try await db.apply(command(speaking(db, initial), .confirm))
        let today = try StudyDay("2026-09-27")
        #expect(try await db.readLanguageProgress(profileID: "guest", language: "japanese", today: today).xp == 0)
        #expect(try await db.readLanguageProgress(profileID: "other", language: "english", today: today).xp == 0)
    }

    @Test(arguments: [false, true]) func completedNativeAndImportedCheckpointIsReadOnly(imported: Bool) async throws {
        let root = try temporaryRoot(), target = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root); try? FileManager.default.removeItem(at: target) }
        let source = store(root), p = try plan()
        let initial = try await source.open(plan: p, preferences: .fresh, writerID: UUID())
        let ended = try await speaking(source, initial)
        let confirmed = try await source.apply(command(ended, .confirm)).snapshot
        _ = try await source.apply(command(confirmed, .next))
        let db = imported ? store(target) : source
        if imported { _ = try await db.mergeBackup(source.exportBackup(profileID: "guest").payload, profileID: "guest") }
        let before = try await db.exportBackup(profileID: "guest")
        let saved = try #require(await db.readCheckpoint(plan: p))
        #expect(saved.phase == .complete)
        #expect(!saved.running)
        #expect(try await db.exportBackup(profileID: "guest") == before)
        let changed = try LearningPlan.make(scope: p.scope, runID: "different", sources: [
            LearningSource(index: 0, text: "Changed.", translation: "다름."),
            LearningSource(index: 1, text: "Extra.", translation: "추가.")
        ], groupSize: 2)
        await #expect(throws: LearningError.self) { try await db.readCheckpoint(plan: changed) }
    }

    @Test func browsingDoesNotMutatePractice() async throws {
        let root = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root), p = try plan(stage: 1)
        let start = try await db.open(plan: p, preferences: .fresh, writerID: UUID())
        let ended = try await speaking(db, start)
        _ = try await db.apply(command(ended, .confirm))
        let before = try await db.exportBackup(profileID: "guest")
        let checkpoint = try #require(await db.readCheckpoint(plan: p))
        #expect(checkpoint.current.confirmed == 1)
        #expect(!checkpoint.running)
        let progress = try await db.readLanguageProgress(profileID: "guest", language: "english", today: StudyDay("2026-09-27"))
        #expect(progress.xp == 1)
        #expect(try await db.exportBackup(profileID: "guest") == before)
        #expect(try await store(root).readCheckpoint(plan: p) == checkpoint)
    }
}
