import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import AppFoundation

@MainActor @Suite struct ProductModelTests {
    @Test func startupFailureWaitsForExplicitRetryAcrossActivation() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = ProductModel(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: FirstLoadFailureCatalog(), profileID: "model"))
        await model.activate()
        #expect(model.failed)
        #expect(model.launchReady)
        model.deactivate()
        await model.activate()
        #expect(model.failed)
        #expect(model.snapshot == nil)
        await model.retry()
        #expect(!model.failed)
        #expect(model.snapshot?.books.count == 1)
        #expect(model.snapshot?.progress.xp == 0)
    }

    @Test func busyPreferenceSaveDoesNotReportAnUncommittedValueAsSaved() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = DelayedProductCatalog()
        let model = ProductModel(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: catalog, profileID: "model"))
        let loading = Task { await model.activate() }
        while !(await catalog.entered) { await Task.yield() }
        var preferences = LearningPreferences.fresh; preferences.rate = 2
        let saved = await model.saveLearningPreferences(preferences)
        #expect(saved == false)
        await catalog.release()
        await loading.value
        #expect(model.snapshot?.preferences.learning.rate == 1)
        let retried = await model.saveLearningPreferences(preferences)
        #expect(retried == true)
        #expect(model.snapshot?.preferences.learning.rate == 2)
    }

    @Test func failedPreferenceSaveRetainsCommittedValueAndRetryPersists() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let db = FailingStore(root: root)
        let model = ProductModel(workspace: ProductWorkspace(store: db,
            catalog: BundledProductCatalog(root: ProductCatalogTests.sampleRoot), profileID: "model"))
        await model.activate()
        await db.failNextPreferences()
        var preferences = LearningPreferences.fresh; preferences.rate = 2
        await model.saveLearningPreferences(preferences)
        #expect(model.failed)
        #expect(model.snapshot?.preferences.learning.rate == 1)
        model.deactivate()
        await model.activate()
        #expect(model.failed)
        #expect(model.snapshot?.preferences.learning.rate == 1)
        await model.retry()
        #expect(!model.failed)
        #expect(model.snapshot?.preferences.learning.rate == 2)
        #expect(model.snapshot?.progress.xp == 0)
    }

    @Test func deactivationRejectsLateLoad() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = DelayedProductCatalog()
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root), catalog: catalog, profileID: "model")
        let model = ProductModel(workspace: workspace)
        let loading = Task { await model.activate() }
        while !(await catalog.entered) { await Task.yield() }
        model.deactivate()
        await catalog.release()
        await loading.value
        #expect(model.snapshot == nil)
        await model.activate()
        #expect(model.snapshot?.books.count == 1)
        await model.select(language: "japanese", packageKey: nil)
        #expect(model.snapshot?.preferences.libraryLanguage == "japanese")
    }
}

private actor FirstLoadFailureCatalog: ProductCatalog {
    private let base = BundledProductCatalog(root: ProductCatalogTests.sampleRoot)
    private var shouldFail = true
    func books() async throws -> [CatalogBook] {
        if shouldFail { shouldFail = false; throw ProductError.unavailable }
        return try await base.books()
    }
    func materials(packageKey: String) async throws -> BookMaterials { try await base.materials(packageKey: packageKey) }
    func permitsPractice(packageKey: String) async -> Bool { await base.permitsPractice(packageKey: packageKey) }
}

actor DelayedProductCatalog: ProductCatalog {
    private let base = BundledProductCatalog(root: ProductCatalogTests.sampleRoot)
    var entered = false
    private var wait = true
    private var continuation: CheckedContinuation<Void, Never>?
    func books() async throws -> [CatalogBook] {
        if wait { entered = true; await withCheckedContinuation { continuation = $0 } }
        return try await base.books()
    }
    func release() { wait = false; continuation?.resume(); continuation = nil }
    func materials(packageKey: String) async throws -> BookMaterials { try await base.materials(packageKey: packageKey) }
    func permitsPractice(packageKey: String) async -> Bool { await base.permitsPractice(packageKey: packageKey) }
}
