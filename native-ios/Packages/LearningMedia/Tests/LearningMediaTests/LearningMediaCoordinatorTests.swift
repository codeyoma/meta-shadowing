import Foundation
import Testing
import LearningDomain
import LearningPersistence
import AppFoundation
import LearningMedia

@MainActor final class PlatformTransportFixture: MediaTransport {
    var onEvent: (@MainActor (MediaTransportEvent) -> Void)?
    var request: PreparedMediaRequest?
    var playing = false
    var disposed = false
    var position = MediaPosition(seconds: 0, duration: 1)
    var gate: CheckedContinuation<Void, Never>?
    var suspendPreparation = false
    var failPreparation = false
    func prepare(_ request: PreparedMediaRequest) async throws {
        guard !disposed else { throw MediaFailure.cancelled }
        if failPreparation { throw MediaFailure.unavailable }
        self.request = request
        position = MediaPosition(seconds: request.positionSeconds, duration: 1)
        if suspendPreparation { await withCheckedContinuation { gate = $0 } }
    }
    func play(token: TransportToken) throws { playing = request?.token == token }
    @discardableResult func pause() -> MediaPosition? { playing = false; return position }
    func dispose() { playing = false; disposed = true; onEvent = nil }
    func send(_ kind: MediaTransportEvent.Kind) {
        if case .ended = kind { playing = false }
        if let request { onEvent?(.init(token: request.token, kind: kind)) }
    }
}

@MainActor func eventually(_ predicate: () -> Bool) async throws {
    let deadline = ContinuousClock.now + .seconds(2)
    while !predicate(), ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(1)) }
    try #require(predicate())
}

@MainActor struct MediaCoordinatorFixture {
    let root: URL
    let plan: LearningPlan
    let store: GatedLearningStore
    let controller: LearningController
    let driver: PlatformTransportFixture
    let coordinator: LearningMediaCoordinator

    init(stage: Int = 1, clock: MediaClock = .live,
         authorize: @escaping @Sendable (LearningScope) async -> Bool = { _ in true }) async throws {
        root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        let scope = try mediaScope(stage: stage)
        plan = try LearningPlan.make(scope: scope, runID: "media-run", sources: [
            .init(index: 0, text: "One", translation: "하나"), .init(index: 1, text: "Two", translation: "둘")], groupSize: 2)
        store = GatedLearningStore(root: root)
        let snapshot = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        controller = LearningController(store: store, snapshot: snapshot)
        driver = PlatformTransportFixture()
        let catalog = try MediaAssetCatalog(scope: scope, sourceCount: 2, root: root,
            sources: [.audio(file: root.appending(path: "one.wav")), .audio(file: root.appending(path: "two.wav"))])
        let driver = driver
        coordinator = LearningMediaCoordinator(controller: controller, initial: await controller.state, catalog: catalog,
            authorize: authorize, makeTransport: { _ in driver }, clock: clock)
    }

    func close() async {
        await coordinator.close()
        try? FileManager.default.removeItem(at: root)
    }
}

@MainActor struct LearningMediaCoordinatorTests {
    @Test func closingDuringNextCyclePreparationCannotSavePreviousCyclePosition() async throws {
        let authority = DeferredMediaAuthority()
        let f = try await MediaCoordinatorFixture(authorize: { _ in await authority.check() })
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.position = .init(seconds: 1, duration: 1)
        f.driver.send(.ended(.init(seconds: 1, duration: 1)))
        try await eventually { f.coordinator.state.controller.snapshot.session.phase == .speaking && !f.coordinator.state.busy }
        authority.blocked = true
        _ = await f.coordinator.perform(.confirm)
        try await eventually { authority.waiting }
        await f.coordinator.close()
        authority.release()
        let reopened = try await f.store.open(plan: f.plan, preferences: .fresh, writerID: UUID())
        #expect(reopened.session.current.confirmed == 1)
        #expect(reopened.session.positionSeconds == 0)
        #expect(reopened.progress.xp == 1)
        await f.close()
    }
    @Test func cycleOutlineFollowsPlaybackButCheckRequiresConfirmation() async throws {
        let f = try await MediaCoordinatorFixture()
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.send(.position(.init(seconds: 0.5, duration: 1)))
        func node(_ ordinal: Int) -> LearningCyclePresentation {
            let state = f.coordinator.state
            return .make(session: state.controller.snapshot.session, ordinal: ordinal, position: state.position)
        }
        #expect(node(0) == .active(0.5))
        #expect(node(1) == .pending)
        f.driver.send(.ended(.init(seconds: 1, duration: 1)))
        try await eventually { f.coordinator.state.controller.snapshot.session.phase == .speaking && !f.coordinator.state.busy }
        #expect(node(0) == .active(1))
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        _ = await f.coordinator.perform(.confirm)
        #expect(node(0) == .confirmed)
        #expect(node(1) == .active(0))
        await f.close()
    }

    @Test(arguments: [LearningEvent.changeRate(1.25), .regroup(size: 3, newPlanID: "new-group"), .selectSource(1)])
    func menuEditsRemainPausedAndRemoteBlocked(_ event: LearningEvent) async throws {
        let stage: Int = if case .regroup = event { 7 } else { 1 }
        let f = try await MediaCoordinatorFixture(stage: stage)
        let remote = f.coordinator.remoteState
        var remoteState = LessonRemoteState()
        remoteState.begin(remote.owner)
        remoteState.update(owner: remote.owner, revision: remote.revision, actionable: remote.actionable,
                           repeatable: remote.repeatable, since: 0)
        let pendingRemote = remoteState.take(action: .main, at: 1, foreground: true, wired: true)
        let queued = try #require(pendingRemote)
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.coordinator.setContext(.init(menuOpen: true))
        _ = await f.coordinator.perform(.pause)
        let edited = await f.coordinator.editWhilePaused(event)
        switch event {
        case .changeRate: #expect(edited.controller.snapshot.session.rate == 1.25)
        case .regroup: #expect(edited.controller.snapshot.session.plan.groupSize == 3)
        case .selectSource: #expect(edited.controller.snapshot.session.unit == 1)
        default: Issue.record("Unexpected fixture")
        }
        #expect(edited.controller.paused)
        #expect(edited.controller.snapshot.progress.xp == 0)
        #expect(!f.driver.playing)
        #expect(!f.coordinator.remoteState.actionable)
        _ = await f.coordinator.receiveRemote(queued)
        #expect(!f.driver.playing)
        let version = f.coordinator.state.controller.snapshot.writerVersion
        _ = await f.coordinator.editWhilePaused(.resume)
        _ = await f.coordinator.editWhilePaused(.confirm)
        #expect(f.coordinator.state.controller.snapshot.writerVersion == version)
        await f.close()
    }

    @Test(arguments: [LessonInteractionContext(menuOpen: true),
                      LessonInteractionContext(foreground: false),
                      LessonInteractionContext(access: false)])
    func rejectedHeadsetPressDoesNotConsumeReopenedGate(_ blocked: LessonInteractionContext) async throws {
        let f = try await MediaCoordinatorFixture()
        let initial = f.coordinator.remoteState
        let version = f.coordinator.state.controller.snapshot.writerVersion
        var native = LessonRemoteState(); native.begin(initial.owner)
        native.update(owner: initial.owner, revision: initial.revision, actionable: initial.actionable,
            repeatable: initial.repeatable, since: 0)
        let received = native.take(action: .main, at: 1, foreground: true, wired: true)
        let event = try #require(received)

        f.coordinator.setContext(blocked)
        _ = await f.coordinator.receiveRemote(event)
        try await eventually { !f.coordinator.state.busy }
        f.coordinator.setContext(.init())
        #expect(f.coordinator.state.controller.snapshot.writerVersion == version)
        #expect(f.coordinator.state.controller.paused)
        let reopened = f.coordinator.remoteState
        native.update(owner: reopened.owner, revision: reopened.revision, actionable: reopened.actionable,
            repeatable: reopened.repeatable, since: 2)
        let retry = native.take(action: .main, at: 2, foreground: true, wired: true)
        #expect(retry != nil)
        if let retry {
            _ = await f.coordinator.receiveRemote(retry)
            try await eventually { f.driver.playing }
        }
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        await f.close()
    }

    @Test(arguments: [LessonInteractionContext(menuOpen: true),
                      LessonInteractionContext(foreground: false),
                      LessonInteractionContext(access: false)])
    func staleHeadsetPressCannotResumeAfterGateRoundTrip(_ blocked: LessonInteractionContext) async throws {
        let f = try await MediaCoordinatorFixture()
        let initial = f.coordinator.remoteState
        let version = f.coordinator.state.controller.snapshot.writerVersion
        var native = LessonRemoteState(); native.begin(initial.owner)
        native.update(owner: initial.owner, revision: initial.revision, actionable: initial.actionable,
            repeatable: initial.repeatable, since: 0)
        let received = native.take(action: .main, at: 1, foreground: true, wired: true)
        let event = try #require(received)
        // No consumer reads remoteState while the gate is closed.
        f.coordinator.setContext(blocked)
        try await eventually { !f.coordinator.state.busy }
        f.coordinator.setContext(.init())
        _ = await f.coordinator.receiveRemote(event)
        #expect(f.coordinator.state.controller.paused)
        #expect(f.coordinator.state.controller.snapshot.writerVersion == version)
        #expect(!f.driver.playing)
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        await f.close()
    }

    @Test func unchangedRemotePresentationDoesNotRearmConsumedPress() async throws {
        let f = try await MediaCoordinatorFixture()
        let initial = f.coordinator.remoteState
        var native = LessonRemoteState(); native.begin(initial.owner)
        native.update(owner: initial.owner, revision: initial.revision, actionable: initial.actionable,
            repeatable: initial.repeatable, since: 0)
        let received = native.take(action: .main, at: 1, foreground: true, wired: true)
        let event = try #require(received)
        f.coordinator.setContext(.init())
        let unchanged = f.coordinator.remoteState
        #expect(unchanged.revision == initial.revision)
        native.update(owner: unchanged.owner, revision: unchanged.revision, actionable: unchanged.actionable,
            repeatable: unchanged.repeatable, since: 2)
        #expect(native.take(action: .main, at: 2, foreground: true, wired: true) == nil)
        _ = await f.coordinator.receiveRemote(event)
        try await eventually { f.driver.playing }
        let version = f.coordinator.state.controller.snapshot.writerVersion
        _ = await f.coordinator.receiveRemote(event)
        #expect(f.coordinator.state.controller.snapshot.writerVersion == version)
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        await f.close()
    }

    @Test func explicitPauseFlushesUncheckpointedPosition() async throws {
        let f = try await MediaCoordinatorFixture()
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.position = .init(seconds: 0.42, duration: 1)
        let paused = await f.coordinator.perform(.pause)
        #expect(paused.controller.paused)
        #expect(paused.controller.snapshot.session.positionSeconds == 0.42)
        await f.close()
    }
    @Test func visibleMediaRetryDoesNotEnableHeadsetRecovery() async throws {
        let f = try await MediaCoordinatorFixture()
        f.driver.failPreparation = true
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.coordinator.state.error != nil && !f.coordinator.state.busy }
        #expect(f.coordinator.remoteState.mainAction == nil)
        f.driver.failPreparation = false
        _ = await f.coordinator.retryMedia()
        try await eventually { f.driver.playing }
        #expect(f.coordinator.state.error == nil)
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        await f.close()
    }
    @Test func memberBoundaryBypassesCheckpointThrottle() async throws {
        let f = try await MediaCoordinatorFixture()
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.send(.position(.init(seconds: 0.1, duration: 1)))
        try await eventually { f.coordinator.state.controller.snapshot.session.positionSeconds == 0.1 }
        f.driver.send(.memberBoundary(.init(seconds: 0.5, duration: 1)))
        try await eventually { f.coordinator.state.controller.snapshot.session.positionSeconds == 0.5 }
        await f.close()
    }

    @Test func headsetCommandsShareConfirmationAndMenuGuards() async throws {
        let f = try await MediaCoordinatorFixture()
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.send(.ended(.init(seconds: 1, duration: 1)))
        try await eventually { f.coordinator.state.controller.snapshot.session.phase == .speaking && !f.coordinator.state.busy }
        let gate = f.coordinator.remoteState
        var native = LessonRemoteState(); native.begin(gate.owner)
        native.update(owner: gate.owner, revision: gate.revision, actionable: true, repeatable: false, since: 0)
        let received = native.take(action: .main, at: 1, foreground: true, wired: true)
        let event = try #require(received)
        f.coordinator.setContext(.init(menuOpen: true))
        _ = await f.coordinator.receiveRemote(event)
        try await eventually { f.coordinator.state.controller.paused }
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        f.coordinator.setContext(.init())
        _ = await f.coordinator.perform(.resume)
        let resumed = f.coordinator.remoteState
        native.update(owner: resumed.owner, revision: resumed.revision, actionable: true, repeatable: false, since: 2)
        let currentPress = native.take(action: .main, at: 2, foreground: true, wired: true)
        let current = try #require(currentPress)
        _ = await f.coordinator.receiveRemote(current)
        _ = await f.coordinator.receiveRemote(current)
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 1)
        await f.close()
    }

    @Test func mediaEndLeavesZeroXPAndNeedsConfirmation() async throws {
        let f = try await MediaCoordinatorFixture()
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.send(.ended(.init(seconds: 1, duration: 1)))
        try await eventually { f.coordinator.state.controller.snapshot.session.phase == .speaking }
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        let confirmed = await f.coordinator.perform(.confirm)
        #expect(confirmed.controller.snapshot.progress.xp == 1)
        try await eventually { f.driver.playing }
        #expect(!f.driver.disposed)
        await f.close()
    }

    @Test func scenePauseDuringSaveCannotAutoplayContinuation() async throws {
        let f = try await MediaCoordinatorFixture()
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.send(.ended(.init(seconds: 1, duration: 1)))
        try await eventually { f.coordinator.state.controller.snapshot.session.phase == .speaking }
        await f.store.suspendNext()
        let action = Task { await f.coordinator.perform(.confirm) }
        while !(await f.store.entered) { await Task.yield() }
        f.coordinator.setContext(.init(foreground: false))
        #expect(!f.driver.playing)
        await f.store.release()
        let result = await action.value
        #expect(result.controller.paused)
        #expect(result.controller.snapshot.progress.xp == 1)
        #expect(!f.driver.playing)
        f.coordinator.setContext(.init())
        #expect(!f.driver.playing)
        await f.close()
    }

    @Test func saveFailureStopsOutputAndRetryStaysPaused() async throws {
        let f = try await MediaCoordinatorFixture()
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.send(.ended(.init(seconds: 1, duration: 1)))
        try await eventually { f.coordinator.state.controller.snapshot.session.phase == .speaking }
        await f.store.failNext()
        let failed = await f.coordinator.perform(.confirm)
        #expect(failed.controller.saveFailed)
        #expect(failed.controller.snapshot.progress.xp == 0)
        #expect(!f.driver.playing)
        let retried = await f.coordinator.retrySave()
        #expect(retried.controller.paused && !retried.controller.saveFailed)
        #expect(retried.controller.snapshot.progress.xp == 1)
        #expect(!f.driver.playing)
        await f.close()
    }

    @Test func pauseFlushesLatestPositionBeforeRevoke() async throws {
        let f = try await MediaCoordinatorFixture()
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.playing }
        f.driver.position = .init(seconds: 0.42, duration: 1)
        f.coordinator.suspend(.inactivity)
        #expect(!f.driver.playing)
        try await eventually { f.coordinator.state.controller.paused }
        await f.coordinator.close()
        let reopened = try await f.store.open(plan: f.plan, preferences: .fresh, writerID: UUID())
        #expect(reopened.session.positionSeconds == 0.42)
        #expect(!reopened.session.running)
        #expect(reopened.progress.xp == 0)
        await f.close()
    }

    @Test func oldSeekCannotPublishIntoNewPlan() async throws {
        let f = try await MediaCoordinatorFixture(stage: 7)
        f.driver.suspendPreparation = true
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.gate != nil }
        let oldCallback = f.driver.onEvent, token = try #require(f.driver.request?.token)
        _ = await f.coordinator.perform(.pause)
        let replacement = await f.coordinator.perform(.regroup(size: 3, newPlanID: "replacement-plan"))
        f.driver.gate?.resume()
        f.driver.suspendPreparation = false
        try await eventually { f.coordinator.state.controller.paused }
        oldCallback?(.init(token: token, kind: .ended(.init(seconds: 1, duration: 1))))
        #expect(!f.driver.playing)
        #expect(f.coordinator.state.controller.snapshot == replacement.controller.snapshot)
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        #expect(f.coordinator.state.controller.snapshot.session.plan.runID == "replacement-plan")
        await f.close()
    }

    @Test func silentStageNeverOpensAudioOrVideo() async throws {
        let f = try await MediaCoordinatorFixture(stage: 11)
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.coordinator.state.controller.snapshot.session.phase == .speaking }
        #expect(f.driver.request == nil)
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
        let result = await f.coordinator.perform(.confirm)
        #expect(result.controller.snapshot.progress.xp == 3)
        await f.close()
    }
}

@MainActor private final class DeferredMediaAuthority {
    var blocked = false
    var waiting: Bool { continuation != nil }
    private var continuation: CheckedContinuation<Bool, Never>?
    func check() async -> Bool {
        if !blocked { return true }
        return await withCheckedContinuation { continuation = $0 }
    }
    func release() { blocked = false; continuation?.resume(returning: true); continuation = nil }
}
