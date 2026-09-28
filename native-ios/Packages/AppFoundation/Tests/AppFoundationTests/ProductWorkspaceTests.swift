import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import AppFoundation

@Suite struct ProductWorkspaceTests {
    @Test func browsingAndDefaultsDoNotReplaceLatestLearningOrRunRate() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let db = SQLiteLearningStore(root: root)
        let workspace = ProductWorkspace(store: db, catalog: BundledProductCatalog(root: ProductCatalogTests.sampleRoot), profileID: "product-test")
        let opened = try await workspace.openLesson(packageKey: "morning-notes-v1", stage: 1, verifiedTestAccess: false)
        let controller = opened.controller
        _ = await controller.send(command(opened.initial.snapshot, .resume))
        let running = await controller.state
        _ = await controller.send(command(running.snapshot, .playbackEnded))
        let speaking = await controller.state
        let confirmed = await controller.send(command(speaking.snapshot, .confirm))
        #expect(confirmed.snapshot.progress.xp == 1)
        let latest = confirmed.snapshot.progress.latestLearning
        _ = try await workspace.select(language: "japanese", packageKey: nil)
        var preferences = LearningPreferences.fresh; preferences.rate = 2; preferences.groupSize = 3
        _ = try await workspace.saveLearningPreferences(preferences)
        let progress = try await db.readProgress(scope: opened.initial.snapshot.handle.scope, today: StudyDay("2026-09-28"))
        #expect(progress.latestLearning == latest)
        await controller.deactivate()
        let reopened = try await workspace.openLesson(packageKey: "morning-notes-v1", stage: 1, verifiedTestAccess: false)
        #expect(reopened.initial.snapshot.session.rate == 1)
        #expect(reopened.initial.snapshot.session.current.confirmed == 1)
        await reopened.controller.deactivate()
    }

    @Test func lockedOrMissingLessonCannotOpen() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: BundledProductCatalog(root: ProductCatalogTests.sampleRoot), profileID: "product-test")
        await #expect(throws: ProductError.denied) {
            try await workspace.openLesson(packageKey: "morning-notes-v1", stage: 2, verifiedTestAccess: false)
        }
        await #expect(throws: ProductError.denied) {
            try await workspace.openLesson(packageKey: "missing-v1", stage: 1, verifiedTestAccess: true)
        }
        let test = try await workspace.openLesson(packageKey: "morning-notes-v1", stage: 16, verifiedTestAccess: true)
        #expect(test.initial.snapshot.progress.completedRuns.isEmpty)
        #expect(test.initial.snapshot.progress.xp == 0)
        await test.controller.deactivate()
    }

    @Test func languageSelectionSurvivesRelaunchWithoutLearningCredit() async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: BundledProductCatalog(root: ProductCatalogTests.sampleRoot), profileID: "product-test")
        let initial = try await workspace.load()
        #expect(initial.books.count == 1)
        let selected = try await workspace.select(language: "japanese", packageKey: nil)
        #expect(selected.books.isEmpty)
        let reopened = ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: BundledProductCatalog(root: ProductCatalogTests.sampleRoot), profileID: "product-test")
        let saved = try await reopened.load()
        #expect(saved.preferences.libraryLanguage == "japanese")
        #expect(saved.preferences.libraryPackageKey == nil)
        #expect(saved.progress.xp == 0)
    }
}
