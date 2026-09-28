import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import AppFoundation

actor FailingStore: LearningStore {
    func readLanguageProgress(profileID: String, language: String, today: StudyDay) async throws -> LanguageStudyProgress {
        try await underlying.readLanguageProgress(profileID: profileID, language: language, today: today)
    }
    func readCheckpoint(plan: LearningPlan) async throws -> LearningSession? { try await underlying.readCheckpoint(plan: plan) }
    let underlying: SQLiteLearningStore
    var failure = false
    var lostReply = false
    var gate: CheckedContinuation<Void, Never>?
    var suspend = false
    var entered = false
    var failResume = false
    var loseResumeReply = false
    var failPause = false
    var failPreferences = false
    func failNextPreferences() { failPreferences = true }
    init(root: URL) { underlying = SQLiteLearningStore(root: root) }
    func failNext(afterCommit: Bool = false) { failure = !afterCommit; lostReply = afterCommit }
    func suspendNext() { suspend = true }
    func failNextResume(afterCommit: Bool = false) { failResume = !afterCommit; loseResumeReply = afterCommit }
    func failNextPause() { failPause = true }
    func release() { gate?.resume(); gate = nil }
    func open(plan: LearningPlan, preferences: LearningPreferences, writerID: UUID) async throws -> LearningSnapshot { try await underlying.open(plan: plan, preferences: preferences, writerID: writerID) }
    func apply(_ command: LearningCommand) async throws -> CommitReceipt {
        if suspend { suspend = false; entered = true; await withCheckedContinuation { gate = $0 } }
        if failure { failure = false; throw LearningStoreError.injectedFailure }
        if failResume && command.event == .resume { failResume = false; throw LearningStoreError.injectedFailure }
        if failPause && command.event == .pause { failPause = false; throw LearningStoreError.injectedFailure }
        let result = try await underlying.apply(command)
        if loseResumeReply && command.event == .resume { loseResumeReply = false; throw LearningStoreError.injectedFailure }
        if lostReply { lostReply = false; throw LearningStoreError.injectedFailure }
        return result
    }
    func readProgress(scope: LearningScope, today: StudyDay) async throws -> LearningProgress { try await underlying.readProgress(scope: scope, today: today) }
    func preferences(profileID: String) async throws -> ProfilePreferences { try await underlying.preferences(profileID: profileID) }
    func savePreferences(_ value: ProfilePreferences, profileID: String) async throws -> Int64 {
        if failPreferences { failPreferences = false; throw LearningStoreError.injectedFailure }
        return try await underlying.savePreferences(value, profileID: profileID)
    }
    func revoke(profileID: String) async { await underlying.revoke(profileID: profileID) }
    func revoke(writerID: UUID) async { await underlying.revoke(writerID: writerID) }
    func exportBackup(profileID: String) async throws -> BackupSnapshot { try await underlying.exportBackup(profileID: profileID) }
    func mergeBackup(_ data: Data, profileID: String) async throws -> BackupSnapshot { try await underlying.mergeBackup(data, profileID: profileID) }
    func restoreIntoEmptyProfile(_ data: Data, profileID: String) async throws -> BackupSnapshot { try await underlying.restoreIntoEmptyProfile(data, profileID: profileID) }
    func acknowledgeBackup(profileID: String, revision: Int64) async throws { try await underlying.acknowledgeBackup(profileID: profileID, revision: revision) }
}
func syntheticPlan(run: String = "synthetic-run") throws -> LearningPlan {
    try .make(scope: LearningScope(profileID: "probe", packageKey: "sample-v1", language: "english", book: "sample", stage: 11),
              runID: run, sources: [LearningSource(index: 0, text: "Hello.", translation: "안녕.")], groupSize: 2)
}
func command(_ snapshot: LearningSnapshot, _ event: LearningEvent) -> LearningCommand {
    LearningCommand(handle: snapshot.handle, id: UUID(), expectedVersion: snapshot.writerVersion, event: event)
}
@Suite struct LearningControllerTests {
    @Test func deactivationRevokesOnlyItsOwnedWriter() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root), plan = try syntheticPlan()
        let first = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        let old = LearningController(store: store, snapshot: first)
        let next = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        await old.deactivate()
        let replacement = LearningController(store: store, snapshot: next)
        #expect(!(await replacement.send(command(next, .resume))).saveFailed)
    }
    @Test func failedAutomaticContinuationKeepsConfirmationAndRetryPaused() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root)
        let plan = try LearningPlan.make(scope: LearningScope(profileID: "probe", packageKey: "sample-v1", language: "english", book: "sample", stage: 1), runID: "auto-retry", sources: syntheticPlan().sources, groupSize: 2)
        let initial = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let running = await controller.send(command(initial, .resume))
        let token = try #require(running.requests.first).token
        let ended = await controller.receive(LearningCallback(token: token, event: .playbackEnded))
        await store.failNextResume()
        let failed = await controller.send(command(ended.snapshot, .confirm))
        #expect(failed.saveFailed && failed.paused && failed.snapshot.progress.xp == 1)
        #expect(failed.snapshot.session.current.confirmed == 1)
        let retry = await controller.retrySave()
        #expect(!retry.saveFailed && retry.paused && retry.snapshot.progress.xp == 1)
        #expect(retry.requests.allSatisfy { $0.intent == .stop })
    }
    @Test func successfulConfirmRepeatAndNextEmitTransportOnlyAfterSave() async throws {
        for stage in [1, 11] {
            let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: root) }
            let store = FailingStore(root: root)
            let plan = try LearningPlan.make(scope: LearningScope(profileID: "probe", packageKey: "sample-v1", language: "english", book: "sample", stage: stage), runID: "chain", sources: [
                LearningSource(index: 0, text: "Hello.", translation: "안녕."), LearningSource(index: 1, text: "Next.", translation: "다음.")], groupSize: 2)
            let initial = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
            let controller = LearningController(store: store, snapshot: initial)
            var running = await controller.send(command(initial, .resume))
            func end(_ state: LearningControllerState) async throws -> LearningControllerState {
                let token = try #require(state.requests.last(where: { $0.intent != .stop })).token
                return await controller.receive(LearningCallback(token: token, event: .playbackEnded))
            }
            if stage == 11 {
                let ended = try await end(running)
                running = await controller.send(command(ended.snapshot, .confirm))
                #expect(running.snapshot.progress.xp == 3 && running.snapshot.session.unit == 1)
                #expect(running.snapshot.session.running)
                #expect(running.requests.contains { if case .reveal = $0.intent { true } else { false } })
            } else {
                for _ in 0..<2 {
                    let ended = try await end(running)
                    running = await controller.send(command(ended.snapshot, .confirm))
                    #expect(running.snapshot.session.running)
                    #expect(running.requests.last?.intent.delayMilliseconds == 0)
                }
                let third = try await end(running)
                running = await controller.send(command(third.snapshot, .repeat))
                #expect(running.snapshot.session.current.planned == 5 && running.snapshot.session.running)
                let fourth = try await end(running)
                running = await controller.send(command(fourth.snapshot, .confirm))
                let fifth = try await end(running)
                let next = await controller.send(command(fifth.snapshot, .next))
                #expect(next.snapshot.progress.xp == 5 && next.snapshot.session.unit == 1)
                #expect(next.requests.last?.intent.delayMilliseconds == 1000)
            }
        }
    }
    @Test func playbackEndDuringPositionCommitIsDrainedExactlyOnce() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root)
        let initial = try await store.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let running = await controller.send(command(initial, .resume))
        let token = try #require(running.requests.first).token
        await store.suspendNext()
        let position = Task { await controller.receive(LearningCallback(token: token, event: .position(0.5))) }
        while !(await store.entered) { await Task.yield() }
        _ = await controller.receive(LearningCallback(token: token, event: .playbackEnded))
        _ = await controller.receive(LearningCallback(token: token, event: .playbackEnded))
        await store.release()
        let ended = await position.value
        #expect(ended.snapshot.session.phase == .speaking)
        #expect(ended.snapshot.progress.xp == 0)
        #expect(ended.requests.filter { $0.intent == .stop }.count == 1)
        #expect(await controller.receive(LearningCallback(token: token, event: .playbackEnded)).snapshot == ended.snapshot)
    }
    @Test func remoteResumeDoesNotReplaceActivePredecessor() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let local = SQLiteLearningStore(root: root.appending(path: "local"))
        let remote = SQLiteLearningStore(root: root.appending(path: "remote"), now: { Date(timeIntervalSince1970: 1_990_467_200) })
        let initial = try await local.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: local, snapshot: initial)
        let running = await controller.send(command(initial, .resume))
        let token = try #require(running.requests.first).token
        let ended = await controller.receive(LearningCallback(token: token, event: .playbackEnded))
        let remoteInitial = try await remote.open(plan: syntheticPlan(run: "remote"), preferences: .fresh, writerID: UUID())
        _ = try await remote.apply(command(remoteInitial, .resume))
        _ = try await local.mergeBackup(remote.exportBackup(profileID: "probe").payload, profileID: "probe")
        #expect(await controller.state.snapshot == ended.snapshot)
        let saved = await controller.send(command(ended.snapshot, .confirm))
        #expect(!saved.saveFailed && saved.snapshot.progress.xp == 3)
        #expect(saved.snapshot.session.plan.runID == "synthetic-run")
    }
    @Test func replacedTransportAndProfileTokensCannotAdvance() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root), p = try syntheticPlan()
        let initial = try await store.open(plan: p, preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let first = await controller.send(command(initial, .resume))
        let old = try #require(first.requests.first).token
        let paused = await controller.send(command(first.snapshot, .pause))
        let resumed = await controller.send(command(paused.snapshot, .resume))
        let current = try #require(resumed.requests.first).token
        #expect(old != current)
        #expect(await controller.receive(LearningCallback(token: old, event: .playbackEnded)).snapshot == resumed.snapshot)
        let ended = await controller.receive(LearningCallback(token: current, event: .playbackEnded))
        #expect(ended.snapshot.session.phase == .speaking && ended.snapshot.progress.xp == 0)
        await controller.deactivate()
        let reopened = try await store.open(plan: p, preferences: .fresh, writerID: UUID())
        let replacement = LearningController(store: store, snapshot: reopened)
        #expect(await replacement.receive(LearningCallback(token: current, event: .playbackEnded)).snapshot == reopened)
    }
    @Test func failedSavePublishesNoRewardAndBlocksNextAction() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root), plan = try syntheticPlan()
        let initial = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let resumed = await controller.send(command(initial, .resume))
        let request = try #require(resumed.requests.first)
        let ended = await controller.receive(LearningCallback(token: request.token, event: .playbackEnded))
        await store.failNext()
        let failed = await controller.send(command(ended.snapshot, .confirm))
        #expect(failed.saveFailed && failed.paused)
        #expect(failed.snapshot.progress.xp == 0)
        #expect(failed.snapshot.session.current.confirmed == 0)
        let blocked = await controller.send(command(failed.snapshot, .next))
        #expect(blocked.snapshot == failed.snapshot)
        let retried = await controller.retrySave()
        #expect(!retried.saveFailed && retried.paused)
        #expect(retried.snapshot.progress.xp == 3 && retried.snapshot.session.current.confirmed == 1)
        #expect(retried.requests.allSatisfy { $0.intent == .stop })
        #expect(await controller.retrySave().snapshot.progress.xp == 3)
    }
    @Test func positionSaveDoesNotInvalidateCurrentTransport() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root)
        let initial = try await store.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let running = await controller.send(command(initial, .resume)), token = try #require(running.requests.first).token
        _ = await controller.receive(LearningCallback(token: token, event: .position(0.1)))
        let second = await controller.receive(LearningCallback(token: token, event: .position(0.2)))
        #expect(second.snapshot.session.positionSeconds == 0.2)
        let ended = await controller.receive(LearningCallback(token: token, event: .playbackEnded))
        #expect(ended.snapshot.session.phase == .speaking)
        _ = await controller.send(command(ended.snapshot, .pause))
        let ignored = await controller.receive(LearningCallback(token: token, event: .playbackEnded))
        #expect(ignored.paused && ignored.snapshot.progress.xp == 0)
    }
    @Test func retryAfterLostReplyDoesNotAutoplay() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root)
        let initial = try await store.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        await store.failNext(afterCommit: true)
        #expect(await controller.send(command(initial, .resume)).saveFailed)
        let retried = await controller.retrySave()
        #expect(retried.paused && !retried.snapshot.session.running && !retried.saveFailed)
        #expect(retried.snapshot.progress.xp == 0 && retried.requests.allSatisfy { $0.intent == .stop })
    }
    @Test func deactivationDiscardsLateReply() async throws {
        let root = FileManager.default.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root)
        let initial = try await store.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        await store.suspendNext()
        let operation = Task { await controller.send(command(initial, .resume)) }
        while !(await store.entered) { await Task.yield() }
        await controller.deactivate(); await store.release()
        let result = await operation.value
        #expect(!result.active && result.snapshot == initial && result.paused)
    }
}
