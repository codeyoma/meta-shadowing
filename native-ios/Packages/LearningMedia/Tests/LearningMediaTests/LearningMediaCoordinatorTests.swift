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
    func prepare(_ request: PreparedMediaRequest) async throws {
        guard !disposed else { throw MediaFailure.cancelled }
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

    init(stage: Int = 1) async throws {
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
            authorize: { _ in true }, makeTransport: { _ in driver })
    }

    func close() async {
        await coordinator.close()
        try? FileManager.default.removeItem(at: root)
    }
}

@MainActor struct LearningMediaCoordinatorTests {
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
        let f = try await MediaCoordinatorFixture()
        f.driver.suspendPreparation = true
        _ = await f.coordinator.perform(.resume)
        try await eventually { f.driver.gate != nil }
        let oldCallback = f.driver.onEvent, token = try #require(f.driver.request?.token)
        f.coordinator.suspend(.inactivity)
        f.driver.gate?.resume()
        try await eventually { f.coordinator.state.controller.paused }
        oldCallback?(.init(token: token, kind: .ended(.init(seconds: 1, duration: 1))))
        #expect(!f.driver.playing)
        #expect(f.coordinator.state.controller.snapshot.session.phase == .listening)
        #expect(f.coordinator.state.controller.snapshot.progress.xp == 0)
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
