import Foundation
import Testing
import AppFoundation
import LearningDomain
import LearningPersistence
import LearningReference
@testable import MetaShadowingNative

@MainActor @Suite(.serialized) struct ReferenceLifecycleTests {
    @Test func allowedAuthorityReplacementDisablesTheExistingRuntime() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = RevocableReferenceCatalog(root: root)
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: catalog, profileID: "reference-test"))
        await flow.open(packageKey: "ui-fixture-v1", stage: 1)
        let runtime = try #require(flow.runtime)
        _ = await runtime.coordinator.perform(.resume)
        try await waitForMedia { runtime.coordinator.remoteState.actionable }
        await catalog.replaceAuthority()
        for _ in 0..<100 where runtime.coordinator.remoteState.actionable { await Task.yield() }
        #expect(!runtime.coordinator.remoteState.actionable)
        #expect(runtime.controls.xp == 0)
        await flow.close()
    }
    @Test func cancelledDictionaryPreparationCannotReopenOptionsGate() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = DeferredReferenceAccessCatalog(root: root)
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: catalog, profileID: "reference-test"))
        await flow.open(packageKey: "ui-fixture-v1", stage: 1)
        await flow.presentOptions(.menu); flow.dismissOptions()
        let runtime = try #require(flow.runtime)
        await catalog.deferNextAccess()
        let lookup = Task { await flow.lookupPlayer(term: "Secret", permitsWord: { true }) }
        await catalog.waitForRead()
        await flow.presentOptions(.menu)
        #expect(flow.options == .menu)
        #expect(!runtime.coordinator.remoteState.actionable)
        await catalog.release()
        await lookup.value
        #expect(!runtime.coordinator.remoteState.actionable)
        #expect(runtime.state.controller.paused)
        await flow.close()
    }
    @Test func accessChangeClearsDisplayedAnalysisWithoutLearningCredit() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = RevocableReferenceCatalog(root: root)
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: catalog, profileID: "reference-test"))
        await flow.open(packageKey: "ui-fixture-v1", stage: 1)
        await flow.presentOptions(.analysis)
        await flow.loadAnalysis()
        let model = try #require(flow.analysis)
        #expect(model.state == .ready)
        model.selectSentence("1:0"); model.selectToken(0)
        await catalog.revoke()
        for _ in 0..<100 where model.state == .ready { await Task.yield() }
        #expect(model.state == .unavailable)
        #expect(model.selectedToken == nil)
        #expect(flow.runtime?.controls.xp == 0)
        #expect(flow.runtime?.state.controller.paused == true)
        await flow.close()
    }
    @Test func backgroundClearsSelectionAndCloseDoesNotResume() async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let flow = LearningFlow(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: "analysis"), profileID: "reference-test"))
        await flow.open(packageKey: "ui-fixture-v1", stage: 1)
        await flow.presentOptions(.analysis); await flow.loadAnalysis()
        let model = try #require(flow.analysis)
        model.selectSentence("1:0"); model.selectToken(0)
        flow.suspend()
        #expect(model.state == .unavailable)
        #expect(model.selectedSentenceID == nil)
        flow.dismissOptions()
        #expect(flow.runtime?.state.controller.paused == true)
        #expect(flow.runtime?.controls.xp == 0)
        await flow.close()
    }
}
private actor DeferredReferenceAccessCatalog: ProductCatalog {
    let base: ProductTestCatalog
    var shouldDefer = false
    var pending: CheckedContinuation<Bool, Never>?
    var entered: CheckedContinuation<Void, Never>?
    init(root: URL) { base = ProductTestCatalog(root: root.appending(path: "assets"), mode: "analysis") }
    func books() async -> [CatalogBook] { await base.books() }
    func materials(packageKey: String) async throws -> BookMaterials { try await base.materials(packageKey: packageKey) }
    func permitsPractice(packageKey: String) async -> Bool {
        if shouldDefer {
            shouldDefer = false
            return await withCheckedContinuation { pending = $0; entered?.resume(); entered = nil }
        }
        return true
    }
    func deferNextAccess() { shouldDefer = true }
    func waitForRead() async {
        if pending != nil { return }
        await withCheckedContinuation { entered = $0 }
    }
    func release() { pending?.resume(returning: true); pending = nil }
}
private actor RevocableReferenceCatalog: ProductCatalog {
    let base: ProductTestCatalog
    var allowed = true
    let stream = AsyncStream<Void>.makeStream()
    init(root: URL) { base = ProductTestCatalog(root: root.appending(path: "assets"), mode: "analysis") }
    func books() async -> [CatalogBook] { await base.books() }
    func materials(packageKey: String) async throws -> BookMaterials { try await base.materials(packageKey: packageKey) }
    func permitsPractice(packageKey: String) -> Bool { allowed && packageKey == "ui-fixture-v1" }
    func syntax(packageKey: String) async throws -> InstalledSyntaxFile? { try await base.syntax(packageKey: packageKey) }
    func referenceChanges() -> AsyncStream<Void> { stream.stream }
    func revoke() { allowed = false; stream.continuation.yield(()) }
    func replaceAuthority() { stream.continuation.yield(()) }
}
