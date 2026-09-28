#if DEBUG
import AppFoundation
import AVFoundation
import LearningDomain
import LearningPersistence
import LearningMedia
import SwiftUI

struct SyntheticMediaProbeView: View {
    @State private var model: SyntheticMediaProbeModel
    init(root: URL, mode: String) { model = SyntheticMediaProbeModel(root: root, mode: mode) }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Debug-only native media probe. Generated tones and frames; no accounts or personal content.").font(.caption)
                }
                if let runtime = model.runtime {
                    MediaProbeControls(runtime: runtime, drivers: model.driverCount, video: model.video)
                } else if model.failed {
                    Text("Could not open the local media fixture. Existing progress was preserved.")
                    Button("Retry") { Task { await model.open() } }
                } else { ProgressView("Preparing local media") }
            }
            .navigationTitle("Native media · \(model.mode)")
        }
        .task { await model.open() }
        .onDisappear { model.close() }
    }
}

private struct MediaProbeControls: View {
    let runtime: NativeLearningRuntime
    let drivers: Int
    let video: VideoSegmentTransport?
    var body: some View {
        Section("Committed progress") {
            Text("XP: \(runtime.state.controller.snapshot.progress.xp)").accessibilityIdentifier("media-xp")
            Text(runtime.state.controller.snapshot.session.phase.rawValue).accessibilityIdentifier("media-phase")
            Text(runtime.state.controller.paused ? "Paused" : runtime.state.phase == .playing ? "Playing" : "Waiting")
                .accessibilityIdentifier("media-status")
            Text("Media drivers: \(drivers)").accessibilityIdentifier("media-driver")
            Text("Committed feedback: \(runtime.feedbackCount)")
            if let video { ProbeVideoSurface(transport: video).frame(height: 120).accessibilityLabel("Generated video fixture") }
            if let position = runtime.state.position {
                Text("Selected time: \(position.seconds, format: .number.precision(.fractionLength(2))) / \(position.duration, format: .number.precision(.fractionLength(2)))")
            }
        }
        Section("Explicit actions") {
            Button(runtime.coordinator.remoteState.mainAction == .confirm ? "Confirm cycle" : runtime.coordinator.remoteState.mainAction == .next ? "Next" : "Resume") {
                Task { if let action = runtime.coordinator.remoteState.mainAction { _ = await runtime.coordinator.perform(action) } }
            }
            .accessibilityIdentifier("media-main")
            .disabled(runtime.coordinator.remoteState.mainAction == nil || runtime.state.busy)
            Button("Pause") { runtime.coordinator.suspend(.userPause) }
            Button("Two more cycles") { Task { _ = await runtime.coordinator.perform(.repeat) } }
                .disabled(!runtime.coordinator.remoteState.repeatable)
            if runtime.state.controller.saveFailed {
                Text("Save failed. Retry keeps playback paused.")
                Button("Retry save") { Task { _ = await runtime.coordinator.retrySave() } }.disabled(runtime.state.busy)
            }
            if let error = runtime.state.error {
                Text("Media unavailable: \(String(describing: error)). Your checkpoint is preserved.")
                Button("Retry media") { Task { _ = await runtime.coordinator.retryMedia() } }
                    .disabled(runtime.state.busy || runtime.state.controller.saveFailed)
                    .accessibilityIdentifier("media-retry")
            }
        }
        Section("Wired microphone monitoring") {
            Text(String(describing: runtime.monitorState))
            Button(runtime.monitorState == .monitoring ? "Stop monitoring" : "Start monitoring") {
                Task { await runtime.monitoring.setEnabled(runtime.monitorState != .monitoring) }
            }
            Slider(value: Binding(get: { Double(runtime.monitorGain) }, set: { runtime.monitoring.setGain(Float($0)) }), in: 0...1)
                .accessibilityLabel("Microphone gain")
        }
    }
}

private struct ProbeVideoSurface: UIViewRepresentable {
    let transport: VideoSegmentTransport
    func makeUIView(context: Context) -> ProbeVideoCanvas {
        let view = ProbeVideoCanvas(); transport.attach(view.videoLayer); return view
    }
    func updateUIView(_ view: ProbeVideoCanvas, context: Context) { transport.attach(view.videoLayer) }
    static func dismantleUIView(_ view: ProbeVideoCanvas, coordinator: ()) { view.videoLayer.player = nil }
}
private final class ProbeVideoCanvas: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var videoLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}

@MainActor @Observable final class SyntheticMediaProbeModel {
    let mode: String
    private let root: URL
    @ObservationIgnored private let prepareAssets: @Sendable (URL, Bool) async throws -> [MediaSource]
    private(set) var runtime: NativeLearningRuntime?
    private(set) var driverCount = 0
    private(set) var video: VideoSegmentTransport?
    private(set) var failed = false
    @ObservationIgnored private var opening: Task<Void, Never>?
    @ObservationIgnored private var openingGeneration: UUID?
    private var generation = UUID()
    @ObservationIgnored private var teardown: Task<Void, Never>?
    init(root: URL, mode: String,
         prepareAssets: @escaping @Sendable (URL, Bool) async throws -> [MediaSource] = { try await SyntheticMediaFixtures.create(in: $0, video: $1) }) {
        self.root = root; self.mode = ["audio", "video", "silent"].contains(mode) ? mode : "audio"
        self.prepareAssets = prepareAssets
    }
    func open() async {
        guard runtime == nil else { return }
        if let opening, openingGeneration == generation { await opening.value; return }
        let current = generation
        let previous = opening, previousTeardown = teardown
        let operation = Task { @MainActor [weak self] in
            await previous?.value
            await previousTeardown?.value
            guard let self, self.generation == current, !Task.isCancelled else { return }
            await self.load(generation: current)
        }
        opening = operation; openingGeneration = current
        await withTaskCancellationHandler { await operation.value } onCancel: { operation.cancel() }
        if generation == current { opening = nil; openingGeneration = nil; teardown = nil }
    }
    private func load(generation current: UUID) async {
        failed = false
        do {
            let workspace = root.appending(path: mode)
            let sources: [MediaSource]
            if mode == "silent" {
                sources = ["one", "two"].map { .audio(file: workspace.appending(path: $0 + ".wav")) }
            } else { sources = try await prepareAssets(workspace, mode == "video") }
            guard current == generation, !Task.isCancelled else { return }
            let scope = try LearningScope(profileID: "media-probe", packageKey: "generated-media-v1", language: "english", book: "generated-media", stage: mode == "silent" ? 11 : 7)
            let plan = try LearningPlan.make(scope: scope, runID: "generated-media-run", sources: [
                .init(index: 0, text: "One", translation: "하나"), .init(index: 1, text: "Two", translation: "둘")], groupSize: 2)
            let store = SQLiteLearningStore(root: workspace)
            let snapshot = try await store.open(plan: plan, preferences: .fresh, writerID: UUID())
            let controller = LearningController(store: store, snapshot: snapshot)
            let initial = await controller.state
            guard current == generation, !Task.isCancelled else { await controller.deactivate(); return }
            let catalog = try MediaAssetCatalog(scope: scope, sourceCount: 2, root: workspace, sources: sources)
            runtime = NativeLearningRuntime(controller: controller, initial: initial, catalog: catalog,
                authorize: { $0 == scope }, makeTransport: { [weak self] sources in
                    self?.driverCount += 1
                    if case .video = sources.first {
                        let transport = VideoSegmentTransport(); self?.video = transport; return transport
                    }
                    return AudioQueueTransport()
                })
        } catch { if current == generation, !Task.isCancelled { failed = true } }
    }
    func close() {
        generation = UUID()
        let pending = opening; pending?.cancel()
        let old = runtime; runtime = nil; video = nil
        old?.setAccess(false)
        let previous = teardown
        teardown = Task { await previous?.value; await pending?.value; await old?.close() }
    }
}
#endif
