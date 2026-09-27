import Foundation
import LearningDomain
import Testing
@testable import LearningPersistence

func temporaryRoot() throws -> URL {
    let root = FileManager.default.temporaryDirectory.appending(path: "learning-test-\(UUID().uuidString)", directoryHint: .isDirectory)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    return root
}
func plan(profile: String = "guest", package: String = "sample-v1", run: String = "run", stage: Int = 11) throws -> LearningPlan {
    try .make(scope: LearningScope(profileID: profile, packageKey: package, language: "english", book: "sample", stage: stage),
              runID: run, sources: [LearningSource(index: 0, text: "Hello.", translation: "안녕.")], groupSize: 2)
}
func store(_ root: URL) -> SQLiteLearningStore {
    var calendar = Calendar(identifier: .gregorian); calendar.timeZone = TimeZone(secondsFromGMT: 0)!
    return SQLiteLearningStore(root: root, now: { Date(timeIntervalSince1970: 1_790_467_200) }, calendar: calendar)
}
func command(_ snapshot: LearningSnapshot, _ event: LearningEvent, id: UUID = UUID()) -> LearningCommand {
    LearningCommand(handle: snapshot.handle, id: id, expectedVersion: snapshot.writerVersion, event: event)
}
func speaking(_ store: SQLiteLearningStore, _ snapshot: LearningSnapshot) async throws -> LearningSnapshot {
    let resumed = try await store.apply(command(snapshot, .resume)).snapshot
    return try await store.apply(command(resumed, .playbackEnded)).snapshot
}

@Suite struct SQLiteLearningStoreTests {
    @Test func lifecyclePauseCannotPromoteAnOlderLearningSelection() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root), firstPlan = try plan()
        let first = try await target.open(plan: firstPlan, preferences: .fresh, writerID: UUID())
        let speakingFirst = try await speaking(target, first)
        let secondPlan = try LearningPlan.make(scope: LearningScope(profileID: "guest", packageKey: "other-v1", language: "english", book: "other", stage: 11), runID: "other-run", sources: firstPlan.sources, groupSize: 2)
        let second = try await target.open(plan: secondPlan, preferences: .fresh, writerID: UUID())
        let resumed = try await target.apply(command(second, .resume))
        let paused = try await target.apply(command(speakingFirst, .pause))
        #expect(paused.snapshot.progress.latestLearning?.packageKey == "other-v1")
        #expect(paused.backupRevision == resumed.backupRevision)
    }
    @Test func storageRootDoesNotRequireTrailingDirectorySlash() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let withoutSlash = URL(filePath: root.path, directoryHint: .notDirectory)
        let result = try await store(withoutSlash).open(plan: plan(), preferences: .fresh, writerID: UUID())
        #expect(result.progress.xp == 0)
    }
    @Test func latestLearningIsIndependentOfLibrarySelectionAndSurvivesImport() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let original = store(root), p = try plan()
        let initial = try await original.open(plan: p, preferences: .fresh, writerID: UUID())
        #expect(initial.progress.latestLearning == nil)
        let ended = try await speaking(original, initial)
        let committed = try await original.apply(command(ended, .confirm)).snapshot
        let latest = try #require(committed.progress.latestLearning)
        #expect(latest.packageKey == "sample-v1" && latest.stage == 11)
        var preference = ProfilePreferences()
        preference.libraryLanguage = "english"; preference.libraryBook = "other"; preference.libraryPackageKey = "other-v1"
        _ = try await original.savePreferences(preference, profileID: "guest")
        _ = try await original.apply(command(committed, .pause))
        #expect(try await original.readProgress(scope: p.scope, today: StudyDay("2026-09-27")).latestLearning == latest)
        let backup = try await original.exportBackup(profileID: "guest")
        _ = try await original.mergeBackup(backup.payload, profileID: "imported")
        let importedScope = try plan(profile: "imported").scope
        #expect(try await original.readProgress(scope: importedScope, today: StudyDay("2026-09-27")).latestLearning == latest)
        #expect(try await store(root).readProgress(scope: p.scope, today: StudyDay("2026-09-27")).latestLearning == latest)
    }

    @Test func saveLoadAndDiskReopenPreserveCommittedProgress() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let original = store(root), p = try plan()
        let initial = try await original.open(plan: p, preferences: .fresh, writerID: UUID())
        let ended = try await speaking(original, initial)
        let result = try await original.apply(command(ended, .confirm))
        #expect(result.earnedXP == 3)
        #expect(result.snapshot.progress.completedRuns[11] == 1)
        let reopened = store(root)
        let progress = try await reopened.readProgress(scope: p.scope, today: StudyDay("2026-09-27"))
        #expect(progress.xp == 3)
        #expect(progress.completedRuns[11] == 1)
        let fresh = try await reopened.open(plan: plan(run: "next"), preferences: .fresh, writerID: UUID())
        #expect(fresh.session.plan.runID == "next")
        #expect(fresh.session.current.confirmed == 0)
        #expect(fresh.progress.xp == 3)
    }
    @Test func profileAndPackageIsolationUsesHashedDirectories() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let store = store(root)
        let p = try plan(profile: "../other/'quoted'")
        let initial = try await store.open(plan: p, preferences: .fresh, writerID: UUID())
        let ended = try await speaking(store, initial)
        _ = try await store.apply(command(ended, .confirm))
        let other = try await store.open(plan: plan(profile: "other"), preferences: .fresh, writerID: UUID())
        #expect(other.progress.xp == 0)
        let version = try await store.open(plan: plan(profile: p.scope.profileID, package: "sample-v2"), preferences: .fresh, writerID: UUID())
        #expect(version.session.current.confirmed == 0)
        #expect(version.progress.completedRuns.isEmpty)
        let children = try FileManager.default.contentsOfDirectory(atPath: root.path)
        #expect(children.count == 2 && children.allSatisfy { $0.count == 64 && !$0.contains(".") })
    }
    @Test func restorePausesAndRevokedWriterCannotCommit() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let store = store(root), p = try plan()
        let initial = try await store.open(plan: p, preferences: .fresh, writerID: UUID())
        let running = try await store.apply(command(initial, .resume)).snapshot
        let position = try await store.apply(command(running, .position(0.2))).snapshot
        await store.revoke(profileID: p.scope.profileID)
        await #expect(throws: LearningStoreError.self) { try await store.apply(command(position, .playbackEnded)) }
        let reopened = try await store.open(plan: p, preferences: .fresh, writerID: UUID())
        #expect(!reopened.session.running)
        #expect(reopened.session.positionSeconds == 0.2)
        #expect(reopened.progress.xp == 0)
    }
    @Test func lostCommittedReplyDoesNotRepeatReward() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let store = store(root)
        let initial = try await store.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let ended = try await speaking(store, initial)
        let request = command(ended, .confirm)
        let first = try await store.apply(request)
        let duplicate = try await store.apply(request)
        #expect(duplicate.disposition == .duplicate)
        #expect(duplicate.earnedXP == 0)
        #expect(duplicate.backupRevision == first.backupRevision)
        #expect(duplicate.snapshot == first.snapshot)
        await #expect(throws: LearningStoreError.self) {
            try await store.apply(command(ended, .next, id: request.id))
        }
    }
    @Test func everyCommitBoundaryRollsBack() async throws {
        for boundary in ["reward_runs", "completions", "checkpoints", "study_days", "metadata", "commands", "beforeCommit"] {
            let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
            let store = store(root), p = try plan()
            let initial = try await store.open(plan: p, preferences: .fresh, writerID: UUID())
            let ended = try await speaking(store, initial), request = command(ended, .confirm)
            let before = try await store.inspect(profileID: "guest")
            try await store.installFault(profileID: "guest", boundary: boundary)
            await #expect(throws: LearningStoreError.self) { try await store.apply(request) }
            #expect(try await store.inspect(profileID: "guest") == before)
            let disk = try await LearningPersistenceTestsStore(root).inspect(profileID: "guest")
            #expect(disk == before)
            try await store.clearFault(profileID: "guest", boundary: boundary)
            let saved = try await store.apply(request)
            #expect(saved.snapshot.progress.xp == 3)
            #expect(saved.snapshot.progress.completedRuns[11] == 1)
            #expect(try await store.apply(request).earnedXP == 0)
        }
    }
}
private func LearningPersistenceTestsStore(_ root: URL) -> SQLiteLearningStore { store(root) }
