import Foundation
import LearningDomain
import Testing
@testable import LearningPersistence

@Suite struct LearningBackupStorageTests {
    @Test func clearingImportedLibrarySelectionProducesAClockedEmptySelection() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let source = store(root.appending(path: "source")), target = store(root.appending(path: "target"))
        let preference = ProfilePreferences(libraryLanguage: "japanese", libraryBook: "sample", libraryPackageKey: "sample-v1")
        _ = try await source.savePreferences(preference, profileID: "guest")
        let old = try await source.exportBackup(profileID: "guest")
        _ = try await target.mergeBackup(old.payload, profileID: "guest")
        _ = try await target.savePreferences(ProfilePreferences(), profileID: "guest")
        let cleared = try await target.exportBackup(profileID: "guest")
        let exported = try LearningBackupCodec.decode(cleared.payload).profilePreferences()
        #expect(exported.libraryLanguage == "english" && exported.libraryBook == nil && exported.libraryPackageKey == nil)
        _ = try await target.mergeBackup(old.payload, profileID: "guest")
        #expect(try await target.preferences(profileID: "guest").libraryBook == nil)
        _ = try await source.mergeBackup(cleared.payload, profileID: "guest")
        #expect(try await source.preferences(profileID: "guest").libraryBook == nil)
    }
    @Test func restoreAndAcknowledgementAreAtomicAndIdempotent() async throws {
        let a = try temporaryRoot(), b = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: a); try? FileManager.default.removeItem(at: b) }
        let source = store(a), target = store(b)
        let initial = try await source.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let ended = try await speaking(source, initial)
        _ = try await source.apply(command(ended, .confirm))
        let exported = try await source.exportBackup(profileID: "guest")
        let imported = try await target.restoreIntoEmptyProfile(exported.payload, profileID: "other")
        #expect(try await target.readProgress(scope: plan(profile: "other").scope, today: StudyDay("2026-09-27")).xp == 3)
        let again = try await target.mergeBackup(exported.payload, profileID: "other")
        #expect(imported.revision == again.revision)
        try await target.acknowledgeBackup(profileID: "other", revision: imported.revision)
        #expect(try await target.exportBackup(profileID: "other").acknowledgedRevision == imported.revision)
        await #expect(throws: LearningStoreError.self) { try await target.acknowledgeBackup(profileID: "other", revision: imported.revision + 1) }
        let reopened = store(b)
        #expect(try await reopened.exportBackup(profileID: "other").payload == again.payload)
    }
    @Test func malformedBatchDoesNotMutateAndRestoreCannotReplaceNonemptyProfile() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root)
        let initial = try await target.open(plan: plan(), preferences: .fresh, writerID: UUID())
        _ = try await target.apply(command(initial, .resume))
        let before = try await target.inspect(profileID: "guest")
        await #expect(throws: LearningError.self) { try await target.mergeBackup(Data("{}".utf8), profileID: "guest") }
        #expect(try await target.inspect(profileID: "guest") == before)
        let empty = try LearningBackupCodec.encode(.empty)
        await #expect(throws: LearningStoreError.self) { try await target.restoreIntoEmptyProfile(empty, profileID: "guest") }
        #expect(try await target.inspect(profileID: "guest") == before)
    }
    @Test func activeWriterKeepsPinnedPredecessor() async throws {
        let a = try temporaryRoot(), b = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: a); try? FileManager.default.removeItem(at: b) }
        let local = store(a), remote = SQLiteLearningStore(root: b, now: { Date(timeIntervalSince1970: 1_890_467_200) })
        let initial = try await local.open(plan: plan(run: "local"), preferences: .fresh, writerID: UUID())
        let localSpeaking = try await speaking(local, initial)
        let remoteInitial = try await remote.open(plan: plan(run: "remote"), preferences: .fresh, writerID: UUID())
        _ = try await remote.apply(command(remoteInitial, .resume))
        let incoming = try await remote.exportBackup(profileID: "guest")
        _ = try await local.mergeBackup(incoming.payload, profileID: "guest")
        let paused = try await local.apply(command(localSpeaking, .pause)).snapshot
        let exported = try LearningBackupCodec.decode(await local.exportBackup(profileID: "guest").payload)
        #expect(try exported.checkpoint(for: plan())?.plan.runID == "remote")
        let resumed = try await local.apply(command(paused, .resume)).snapshot
        let confirmed = try await local.apply(command(resumed, .confirm))
        #expect(confirmed.earnedXP == 3)
        #expect(confirmed.snapshot.session.plan.runID == "local")
        #expect(try await local.readProgress(scope: plan().scope, today: StudyDay("2026-09-27")).xp == 3)
    }
    @Test func failedImportRollsBackAndOldResumeCannotLowerEvidence() async throws {
        let a = try temporaryRoot(), b = try temporaryRoot()
        defer { try? FileManager.default.removeItem(at: a); try? FileManager.default.removeItem(at: b) }
        let source = store(a), target = store(b)
        let initial = try await source.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let ended = try await speaking(source, initial)
        let older = try await source.exportBackup(profileID: "guest")
        _ = try await source.apply(command(ended, .confirm))
        let newer = try await source.exportBackup(profileID: "guest")
        _ = try await target.exportBackup(profileID: "guest")
        let before = try await target.inspect(profileID: "guest")
        try await target.installFault(profileID: "guest", boundary: "beforeCommit")
        await #expect(throws: LearningStoreError.self) { try await target.mergeBackup(newer.payload, profileID: "guest") }
        #expect(try await target.inspect(profileID: "guest") == before)
        try await target.clearFault(profileID: "guest", boundary: "beforeCommit")
        let restored = try await target.mergeBackup(newer.payload, profileID: "guest")
        let merged = try await target.mergeBackup(older.payload, profileID: "guest")
        #expect(merged.revision == restored.revision)
        #expect(try await target.readProgress(scope: plan().scope, today: StudyDay("2026-09-27")).xp == 3)
    }
    @Test func resetGenerationCannotCrossOrdinaryMerge() async throws {
        let a = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: a) }
        let target = store(a)
        let empty = try LearningBackupCodec.encode(.empty)
        let progress = try JSONSerialization.jsonObject(with: empty)
        let envelope = try JSONSerialization.data(withJSONObject: ["version": 5, "generation": "d6e43a28-c2dd-4f64-9c83-b51cf38c45ea", "progress": progress])
        _ = try await target.restoreIntoEmptyProfile(envelope, profileID: "guest")
        let before = try await target.inspect(profileID: "guest")
        await #expect(throws: LearningError.self) { try await target.mergeBackup(empty, profileID: "guest") }
        #expect(try await target.inspect(profileID: "guest") == before)
    }
}
