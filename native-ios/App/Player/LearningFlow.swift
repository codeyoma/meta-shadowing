import AppFoundation
import LearningDomain
import LearningMedia
import Observation
import Foundation

enum LearningOptionRoute: String, Identifiable, Hashable {
    case menu, rate, group, revealSpeed, display, typography, sentences, guide, analysis
    var id: String { rawValue }
}

@MainActor @Observable final class LearningFlow {
    private(set) var runtime: NativeLearningRuntime?
    private(set) var video: VideoSegmentTransport?
    private(set) var loading = false
    private(set) var failed = false
    private(set) var title = ""
    private(set) var options: LearningOptionRoute?
    private let workspace: ProductWorkspace
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var pending: Task<OpenedLesson, any Error>?
    @ObservationIgnored private var teardown: Task<Void, Never>?
    init(workspace: ProductWorkspace) { self.workspace = workspace }

    func open(packageKey: String, stage: Int) async {
        generation += 1
        let request = generation
        await releaseResources()
        guard request == generation, !Task.isCancelled else { return }
        loading = true; failed = false
        let task = Task { [workspace] in
            try await workspace.openLesson(packageKey: packageKey, stage: stage,
                                           verifiedTestAccess: StagePathView.testAccess)
        }
        pending = task
        do {
            let opened = try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
            guard request == generation, !Task.isCancelled else {
                await opened.controller.deactivate()
                return
            }
            let sources: [MediaSource] = opened.materials.media.map {
                switch $0 {
                case let .audio(file): .audio(file: file)
                case let .video(file, start, end): .video(file: file, start: start, end: end)
                }
            }
            let catalog: MediaAssetCatalog
            do {
                catalog = try MediaAssetCatalog(scope: opened.initial.snapshot.handle.scope,
                    sourceCount: opened.materials.sources.count, root: opened.materials.root, sources: sources)
            } catch {
                await opened.controller.deactivate()
                throw error
            }
            let isVideo = sources.contains { if case .video = $0 { true } else { false } }
            let video = isVideo && stage < 11 ? VideoSegmentTransport() : nil
            self.video = video
            let workspace = workspace
            let runtime = NativeLearningRuntime(controller: opened.controller, initial: opened.initial, catalog: catalog,
                authorize: { await workspace.permitsPractice($0) },
                makeTransport: { _ in if let video { video } else { AudioQueueTransport() } })
            self.runtime = runtime
            title = opened.materials.book.title
            pending = nil; loading = false
            _ = await runtime.coordinator.perform(.stageEntry)
        } catch {
            guard request == generation else { return }
            pending = nil; loading = false; failed = true
        }
    }
    func presentOptions(_ route: LearningOptionRoute) async {
        guard let runtime, options == nil else { return }
        let request = generation
        runtime.setMenuOpen(true)
        let paused = await runtime.coordinator.perform(.pause)
        guard request == generation, self.runtime === runtime else { return }
        guard paused.controller.active, !paused.controller.saveFailed else {
            runtime.setMenuOpen(false)
            return
        }
        options = route
    }
    func dismissOptions() {
        options = nil
        runtime?.setMenuOpen(false)
    }
    func suspend() {
        runtime?.suspend()
        if loading { generation += 1; pending?.cancel(); loading = false; failed = true }
    }
    func close() async {
        generation += 1; loading = false; options = nil
        await releaseResources()
    }
    private func releaseResources() async {
        let previous = teardown, opening = pending, active = runtime
        opening?.cancel(); active?.suspend()
        pending = nil; runtime = nil; video = nil
        let task = Task {
            await previous?.value
            if let opened = try? await opening?.value { await opened.controller.deactivate() }
            await active?.close()
        }
        teardown = task
        await task.value
    }
}
