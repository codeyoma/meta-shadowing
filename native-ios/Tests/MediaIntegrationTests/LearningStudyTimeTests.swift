import AppFoundation
import Foundation
import LearningDomain
import LearningPersistence
import Synchronization
import Testing
@testable import MetaShadowingNative

@MainActor @Suite(.serialized) struct LearningStudyTimeTests {
    @Test func preparationNeverCountsUntilPresented() async throws {
        let fixture = try TimeFixture()
        defer { fixture.remove() }
        await fixture.flow.open(packageKey: "ui-fixture-v1", stage: 11, startWhenPresented: true)
        fixture.clock.advance(.seconds(30))
        fixture.flow.setStudyPresentation(visible: true, active: true)
        await fixture.flow.startPresentedLesson()
        fixture.clock.advance(.seconds(4))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        await fixture.flow.close()
        #expect(try await fixture.total() == 4_000)
    }

    @Test(arguments: [("audio", 1), ("video", 7), ("audio", 11)])
    func pausedAudioVideoAndSilentCount(mode: String, stage: Int) async throws {
        let fixture = try TimeFixture(mode: mode)
        defer { fixture.remove() }
        try await fixture.present(stage: stage)
        _ = await fixture.flow.runtime?.coordinator.perform(.pause)
        fixture.clock.advance(.seconds(7))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 7_000)
        #expect(fixture.flow.runtime?.controls.xp == 0)
        await fixture.flow.close()
    }

    @Test func allOptionRoutesAndDictionaryExcludeTheirPendingAndVisibleTime() async throws {
        let fixture = try TimeFixture(mode: "video")
        defer { fixture.remove() }
        try await fixture.present(stage: 7)
        for route in [LearningOptionRoute.menu, .rate, .group, .typography, .fullscreenTypography,
                      .guide, .sentences, .analysis, .display, .revealSpeed, .revealPresets] {
            fixture.clock.advance(.seconds(1))
            await fixture.flow.presentOptions(route)
            fixture.clock.advance(.seconds(20))
            fixture.flow.dismissOptions()
        }
        await fixture.store.holdNextPause()
        fixture.clock.advance(.seconds(1))
        let dictionary = Task { await fixture.flow.lookupPlayer(term: "Secret", permitsWord: { true }) }
        while !(await fixture.store.entered) { await Task.yield() }
        fixture.clock.advance(.seconds(30))
        fixture.flow.playerDictionary.cancel()
        await fixture.store.release()
        await dictionary.value
        fixture.flow.dictionarySettled()
        fixture.clock.advance(.seconds(1))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 13_000)
        await fixture.flow.close()
    }

    @Test func cancelledPendingPopoverRestoresEligibilityOnce() async throws {
        let fixture = try TimeFixture(mode: "video")
        defer { fixture.remove() }
        try await fixture.present(stage: 7)
        fixture.clock.advance(.seconds(2))
        await fixture.store.holdNextPause()
        let opening = Task { await fixture.flow.presentOptions(.rate, asPopover: true) }
        while !(await fixture.store.entered) { await Task.yield() }
        fixture.clock.advance(.seconds(20))
        fixture.flow.dismissOptions()
        fixture.clock.advance(.seconds(2))
        await fixture.store.release()
        await opening.value
        fixture.clock.advance(.seconds(2))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 4_000)
        #expect(fixture.flow.options == nil)
        await fixture.flow.close()
    }

    @Test func rotationDoesNotRestartVisit() async throws {
        let fixture = try TimeFixture(mode: "video")
        defer { fixture.remove() }
        try await fixture.present(stage: 1)
        fixture.clock.advance(.seconds(3))
        fixture.flow.setStudyPresentation(visible: true, active: true)
        await fixture.flow.startPresentedLesson()
        fixture.clock.advance(.seconds(4))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 7_000)
        await fixture.flow.close()
    }

    @Test func regroupedLessonRetainsItsTimeVisitAndCanExit() async throws {
        let fixture = try TimeFixture(mode: "video")
        defer { fixture.remove() }
        try await fixture.present(stage: 7)
        fixture.clock.advance(.seconds(2))
        await fixture.flow.presentOptions(.group, asPopover: true)
        let runtime = try #require(fixture.flow.runtime)
        let edited = await runtime.coordinator.editWhilePaused(.regroup(size: 3, newPlanID: UUID().uuidString))
        #expect(!edited.controller.saveFailed)
        fixture.clock.advance(.seconds(30))
        fixture.flow.dismissOptions()
        fixture.clock.advance(.seconds(3))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 5_000)
        #expect(runtime.controls.xp == 0)
        await fixture.flow.close()
    }

    @Test func backgroundReturnDoesNotResumeMedia() async throws {
        let fixture = try TimeFixture()
        defer { fixture.remove() }
        try await fixture.present(stage: 11)
        fixture.clock.advance(.seconds(3))
        fixture.flow.setStudyPresentation(visible: true, active: false)
        fixture.flow.suspend()
        try await waitForMedia { fixture.flow.runtime?.state.controller.paused == true }
        fixture.clock.advance(.seconds(80))
        fixture.flow.setStudyPresentation(visible: true, active: true)
        fixture.clock.advance(.seconds(2))
        #expect(fixture.flow.runtime?.state.controller.paused == true)
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 5_000)
        await fixture.flow.close()
    }

    @Test(arguments: [false, true])
    func failedFinalSaveBlocksExitUntilRetryOrExplicitDiscard(discard: Bool) async throws {
        let fixture = try TimeFixture()
        defer { fixture.remove() }
        try await fixture.present(stage: 11)
        fixture.clock.advance(.seconds(4))
        await fixture.store.setTimeFailure(true)
        #expect(!(await fixture.flow.requestStudyExit(discardUnsaved: false)))
        #expect(fixture.flow.studyTime?.saveFailed == true)
        #expect(fixture.flow.runtime?.controls.active == true)
        fixture.clock.advance(.seconds(50))
        await fixture.store.setTimeFailure(false)
        if discard { #expect(await fixture.flow.requestStudyExit(discardUnsaved: true)) }
        else { #expect(await fixture.flow.retryStudyTime()) }
        await fixture.flow.close()
        #expect(try await fixture.total() == (discard ? 0 : 4_000))
    }

    @Test func completionAndAccessLossStopTime() async throws {
        let fixture = try TimeFixture()
        defer { fixture.remove() }
        try await fixture.present(stage: 11)
        let runtime = try #require(fixture.flow.runtime)
        fixture.clock.advance(.seconds(3))
        for _ in 0..<2 {
            _ = await runtime.coordinator.perform(.resume)
            _ = await runtime.coordinator.perform(.playbackEnded)
            _ = await runtime.coordinator.perform(.confirm)
        }
        #expect(runtime.controls.session.phase == .complete)
        fixture.clock.advance(.seconds(50))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 3_000)
        await fixture.flow.close()

        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root.appending(path: "store")), catalog = RevocableReferenceCatalog(root: root)
        let clock = FlowStudyClock()
        let flow = LearningFlow(workspace: ProductWorkspace(store: store, catalog: catalog, profileID: "study-time"), studyClock: clock)
        await flow.open(packageKey: "ui-fixture-v1", stage: 11, startWhenPresented: true)
        flow.setStudyPresentation(visible: true, active: true)
        await flow.startPresentedLesson()
        clock.advance(.seconds(4))
        await catalog.revoke()
        try await waitForMedia { flow.accessInvalidated }
        clock.advance(.seconds(50))
        await flow.close()
        #expect(try await store.readStudyTime(profileID: "study-time", language: "english", book: "ui-fixture") == 4_000)
    }

    @Test(arguments: [false, true])
    func failedCheckpointExitAllowsTimeAfterRecovery(serviceBoundary: Bool) async throws {
        let fixture = try TimeFixture()
        defer { fixture.remove() }
        try await fixture.present(stage: 11)
        let runtime = try #require(fixture.flow.runtime)
        fixture.clock.advance(.seconds(2))
        await fixture.store.failNextPause()
        if serviceBoundary {
            await #expect(throws: ProductError.busy) { try await fixture.flow.prepareServiceBoundary() }
        } else {
            #expect(!(await fixture.flow.requestStudyExit(discardUnsaved: false)))
        }
        #expect(runtime.controls.saveFailed)
        #expect(!fixture.flow.studyExitPending)
        fixture.clock.advance(.seconds(20))
        #expect(!(await fixture.flow.requestStudyExit(discardUnsaved: true)),
                "Discarding time must not bypass a failed learning checkpoint")
        #expect(!fixture.flow.studyExitPending)
        _ = await runtime.coordinator.retrySave()
        #expect(!runtime.controls.saveFailed)
        fixture.flow.dismissOptions()
        fixture.clock.advance(.seconds(3))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 5_000)
        #expect(runtime.controls.xp == 0)
        await fixture.flow.close()
    }

    @Test func oldDismissalCannotCloseReplacementRecorder() async throws {
        let first = try TimeFixture(), second = try TimeFixture()
        defer { first.remove(); second.remove() }
        try await first.present(stage: 11)
        first.clock.advance(.seconds(2))
        #expect(await first.flow.requestStudyExit(discardUnsaved: false))
        try await second.present(stage: 11)
        second.clock.advance(.seconds(3))
        await first.flow.close()
        second.clock.advance(.seconds(4))
        #expect(await second.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await first.total() == 2_000)
        #expect(try await second.total() == 7_000)
        await second.flow.close()
    }
    @Test func visibleDictionaryStopsTimeUntilDismissedWithoutResumingMedia() async throws {
        let presenter = HeldStudyDictionary()
        let fixture = try TimeFixture(dictionary: presenter)
        defer { fixture.remove() }
        try await fixture.present(stage: 11)
        fixture.clock.advance(.seconds(2))
        await fixture.flow.lookupPlayer(term: "Secret", permitsWord: { true })
        #expect(fixture.flow.playerDictionary.busy && presenter.visible)
        fixture.clock.advance(.seconds(30))
        presenter.dismissCurrent()
        fixture.flow.dictionarySettled()
        fixture.clock.advance(.seconds(3))
        #expect(await fixture.flow.requestStudyExit(discardUnsaved: false))
        #expect(try await fixture.total() == 5_000)
        #expect(fixture.flow.runtime?.state.controller.paused == true)
        #expect(fixture.flow.runtime?.controls.xp == 0)
        await fixture.flow.close()
    }
}

@MainActor private struct TimeFixture {
    let root: URL
    let store: DeferredPopoverPauseStore
    let clock = FlowStudyClock()
    let flow: LearningFlow
    init(mode: String = "audio", dictionary: (any DictionaryPresenting)? = nil) throws {
        root = try MediaFixtureFactory.root()
        store = DeferredPopoverPauseStore(root: root.appending(path: "store"))
        flow = LearningFlow(workspace: ProductWorkspace(store: store,
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: mode), profileID: "study-time"), studyClock: clock,
            playerDictionaryPresenter: dictionary)
    }
    func present(stage: Int) async throws {
        await flow.open(packageKey: "ui-fixture-v1", stage: stage, startWhenPresented: true)
        _ = try #require(flow.runtime)
        flow.setStudyPresentation(visible: true, active: true)
        await flow.startPresentedLesson()
    }
    func total() async throws -> Int64 {
        try await store.readStudyTime(profileID: "study-time", language: "english", book: "ui-fixture")
    }
    func remove() { try? FileManager.default.removeItem(at: root) }
}

@MainActor private final class HeldStudyDictionary: DictionaryPresenting {
    private var completion: (@MainActor (Result<Void, any Error>) -> Void)?
    var visible: Bool { completion != nil }
    func present(id: UUID, term: String, completion: @escaping @MainActor (Result<Void, any Error>) -> Void) {
        self.completion = completion
    }
    func dismiss(id: UUID) { dismissCurrent() }
    func dismissCurrent() { let done = completion; completion = nil; done?(.success(())) }
}

private final class FlowStudyClock: StudyTimeClock, Sendable {
    private let value = Mutex<Duration>(.zero)
    func now() -> Duration { value.withLock { $0 } }
    func advance(_ amount: Duration) { value.withLock { $0 += amount } }
    func sleep(for duration: Duration) async throws { try await ContinuousClock().sleep(for: duration) }
}
