#if DEBUG
import Foundation
import LearningDomain
import LearningPersistence

/// Local-only integration probe. It simulates reveal completion, not media playback.
public struct SyntheticLearningWorkspace: Sendable {
    private let store: SQLiteLearningStore
    public init(root: URL, now: @escaping @Sendable () -> Date = Date.init) {
        store = SQLiteLearningStore(root: root.appending(path: "SwiftNativeFoundation/LearningProbe"), now: now)
    }
    public func open() async throws -> LearningController {
        let scope = try LearningScope(profileID: "synthetic", packageKey: "sample-v1", language: "english", book: "sample", stage: 11)
        let plan = try LearningPlan.make(scope: scope, runID: UUID().uuidString, sources: [
            LearningSource(index: 0, text: "Hello world.", translation: "안녕하세요."),
            LearningSource(index: 1, text: "One step at a time.", translation: "한 걸음씩 나아가요.")
        ], groupSize: 2)
        let snapshot = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
        return LearningController(store: store, snapshot: snapshot)
    }
    public func finishReveal(_ controller: LearningController) async -> LearningControllerState {
        let state = await controller.state
        let running = await controller.send(command(state, .resume))
        // This explicit debug control replaces the reveal timer, including an already-started next phrase.
        return await controller.send(command(running, .playbackEnded))
    }
    public func confirm(_ controller: LearningController) async -> LearningControllerState {
        await controller.send(command(controller.state, .confirm))
    }
    public func pause(_ controller: LearningController) async -> LearningControllerState {
        await controller.send(command(controller.state, .pause))
    }
    private func command(_ state: LearningControllerState, _ event: LearningEvent) -> LearningCommand {
        LearningCommand(handle: state.snapshot.handle, id: UUID(), expectedVersion: state.snapshot.writerVersion, event: event)
    }
}
#endif
