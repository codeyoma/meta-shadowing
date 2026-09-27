#if DEBUG
import AppFoundation
import LearningDomain
import SwiftUI

/// A storage acceptance surface, not a production player or simulated audio engine.
struct SyntheticLearningProbeView: View {
    @Environment(\.scenePhase) private var scenePhase
    @State private var model: SyntheticLearningProbeModel

    init(root: URL) { _model = State(initialValue: SyntheticLearningProbeModel(root: root)) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Debug-only storage probe. No audio, accounts or real lesson data.")
                        .foregroundStyle(.secondary)
                }
                if let state = model.state {
                    Section("Committed progress") {
                        Text("XP: \(state.snapshot.progress.xp)").accessibilityIdentifier("probe-xp")
                        Text("Confirmed phrases: \(state.snapshot.session.sourceProgress.filter { $0.confirmed > 0 }.count)")
                            .accessibilityIdentifier("probe-confirmed")
                        Text(state.paused ? "Paused" : "Awaiting explicit confirmation")
                            .accessibilityIdentifier("probe-paused")
                    }
                    Section("Synthetic actions") {
                        Button("Finish synthetic reveal") { Task { await model.finishReveal() } }
                            .accessibilityIdentifier("probe-finish-reveal")
                            .disabled(model.busy || !state.active || state.saveFailed || state.snapshot.session.phase == .complete)
                        Button("Confirm phrase") { Task { await model.confirm() } }
                            .accessibilityIdentifier("probe-confirm")
                            .disabled(model.busy || !state.active || state.saveFailed || state.paused || state.snapshot.session.phase != .speaking)
                        if state.saveFailed {
                            Text("Saving failed. Your last saved progress is unchanged.")
                            Button("Retry save") { Task { await model.retrySave() } }
                                .disabled(model.busy)
                        }
                    }
                } else if model.failed {
                    Text("Could not open the local probe. Retry without deleting its data.")
                    Text(model.failureCode)
                    Button("Retry") { Task { await model.activate() } }
                } else { ProgressView("Opening local storage") }
            }
            .navigationTitle("Synthetic learning")
        }
        .task(id: scenePhase) {
            if scenePhase == .active { await model.activate() }
            else { await model.deactivate() }
        }
    }
}

@MainActor @Observable
private final class SyntheticLearningProbeModel {
    private let workspace: SyntheticLearningWorkspace
    private var controller: LearningController?
    private var generation = UUID()
    private(set) var state: LearningControllerState?
    private(set) var busy = false
    private(set) var failed = false
    private(set) var failureCode = ""

    init(root: URL) { workspace = SyntheticLearningWorkspace(root: root) }

    func activate() async {
        guard controller == nil else { return }
        let current = UUID(); generation = current; busy = true; failed = false
        do {
            let opened = try await workspace.open()
            guard generation == current, !Task.isCancelled else { await opened.deactivate(); return }
            controller = opened
            let initial = await opened.state
            guard generation == current else { return }
            state = initial; busy = false
        } catch {
            guard generation == current else { return }
            busy = false; failed = true
            if let storage = error as? LearningStoreError { failureCode = String(describing: storage) }
            else if let domain = error as? LearningError { failureCode = String(describing: domain) }
            else { let failure = error as NSError; failureCode = "\(failure.domain):\(failure.code)" }
        }
    }
    func deactivate() async {
        generation = UUID(); busy = false
        let previous = controller; controller = nil; state = nil
        await previous?.deactivate()
    }
    func finishReveal() async { await perform { await self.workspace.finishReveal($0) } }
    func confirm() async { await perform { await self.workspace.confirm($0) } }
    func retrySave() async { await perform { await $0.retrySave() } }
    private func perform(_ action: (LearningController) async -> LearningControllerState) async {
        guard let controller, !busy else { return }
        busy = true
        let current = generation, result = await action(controller)
        guard current == generation else { return }
        state = result; busy = false
    }
}
#endif
