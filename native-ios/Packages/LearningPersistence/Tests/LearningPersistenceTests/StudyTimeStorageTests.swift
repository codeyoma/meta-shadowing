import Foundation
import LearningDomain
import Testing
@testable import LearningPersistence

@Suite struct StudyTimeStorageTests {
    @Test func cumulativeWritesAndFinalRetryNeverDuplicateTimeOrLearning() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root), initial = try await db.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let visit = try await db.beginStudyTime(handle: initial.handle, visitID: UUID())
        for amount: Int64 in [10_000, 10_000, 8_000, 12_500] {
            _ = try await db.recordStudyTime(visit, cumulativeMilliseconds: amount)
        }
        let final = try await db.finishStudyTime(visit, cumulativeMilliseconds: 12_500)
        #expect(final.bookMilliseconds == 12_500 && final.retired)
        #expect(try await db.finishStudyTime(visit, cumulativeMilliseconds: 12_500) == final)
        await #expect(throws: LearningStoreError.staleWriter) {
            try await db.recordStudyTime(visit, cumulativeMilliseconds: 13_000)
        }
        let next = try await db.beginStudyTime(handle: initial.handle, visitID: UUID())
        #expect(try await db.finishStudyTime(next, cumulativeMilliseconds: 2_500).bookMilliseconds == 15_000)
        #expect(try await store(root).readStudyTime(profileID: "guest", language: "english", book: "sample") == 15_000)
        let after = try await db.readProgress(scope: initial.handle.scope, today: StudyDay("2026-09-28"))
        #expect(after == initial.progress)
    }

    @Test func anotherConnectionReplacesVisitAndRejectsDelayedWrites() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let first = store(root), second = store(root)
        let a = try await first.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let old = try await first.beginStudyTime(handle: a.handle, visitID: UUID())
        _ = try await first.recordStudyTime(old, cumulativeMilliseconds: 1_000)
        let b = try await second.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let current = try await second.beginStudyTime(handle: b.handle, visitID: UUID())
        await #expect(throws: LearningStoreError.staleWriter) { try await first.recordStudyTime(old, cumulativeMilliseconds: 5_000) }
        #expect(try await second.finishStudyTime(current, cumulativeMilliseconds: 2_000).bookMilliseconds == 3_000)
    }

    @Test func failuresRollBackAndRetryKeepsTheSameFrontier() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root), initial = try await db.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let visit = try await db.beginStudyTime(handle: initial.handle, visitID: UUID())
        await db.timeFailure(true)
        await #expect(throws: LearningStoreError.injectedFailure) { try await db.recordStudyTime(visit, cumulativeMilliseconds: 10_000) }
        #expect(try await db.readStudyTime(profileID: "guest", language: "english", book: "sample") == 0)
        await db.timeFailure(false)
        #expect(try await db.recordStudyTime(visit, cumulativeMilliseconds: 10_000).bookMilliseconds == 10_000)
        await db.revoke(writerID: initial.handle.writerID)
        await #expect(throws: LearningStoreError.staleWriter) { try await db.recordStudyTime(visit, cumulativeMilliseconds: 20_000) }
    }

    @Test func profileGenerationBlocksOldConnectionAndHistoryDeletionClearsTime() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let current = store(root), oldStore = store(root), authority = try await current.activateService(scope: nil)
        let initial = try await oldStore.open(plan: plan(profile: "local"), preferences: .fresh, writerID: UUID())
        let visit = try await oldStore.beginStudyTime(handle: initial.handle, visitID: UUID())
        _ = try await oldStore.recordStudyTime(visit, cumulativeMilliseconds: 4_000)
        let request = UUID()
        _ = try await current.beginHistoryReset(.local, requestID: request, lease: authority)
        _ = try await current.removeLocalHistory(requestID: request, lease: authority)
        await #expect(throws: LearningStoreError.staleWriter) { try await oldStore.recordStudyTime(visit, cumulativeMilliseconds: 9_000) }
        #expect(try await current.readStudyTime(profileID: "local", language: "english", book: "sample") == 0)
    }

    @Test func stableBookIdentityRetainsTimeAcrossVersionsButIsolatesProfiles() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root), initial = try await db.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let visit = try await db.beginStudyTime(handle: initial.handle, visitID: UUID())
        _ = try await db.finishStudyTime(visit, cumulativeMilliseconds: 3_000)
        let next = try await db.open(plan: plan(package: "sample-v2"), preferences: .fresh, writerID: UUID())
        let second = try await db.beginStudyTime(handle: next.handle, visitID: UUID())
        #expect(try await db.finishStudyTime(second, cumulativeMilliseconds: 2_000).bookMilliseconds == 5_000)
        #expect(try await db.readStudyTime(profileID: "other", language: "english", book: "sample") == 0)
        #expect(try await db.readStudyTime(profileID: "guest", language: "japanese", book: "sample") == 0)
    }

    @Test func duplicateBackupRetainsTimeOnceAndRestoreUsesNewLocalReplicaForFutureTime() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let first = store(root.appending(path: "first")), second = store(root.appending(path: "second"))
        let source = try await first.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let lease = try await first.beginStudyTime(handle: source.handle, visitID: UUID())
        _ = try await first.finishStudyTime(lease, cumulativeMilliseconds: 12_500)
        let exported = try await first.exportBackup(profileID: "guest")
        #expect(try LearningBackupCodec.decode(exported.payload).studyMilliseconds(language: "english", book: "sample") == 12_500)
        _ = try await second.restoreIntoEmptyProfile(exported.payload, profileID: "guest")
        _ = try await second.mergeBackup(exported.payload, profileID: "guest")
        let destination = try await second.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let next = try await second.beginStudyTime(handle: destination.handle, visitID: UUID())
        _ = try await second.finishStudyTime(next, cumulativeMilliseconds: 2_500)
        #expect(try await second.readStudyTime(profileID: "guest", language: "english", book: "sample") == 15_000)
        let counters = try LearningBackupCodec.decode(await second.exportBackup(profileID: "guest").payload).studyTimeCounters
        #expect(counters.count == 2)
        #expect(try await second.readProgress(scope: destination.handle.scope, today: StudyDay("2026-09-28")).xp == 0)
    }

    @Test func legacyImportDoesNotEraseMeasuredTimeAndTimeOnlyProfileIsNotEmpty() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root)
        var timeOnly = LearningBackup.empty
        try timeOnly.setStudyTimeCounters([StudyTimeCounter(language: "english", book: "sample", replicaID: "imported", milliseconds: 5_000)])
        _ = try await db.restoreIntoEmptyProfile(LearningBackupCodec.encode(timeOnly), profileID: "guest")
        let current = try JSONSerialization.jsonObject(with: LearningBackupCodec.encode(.empty)) as! [String: Any]
        let legacy = try JSONSerialization.data(withJSONObject: current["progress"]!)
        _ = try await db.mergeBackup(legacy, profileID: "guest")
        #expect(try await db.readStudyTime(profileID: "guest", language: "english", book: "sample") == 5_000)
        await #expect(throws: LearningStoreError.staleWriter) {
            try await db.restoreIntoEmptyProfile(legacy, profileID: "guest")
        }
    }

    @Test func activeVisitSurvivesImportedOwnReplicaFrontier() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root), initial = try await db.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let visit = try await db.beginStudyTime(handle: initial.handle, visitID: UUID())
        _ = try await db.recordStudyTime(visit, cumulativeMilliseconds: 1_000)
        var incoming = try LearningBackupCodec.decode(await db.exportBackup(profileID: "guest").payload)
        let counter = try #require(incoming.studyTimeCounters.first)
        try incoming.setStudyTimeCounters([StudyTimeCounter(language: counter.language, book: counter.book,
            replicaID: counter.replicaID, milliseconds: 5_000)])
        _ = try await db.mergeBackup(LearningBackupCodec.encode(incoming), profileID: "guest")
        #expect(try await db.finishStudyTime(visit, cumulativeMilliseconds: 2_000).bookMilliseconds == 6_000)
    }

    @Test func failedCounterImportRollsBackBytesAndRevision() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root), before = try await db.exportBackup(profileID: "guest")
        var incoming = LearningBackup.empty
        try incoming.setStudyTimeCounters([StudyTimeCounter(language: "english", book: "sample", replicaID: "imported", milliseconds: 5_000)])
        await db.timeFailure(true)
        await #expect(throws: LearningStoreError.injectedFailure) {
            try await db.mergeBackup(LearningBackupCodec.encode(incoming), profileID: "guest")
        }
        #expect(try await db.exportBackup(profileID: "guest") == before)
    }

    @Test func checkpointRecencyIsScopedToTheBookWithoutChangingGlobalResume() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root)
        let first = try await db.open(plan: plan(), preferences: .fresh, writerID: UUID())
        _ = try await db.apply(command(first, .resume))
        let otherScope = try LearningScope(profileID: "guest", packageKey: "other-v1", language: "english", book: "other", stage: 11)
        let otherPlan = try LearningPlan.make(scope: otherScope, runID: "other", sources: [.init(index: 0, text: "Hello", translation: "안녕")], groupSize: 2)
        let other = try await db.open(plan: otherPlan, preferences: .fresh, writerID: UUID())
        _ = try await db.apply(command(speaking(db, other), .confirm))
        #expect(try await db.checkpointStageOrder(scope: first.handle.scope) == [11])
        #expect(try await db.readProgress(scope: first.handle.scope, today: StudyDay("2026-09-28")).latestLearning?.packageKey == "other-v1")
    }
    @Test func forgedPlanHandleCannotAcquireTimeAuthority() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root), initial = try await db.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let forged = LearningHandle(writerID: initial.handle.writerID, scope: initial.handle.scope, planID: "not-the-plan")
        await #expect(throws: LearningStoreError.staleWriter) { try await db.beginStudyTime(handle: forged, visitID: UUID()) }
    }
    @Test func authorizedRegroupKeepsTheSameVisitAndItsRetryFrontier() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = store(root)
        let scope = try LearningScope(profileID: "guest", packageKey: "sample-v1", language: "english", book: "sample", stage: 7)
        let grouped = try LearningPlan.make(scope: scope, runID: "before", sources: (0..<4).map {
            .init(index: $0, text: "Source \($0)", translation: "번역 \($0)")
        }, groupSize: 2)
        let initial = try await db.open(plan: grouped, preferences: .fresh, writerID: UUID())
        let id = UUID(), visit = try await db.beginStudyTime(handle: initial.handle, visitID: id)
        _ = try await db.recordStudyTime(visit, cumulativeMilliseconds: 1_000)
        let edited = try await db.apply(command(initial, .regroup(size: 3, newPlanID: "after"))).snapshot
        #expect(edited.handle.planID != initial.handle.planID)
        #expect(try await db.beginStudyTime(handle: edited.handle, visitID: id) == visit)
        let forged = StudyTimeLease(id: visit.id, handle: edited.handle, generation: visit.generation)
        await #expect(throws: LearningStoreError.staleWriter) {
            try await db.recordStudyTime(forged, cumulativeMilliseconds: 4_000)
        }
        #expect(try await db.finishStudyTime(visit, cumulativeMilliseconds: 4_000).bookMilliseconds == 4_000)
        await #expect(throws: LearningStoreError.staleWriter) {
            try await db.beginStudyTime(handle: initial.handle, visitID: UUID())
        }
        #expect(try await db.readProgress(scope: scope, today: StudyDay("2026-09-28")).xp == 0)
    }
    @Test func schemaTwoUpgradePreservesExistingRowsAndRevision() throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let db = try SQLiteConnection(path: root.appending(path: "legacy.sqlite").path)
        try LearningSchema.prepare(db, profileID: "guest")
        try db.script("UPDATE metadata SET revision=42; DROP TABLE study_time_visit; DROP TABLE study_time; PRAGMA user_version=2;")
        let preferences = try db.query("SELECT state FROM preferences")
        try LearningSchema.prepare(db, profileID: "guest")
        #expect(try db.query("PRAGMA user_version").first?["user_version"]?.integer == 3)
        #expect(try db.query("SELECT revision FROM metadata").first?["revision"]?.integer == 42)
        #expect(try db.query("SELECT state FROM preferences") == preferences)
        #expect(try db.query("SELECT * FROM study_time").isEmpty)
        try db.close()
    }
}

extension SQLiteLearningStore {
    func timeFailure(_ fail: Bool) {
        if fail { failBeforeCommit.insert("guest") } else { failBeforeCommit.remove("guest") }
    }
}
