import Foundation
import LearningDomain
import Testing
@testable import LearningPersistence

struct ServiceStorageTests {
    @Test(arguments: [ProfilePreferences(), ProfilePreferences(libraryLanguage: "french")])
    func unchangedPreferencesDoNotEmitRevisionEvents(value: ProfilePreferences) async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root)
        let revision = try await target.savePreferences(value, profileID: "local")
        var changes = try await target.backupChanges(profileID: "local").makeAsyncIterator()
        #expect(await changes.next() == revision)
        let before = try await target.exportBackup(profileID: "local")
        #expect(try await target.savePreferences(value, profileID: "local") == revision)
        #expect(try await target.exportBackup(profileID: "local") == before)
        await target.finishTestRevisionObservation()
        #expect(await changes.next() == nil)
    }
    @Test func revisionSignalOnlyFollowsCommittedChanges() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root)
        var changes = try await target.backupChanges(profileID: "local").makeAsyncIterator()
        #expect(await changes.next() == 0)
        _ = try await target.savePreferences(.init(libraryLanguage: "french"), profileID: "local")
        #expect(await changes.next() == 1)
        #expect(try await target.exportBackup(profileID: "local").revision == 1)
    }
    @Test func obsoleteServiceCannotMergeOrAcknowledgeAfterReplacement() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let target = store(root)
        let old = try await target.activateService(scope: "account-a")
        let replacement = try await target.activateService(scope: "account-a")
        let before = try await target.exportServiceBackup(replacement)
        await #expect(throws: LearningStoreError.staleWriter) { try await target.mergeBackups([LearningBackupCodec.encode(.empty)], lease: old) }
        await #expect(throws: LearningStoreError.staleWriter) { try await target.acknowledgeService(old, revision: before.revision, baseToken: "stale") }
        #expect(try await target.exportServiceBackup(replacement) == before)
        #expect(try await target.serviceState(replacement).baseToken == "")
    }
    @Test func allCandidatesValidateBeforeOneAtomicMerge() async throws {
        let root = try temporaryRoot(); defer { try? FileManager.default.removeItem(at: root) }
        let source = store(root.appendingPathComponent("source")), target = store(root.appendingPathComponent("target"))
        let initial = try await source.open(plan: plan(), preferences: .fresh, writerID: UUID())
        let ended = try await speaking(source, initial)
        _ = try await source.apply(command(ended, .confirm))
        let payload = try await source.exportBackup(profileID: "guest").payload
        let before = try await target.exportBackup(profileID: "guest")
        await #expect(throws: (any Error).self) { try await target.mergeBackups([payload, Data("invalid".utf8)], profileID: "guest") }
        #expect(try await target.exportBackup(profileID: "guest") == before)
        let merged = try await target.mergeBackups([payload, payload], profileID: "guest")
        #expect(merged.revision == before.revision + 1)
        #expect(try await target.readProgress(scope: plan().scope, today: StudyDay("2026-09-27")).xp == 3)
        #expect(try await target.mergeBackups([payload], profileID: "guest").revision == merged.revision)
    }
}

private extension SQLiteLearningStore {
    func finishTestRevisionObservation() {
        for listener in revisionListeners["local"]?.values ?? [:].values { listener.finish() }
    }
}
