import Foundation
import Testing
import LearningDomain
import LearningPersistence
@testable import AppFoundation

struct CommittedFeedbackTests {
    @Test(arguments: [false, true]) func importedXPCannotInflateCommandReceipt(lostReply: Bool) async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root.appending(path: "local"))
        let plan = try LearningPlan.make(scope: LearningScope(profileID: "probe", packageKey: "sample-v1", language: "english", book: "sample", stage: 1),
            runID: "local", sources: syntheticPlan().sources, groupSize: 2)
        let initial = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let running = await controller.send(command(initial, .resume))
        let ended = try await controller.receive(.init(token: #require(running.requests.first).token, event: .playbackEnded))

        let remoteStore = SQLiteLearningStore(root: root.appending(path: "remote"))
        let remotePlan = try LearningPlan.make(scope: LearningScope(profileID: "probe", packageKey: "other-v1", language: "english", book: "other", stage: 11),
            runID: "remote", sources: syntheticPlan().sources, groupSize: 2)
        let remote = LearningController(store: remoteStore, snapshot: try await remoteStore.open(plan: remotePlan, preferences: .fresh, writerID: UUID()))
        let remoteRunning = await remote.send(command(await remote.state.snapshot, .resume))
        let remoteEnded = try await remote.receive(.init(token: #require(remoteRunning.requests.first).token, event: .playbackEnded))
        _ = await remote.send(command(remoteEnded.snapshot, .confirm))
        let imported = try await remoteStore.exportBackup(profileID: "probe")
        _ = try await store.mergeBackup(imported.payload, profileID: "probe")

        let confirmation = command(ended.snapshot, .confirm)
        if lostReply { await store.failNext(afterCommit: true) }
        var saved = await controller.send(confirmation)
        if lostReply {
            #expect(saved.saveFailed && saved.feedback.isEmpty)
            saved = await controller.retrySave()
        }
        #expect(!saved.saveFailed)
        #expect(saved.snapshot.progress.xp == 4)
        #expect(saved.feedback.first?.xpAward == 1)
        #expect(await controller.send(confirmation).feedback.isEmpty)
    }
    @Test func completionReceiptCarriesOnlyCommittedXPAcrossRetryAndReopen() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root)
        let initial = try await store.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let running = await controller.send(command(initial, .resume))
        let ended = try await controller.receive(.init(token: #require(running.requests.first).token, event: .playbackEnded))
        let confirm = command(ended.snapshot, .confirm)
        await store.failNext(afterCommit: true)
        #expect(await controller.send(confirm).feedback.isEmpty)
        let saved = await controller.retrySave()
        let receipt = try #require(saved.feedback.first)
        #expect(receipt.xpAward == 3)
        #expect(receipt.completedRun)
        #expect(await controller.send(confirm).feedback.isEmpty)
        await controller.deactivate()
        let reopened = try await store.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        #expect(reopened.progress.xp == 3)
        #expect(await LearningController(store: store, snapshot: reopened).state.feedback.isEmpty)
    }
    @Test func confirmedThirdCycleRepeatEmitsButNextOnlyReportsCompletion() async throws {
        for repeatChoice in [true, false] {
            let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
            defer { try? FileManager.default.removeItem(at: root) }
            let store = FailingStore(root: root)
            let plan = try LearningPlan.make(scope: LearningScope(profileID: "probe", packageKey: "sample-v1", language: "english", book: "sample", stage: 1), runID: "choices", sources: syntheticPlan().sources, groupSize: 2)
            let initial = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
            let controller = LearningController(store: store, snapshot: initial)
            var state = await controller.send(command(initial, .resume))
            for cycle in 1...3 {
                let token = try #require(state.requests.last(where: { $0.intent != .stop })).token
                state = await controller.receive(.init(token: token, event: .playbackEnded))
                state = await controller.send(command(state.snapshot, .confirm))
                #expect(state.feedback.map(\.kind) == [.cycle(cycle)])
            }
            let choice = command(state.snapshot, repeatChoice ? .repeat : .next)
            state = await controller.send(choice)
            #expect(state.feedback == [repeatChoice ? .init(commandID: choice.id, kind: .repeatChoice)
                : .init(commandID: choice.id, kind: .completion, completedRun: true)])
        }
    }

    @Test func confirmationFeedbackDoesNotDependOnAggregateXP() throws {
        let plan = try syntheticPlan()
        let initial = try LearningSession.start(plan: plan, preferences: .fresh)
        let playing = try LearningReducer.reduce(initial, event: .resume).session
        let speaking = try LearningReducer.reduce(playing, event: .playbackEnded).session
        let confirmed = try LearningReducer.reduce(speaking, event: .confirm).session
        let handle = LearningHandle(writerID: UUID(), scope: plan.scope, planID: plan.runID)
        let saturated = try LearningProgress(xp: LevelProgress.maximumXP, streak: 0, completedRuns: [:])
        let before = LearningSnapshot(handle: handle, writerVersion: 2, session: speaking, progress: saturated)
        let after = LearningSnapshot(handle: handle, writerVersion: 3, session: confirmed, progress: saturated)
        let action = command(before, .confirm)
        #expect(before.progress.xp == after.progress.xp)
        let receipt = CommitReceipt(snapshot: after, backupRevision: 3, earnedXP: 0, disposition: .applied)
        let feedback = try #require(CommittedLearningFeedback.observed(command: action, before: before, after: receipt))
        #expect(feedback.kind == .cycle(1))
        #expect(feedback.xpAward == 0)
    }

    @Test(arguments: [false, true]) func successfulRetryEmitsOnce(lostReply: Bool) async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root)
        let initial = try await store.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        #expect(await controller.state.feedback.isEmpty)
        let running = await controller.send(command(initial, .resume))
        let ended = try await controller.receive(.init(token: #require(running.requests.first).token, event: .playbackEnded))
        #expect(ended.feedback.isEmpty)
        let confirm = command(ended.snapshot, .confirm)
        await store.failNext(afterCommit: lostReply)
        let failed = await controller.send(confirm)
        #expect(failed.saveFailed && failed.feedback.isEmpty)
        let saved = await controller.retrySave()
        #expect(saved.feedback == [.init(commandID: confirm.id, kind: .cycle(1), xpAward: 3, completedRun: true)])
        #expect(await controller.retrySave().feedback.isEmpty)
        #expect(await controller.send(confirm).feedback.isEmpty)
        #expect(await controller.state.feedback.isEmpty)
        await controller.deactivate()
        let reopened = try await store.open(plan: syntheticPlan(), preferences: .fresh, writerID: UUID())
        #expect(await LearningController(store: store, snapshot: reopened).state.feedback.isEmpty)
    }

    @Test func recoveryPauseFailureRetainsUnemittedFeedback() async throws {
        try await continuationFailure(recoveryPauseFails: true)
    }
    @Test func failedContinuationRetainsOriginalFeedback() async throws {
        try await continuationFailure(recoveryPauseFails: false)
    }
    private func continuationFailure(recoveryPauseFails: Bool) async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = FailingStore(root: root)
        let plan = try LearningPlan.make(scope: LearningScope(profileID: "probe", packageKey: "sample-v1", language: "english", book: "sample", stage: 1), runID: "feedback", sources: syntheticPlan().sources, groupSize: 2)
        let initial = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: initial)
        let running = await controller.send(command(initial, .resume))
        let ended = try await controller.receive(.init(token: #require(running.requests.first).token, event: .playbackEnded))
        let confirm = command(ended.snapshot, .confirm)
        if recoveryPauseFails { await store.failNextResume(afterCommit: true); await store.failNextPause() }
        else { await store.failNextResume() }
        #expect(await controller.send(confirm).feedback.isEmpty)
        if recoveryPauseFails {
            let failedPause = await controller.retrySave()
            #expect(failedPause.saveFailed && failedPause.feedback.isEmpty)
        }
        let saved = await controller.retrySave()
        #expect(saved.paused && !saved.saveFailed)
        #expect(saved.feedback == [.init(commandID: confirm.id, kind: .cycle(1), xpAward: 1)])
        #expect(await controller.retrySave().feedback.isEmpty)
    }
}
