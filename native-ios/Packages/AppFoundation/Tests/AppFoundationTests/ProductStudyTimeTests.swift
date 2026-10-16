import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import AppFoundation

@Suite struct ProductStudyTimeTests {
    @Test func onlyOwningWorkspaceCanRecordAndBrowsingShowsPersistedTime() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let db = SQLiteLearningStore(root: root)
        let catalog = BundledProductCatalog(root: ProductCatalogTests.sampleRoot)
        let workspace = ProductWorkspace(store: db, catalog: catalog, profileID: "one")
        let other = ProductWorkspace(store: db, catalog: catalog, profileID: "two")
        let opened = try await workspace.openLesson(packageKey: "morning-notes-v1", stage: 1, verifiedTestAccess: false)
        await #expect(throws: ProductError.denied) { try await other.beginStudyTime(writerID: opened.initial.snapshot.handle.writerID, visitID: UUID()) }
        let lease = try await workspace.beginStudyTime(writerID: opened.initial.snapshot.handle.writerID, visitID: UUID())
        _ = try await workspace.finishStudyTime(lease, cumulativeMilliseconds: 12_500)
        let snapshot = try await workspace.load()
        #expect(snapshot.books.first?.studyMilliseconds == 12_500)
        #expect(snapshot.books.first?.plannedUnitCounts[1] == 12)
        #expect(snapshot.books.first?.plannedUnitCounts[7] == 6)
        #expect(snapshot.progress.xp == 0 && snapshot.books.first?.completedStages == 0)
        #expect(try await other.load().books.first?.studyMilliseconds == 0)
        await opened.controller.deactivate()
    }
    @Test func removingBookAvailabilityRetainsMeasuredTimeAndHistory() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let db = SQLiteLearningStore(root: root), catalog = AvailabilityCatalog()
        let workspace = ProductWorkspace(store: db, catalog: catalog, profileID: "one")
        let opened = try await workspace.openLesson(packageKey: "morning-notes-v1", stage: 1, verifiedTestAccess: false)
        let lease = try await workspace.beginStudyTime(writerID: opened.initial.snapshot.handle.writerID, visitID: UUID())
        _ = try await workspace.finishStudyTime(lease, cumulativeMilliseconds: 4_000)
        await opened.controller.deactivate()
        await catalog.remove()
        let summary = try #require(try await workspace.load().books.first)
        #expect(!summary.available && summary.studyMilliseconds == 4_000)
        #expect(try LearningBackupCodec.decode(await db.exportBackup(profileID: "one").payload)
            .studyMilliseconds(language: "english", book: "morning-notes") == 4_000)
        await #expect(throws: ProductError.denied) { try await workspace.openLesson(packageKey: "morning-notes-v1", stage: 1, verifiedTestAccess: false) }
    }
}

private actor AvailabilityCatalog: ProductCatalog {
    let base = BundledProductCatalog(root: ProductCatalogTests.sampleRoot)
    var available = true
    func remove() { available = false }
    func books() async throws -> [CatalogBook] { try await base.books() }
    func materials(packageKey: String) async throws -> BookMaterials { try await base.materials(packageKey: packageKey) }
    func permitsPractice(packageKey: String) async -> Bool {
        guard available else { return false }
        return await base.permitsPractice(packageKey: packageKey)
    }
}
