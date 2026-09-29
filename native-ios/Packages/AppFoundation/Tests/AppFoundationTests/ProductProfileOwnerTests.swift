import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import AppFoundation

@MainActor struct ProductProfileOwnerTests {
    @Test func replacementClosesTheOldFlowBeforePublishingTheNewModel() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root)
        let owner = ProductProfileOwner(store: store, catalog: NoBooks())
        let original = owner.model
        let before = try await store.preferences(profileID: "local")
        var closed = false
        let token = owner.registerBoundary {
            #expect(owner.model === original)
            #expect(owner.profileID == "local")
            closed = true
        }
        try await owner.selectProfile("account")
        #expect(closed)
        #expect(owner.profileID == "account")
        #expect(owner.model !== original)
        await original.select(language: "french", packageKey: nil)
        #expect(try await store.preferences(profileID: "local") == before)
        owner.unregisterBoundary(token)
    }
    @Test func failedPausePreservesCurrentProfileAndModel() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let owner = ProductProfileOwner(store: SQLiteLearningStore(root: root), catalog: NoBooks())
        let original = owner.model
        _ = owner.registerBoundary { throw ProductError.unavailable }
        await #expect(throws: ProductError.unavailable) { try await owner.selectProfile("account") }
        #expect(owner.profileID == "local")
        #expect(owner.model === original)
        #expect(!owner.changing)
    }
    @Test func oldRegistrationCannotClearNewBoundary() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let owner = ProductProfileOwner(store: SQLiteLearningStore(root: root), catalog: NoBooks())
        let old = owner.registerBoundary { }
        var called = false
        _ = owner.registerBoundary { called = true }
        owner.unregisterBoundary(old)
        try await owner.selectProfile("account")
        #expect(called)
    }
}

private struct NoBooks: ProductCatalog {
    func books() async throws -> [CatalogBook] { [] }
    func materials(packageKey: String) async throws -> BookMaterials { throw ProductError.unavailable }
    func permitsPractice(packageKey: String) async -> Bool { false }
}
