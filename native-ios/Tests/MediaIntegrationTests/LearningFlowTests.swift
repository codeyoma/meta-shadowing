import Foundation
import Testing
import AppFoundation
import LearningDomain
import LearningPersistence
@testable import MetaShadowingNative

@MainActor @Suite(.serialized) struct LearningFlowTests {
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
