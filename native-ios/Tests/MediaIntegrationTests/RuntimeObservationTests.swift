import Foundation
import Observation
import Synchronization
import Testing
import AppFoundation
import LearningDomain
import LearningPersistence
import LearningMedia

@MainActor @Suite(.serialized) struct RuntimeObservationTests {
    @Test func hiddenPreparationDoesNotConsumeAutomaticWiredMonitoring() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let scope = try LearningScope(profileID: "monitor-entry", packageKey: "fixture-v1", language: "english", book: "fixture", stage: 1)
        let plan = try LearningPlan.make(scope: scope, runID: "monitor-entry", sources: [.init(index: 0, text: "One", translation: "하나")], groupSize: 2)
        let store = SQLiteLearningStore(root: root)
        let snapshot = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: snapshot)
        let catalog = try MediaAssetCatalog(scope: scope, sourceCount: 1, root: root, sources: [.audio(file: root.appending(path: "fixture.wav"))])
        let hardware = EntryMonitorHardware()
        let runtime = NativeLearningRuntime(controller: controller, initial: await controller.state,
            catalog: catalog, authorize: { _ in true }, makeTransport: { _ in ObservationTransport() },
            initiallyPresented: false, monitorHardware: hardware)
        #expect(runtime.monitoring.state == .off, "An unpresented lesson must not request microphone activation")
        runtime.setMenuOpen(true)
        runtime.setMenuOpen(false)
        try await waitForMedia { runtime.monitoring.state == .monitoring }
        #expect(runtime.monitoring.state == .monitoring)
        await runtime.close()
        #expect(!hardware.running)
    }

    @Test func positionDoesNotInvalidateControls() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let scope = try LearningScope(profileID: "observation", packageKey: "fixture-v1", language: "english", book: "fixture", stage: 1)
        let plan = try LearningPlan.make(scope: scope, runID: "observation", sources: [.init(index: 0, text: "One", translation: "하나")], groupSize: 2)
        let store = SQLiteLearningStore(root: root)
        let snapshot = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        let controller = LearningController(store: store, snapshot: snapshot)
        let driver = ObservationTransport()
        let catalog = try MediaAssetCatalog(scope: scope, sourceCount: 1, root: root, sources: [.audio(file: root.appending(path: "fixture.wav"))])
        let runtime = NativeLearningRuntime(controller: controller, initial: await controller.state,
            catalog: catalog, authorize: { _ in true }, makeTransport: { _ in driver })
        _ = await runtime.coordinator.perform(.resume)
        try await waitForMedia { driver.playing }
        let controlsChanged = Mutex(false), motionChanged = Mutex(false)
        withObservationTracking { _ = runtime.controls } onChange: { controlsChanged.withLock { $0 = true } }
        withObservationTracking { _ = runtime.motion.position } onChange: { motionChanged.withLock { $0 = true } }
        driver.tick(0.2)
        try await Task.sleep(for: .milliseconds(50))
        #expect(!controlsChanged.withLock { $0 })
        #expect(motionChanged.withLock { $0 })
        await runtime.close()
    }
}

@MainActor private final class EntryMonitorHardware: VoiceMonitorHardware {
    let outputs: [MonitorOutput] = [.headphones]
    let permission: MicrophonePermission = .granted
    private(set) var running = false
    func requestPermission() async -> Bool { true }
    func start(gain: Float) async throws { running = true }
    func stop() { running = false }
    func setGain(_ gain: Float) {}
}

@MainActor private final class ObservationTransport: MediaTransport {
    var onEvent: (@MainActor (MediaTransportEvent) -> Void)?
    private var request: PreparedMediaRequest?
    var playing = false
    func prepare(_ request: PreparedMediaRequest) async throws { self.request = request }
    func play(token: TransportToken) throws { playing = true }
    func pause() -> MediaPosition? { playing = false; return .init(seconds: 0.2, duration: 10) }
    func dispose() { playing = false }
    func tick(_ seconds: Double) {
        guard let request else { return }
        onEvent?(.init(token: request.token, kind: .position(.init(seconds: seconds, duration: 10))))
    }
}
