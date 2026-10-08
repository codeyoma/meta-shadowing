import Foundation
import Testing
import AppFoundation
import LearningDomain
import LearningPersistence
import MediaPlayer
@testable import MetaShadowingNative

@MainActor @Suite(.serialized) struct LearningFlowTests {
    @Test func suspensionBeforePresentationLeavesAResumablePausedLesson() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: "audio"), profileID: "entry-test"))
        await flow.open(packageKey: "ui-fixture-v1", stage: 1, startWhenPresented: true)
        flow.suspend()
        await flow.startPresentedLesson()
        let runtime = try #require(flow.runtime)
        #expect(runtime.state.controller.paused)
        _ = await runtime.coordinator.perform(.resume)
        #expect(!runtime.state.controller.paused, "Suspension must not strand the invisible preparation gate")
        #expect(runtime.controls.xp == 0)
        await flow.close()
    }

    @Test func preparedLessonStaysSilentUntilPresented() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: "audio"), profileID: "entry-test"))
        await flow.open(packageKey: "ui-fixture-v1", stage: 1, startWhenPresented: true)
        let runtime = try #require(flow.runtime)
        #expect(runtime.state.controller.paused)
        #expect(!runtime.coordinator.remoteState.actionable)
        #expect(runtime.controls.xp == 0)

        await flow.startPresentedLesson()
        #expect(!runtime.state.controller.paused)
        try await waitForMedia { MPNowPlayingInfoCenter.default().nowPlayingInfo != nil }
        await flow.presentOptions(.menu)
        // A second appearance must not restart a lesson the user has paused.
        await flow.startPresentedLesson()
        #expect(runtime.state.controller.paused)
        #expect(runtime.controls.xp == 0)
        await flow.close()
    }

    @Test func profileBoundaryCanFinishWhileClosedPlayerIsDismissing() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: "audio"), profileID: "exit-test"))
        await flow.open(packageKey: "ui-fixture-v1", stage: 1)
        await flow.presentOptions(.menu)
        let runtime = try #require(flow.runtime)
        await flow.close(retainingPresentation: true)

        // A still-registered boundary must accept an already retired controller.
        try await flow.prepareServiceBoundary()

        #expect(flow.closedByService)
        #expect(flow.runtime == nil && flow.options == nil)
        #expect(!runtime.state.controller.active)
        #expect(!runtime.coordinator.remoteState.actionable)
    }

    @Test(arguments: ["audio", "video"])
    func stageExitRetiresLearningWithoutClearingTheDismissingScreen(mode: String) async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root.appending(path: "store"))
        let flow = LearningFlow(workspace: ProductWorkspace(store: store,
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: mode), profileID: "exit-test"))
        await flow.open(packageKey: "ui-fixture-v1", stage: 1)
        await flow.presentOptions(.menu)
        let runtime = try #require(flow.runtime)
        let video = flow.video
        let session = runtime.controls.session

        await flow.close(retainingPresentation: true)

        #expect(flow.runtime === runtime, "The outgoing player must not become its initial loading screen")
        #expect(flow.video === video, "The outgoing video surface must not disappear during dismissal")
        #expect(flow.options == .menu, "The options sheet and player dismiss together, not as two transitions")
        #expect(runtime.controls.session == session)
        #expect(!runtime.state.controller.active)
        #expect(!runtime.coordinator.remoteState.actionable)
        let progress = try await store.readProgress(scope: session.plan.scope, today: StudyDay("2026-10-08"))
        #expect(progress.xp == 0)
        #expect(progress.completedRuns.isEmpty)

        // Once the presentation is gone, ordinary cleanup releases the retained display.
        await flow.close()
        #expect(flow.runtime == nil && flow.video == nil && flow.options == nil)
    }

    @Test(arguments: [false, true])
    func menuOpenedDuringLoadingKeepsTheLateLessonPausedEvenAfterDismissal(dismissBeforeReady: Bool) async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        _ = try MediaFixtureFactory.tone(in: root, name: "one", duration: 2)
        let catalog = DeferredLessonCatalog(root: root)
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root), catalog: catalog, profileID: "flow"))
        let opening = Task { await flow.open(packageKey: "fixture-v1", stage: 1) }
        while !(await catalog.entered) { await Task.yield() }
        await flow.presentOptions(.menu)
        #expect(flow.options == .menu)
        if dismissBeforeReady { flow.dismissOptions() }
        await catalog.release()
        await opening.value
        let runtime = try #require(flow.runtime)
        #expect(runtime.state.controller.paused)
        #expect(runtime.state.phase == .paused)
        #expect(runtime.controls.xp == 0)
        if !dismissBeforeReady {
            #expect(flow.options == .menu)
            #expect(!runtime.coordinator.remoteState.actionable)
            flow.dismissOptions()
            #expect(runtime.state.controller.paused)
        }
        _ = await runtime.coordinator.perform(.resume)
        #expect(!runtime.state.controller.paused, "Explicit resume remains available after loading into a paused lesson")
        #expect(runtime.controls.xp == 0)
        await flow.close()
    }

    @Test func menuRemainsAvailableAfterLoadFailure() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: DeferredLessonCatalog(root: root), profileID: "flow"))
        await flow.open(packageKey: "missing", stage: 1)
        #expect(flow.failed && flow.runtime == nil)
        await flow.presentOptions(.menu)
        #expect(flow.options == .menu)
        await flow.close()
        #expect(flow.options == nil)
    }

    @Test func closingDoesNotWaitForAnUncooperativeCatalog() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = DeferredLessonCatalog(root: root)
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root), catalog: catalog, profileID: "flow"))
        let opening = Task { await flow.open(packageKey: "fixture-v1", stage: 1) }
        while !(await catalog.entered) { await Task.yield() }
        await flow.presentOptions(.menu)
        #expect(flow.options == .menu)
        var closed = false
        let closing = Task { await flow.close(); closed = true }
        try await Task.sleep(for: .milliseconds(100))
        #expect(closed)
        await catalog.release()
        await opening.value; await closing.value
        #expect(flow.runtime == nil)
    }

    @Test func closeDuringOpenDiscardsRuntime() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = DeferredLessonCatalog(root: root)
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root), catalog: catalog, profileID: "flow")
        let flow = LearningFlow(workspace: workspace)
        let opening = Task { await flow.open(packageKey: "fixture-v1", stage: 1) }
        while !(await catalog.entered) { await Task.yield() }
        let closing = Task { await flow.close() }
        await Task.yield()
        await catalog.release()
        await opening.value; await closing.value
        #expect(flow.runtime == nil)
        #expect(!flow.loading)
        #expect(flow.options == nil)
    }
}

private actor DeferredLessonCatalog: ProductCatalog {
    let root: URL
    var entered = false
    private var gate: CheckedContinuation<Void, Never>?
    init(root: URL) { self.root = root }
    func books() -> [CatalogBook] { [CatalogBook(id: "fixture-v1", book: "fixture", language: "english", title: "Fixture", sentenceCount: 1)] }
    func permitsPractice(packageKey: String) -> Bool { packageKey == "fixture-v1" }
    func materials(packageKey: String) async -> BookMaterials {
        entered = true
        await withCheckedContinuation { gate = $0 }
        return BookMaterials(book: books()[0], root: root, sources: [.init(index: 0, text: "One", translation: "하나")],
            media: [.audio(file: root.appending(path: "one.wav"))])
    }
    func release() { gate?.resume(); gate = nil }
}
