import AppFoundation
import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import MetaShadowingNative

@MainActor @Suite(.serialized) struct LearningEntryTests {
    @Test func lateDismissalCannotCancelAReplacementLesson() async throws {
        let fixture = try EntryFixture()
        defer { fixture.remove() }
        await fixture.catalog.release()
        let entry = LearningEntry()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 1, model: fixture.model)
        try await waitForMedia { !entry.preparing }
        let first = try #require(entry.route)
        entry.cancelPreparation()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 2, model: fixture.model)
        try await waitForMedia { !entry.preparing }
        let replacement = try #require(entry.route)

        entry.didDismiss(first.id)

        #expect(entry.route?.id == replacement.id)
        #expect(entry.route?.flow.runtime?.state.controller.active == true)
        await first.flow.close()
        await replacement.flow.close()
    }

    @Test(arguments: [false, true])
    func readyButUnpresentedLessonCanStillBeCancelled(profileChange: Bool) async throws {
        let fixture = try EntryFixture()
        defer { fixture.remove() }
        await fixture.catalog.release()
        let profiles = ProductProfileOwner(store: fixture.store, catalog: fixture.catalog)
        let entry = LearningEntry()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 1, model: profiles.model, profiles: profiles)
        try await waitForMedia { !entry.preparing }
        let runtime = try #require(entry.route?.flow.runtime)
        if profileChange { try await profiles.prepareBoundary() }
        else { entry.cancelPreparation() }
        #expect(entry.route == nil && !entry.failed)
        try await waitForMedia { !runtime.state.controller.active }
        #expect(!runtime.coordinator.remoteState.actionable)
    }

    @Test func preparingKeepsStagesVisibleAndCoalescesRepeatedTaps() async throws {
        let fixture = try EntryFixture()
        defer { fixture.remove() }
        let entry = LearningEntry()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 1, model: fixture.model)
        try #require(entry.preparing)
        #expect(entry.route == nil)
        try await fixture.catalog.waitForRequest()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 2, model: fixture.model)
        #expect(await fixture.catalog.reads == 1)
        await fixture.catalog.release()
        try await waitForMedia { !entry.preparing }
        let route = try #require(entry.route)
        #expect(route.stage == 1)
        #expect(route.flow.runtime?.state.controller.paused == true)
        #expect(route.flow.runtime?.controls.xp == 0)
        let runtime = try #require(route.flow.runtime)
        entry.didPresent(route.id)
        entry.cancelPreparation()
        #expect(entry.route?.id == route.id, "The presented player owns its normal lifecycle after handoff")
        entry.didDismiss(route.id)
        try await waitForMedia { !runtime.state.controller.active }
    }

    @Test func cancellationDiscardsLatePreparationWithoutPresentingAnError() async throws {
        let fixture = try EntryFixture()
        defer { fixture.remove() }
        let entry = LearningEntry()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 1, model: fixture.model)
        try #require(entry.preparing)
        try await fixture.catalog.waitForRequest()
        entry.cancelPreparation()
        #expect(!entry.preparing && entry.route == nil && !entry.failed)
        await fixture.catalog.release()
        // Starting again waits for old teardown; the cancelled first result cannot win.
        entry.prepare(packageKey: "ui-fixture-v1", stage: 2, model: fixture.model)
        try await waitForMedia { !entry.preparing }
        let route = try #require(entry.route)
        #expect(route.stage == 2)
        #expect(route.flow.runtime?.state.controller.paused == true)
        let runtime = try #require(route.flow.runtime)
        entry.didDismiss(route.id)
        try await waitForMedia { !runtime.state.controller.active }
    }

    @Test func failedPreparationStaysOnStagesAndCanRetry() async throws {
        let fixture = try EntryFixture()
        defer { fixture.remove() }
        await fixture.catalog.release(failing: true)
        let entry = LearningEntry()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 1, model: fixture.model)
        try await waitForMedia { !entry.preparing }
        #expect(entry.route == nil && entry.failed)
        await fixture.catalog.release()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 1, model: fixture.model)
        try await waitForMedia { !entry.preparing }
        let route = try #require(entry.route)
        let runtime = try #require(route.flow.runtime)
        #expect(!entry.failed && runtime.state.controller.paused)
        entry.didDismiss(route.id)
        try await waitForMedia { !runtime.state.controller.active }
    }

    @Test func profileBoundaryCancelsUnpresentedLearning() async throws {
        let fixture = try EntryFixture()
        defer { fixture.remove() }
        let profiles = ProductProfileOwner(store: fixture.store, catalog: fixture.catalog)
        let entry = LearningEntry()
        entry.prepare(packageKey: "ui-fixture-v1", stage: 1, model: profiles.model, profiles: profiles)
        try #require(entry.preparing)
        try await fixture.catalog.waitForRequest()
        try await profiles.prepareBoundary()
        #expect(!entry.preparing && entry.route == nil)
        await fixture.catalog.release()
        try await profiles.selectProfile("replacement")
        #expect(entry.route == nil && !entry.failed)
        #expect(profiles.model.snapshot?.progress.xp == 0)
    }
}

@MainActor private struct EntryFixture {
    let root: URL
    let store: SQLiteLearningStore
    let catalog: HeldEntryCatalog
    let model: ProductModel
    init() throws {
        root = try MediaFixtureFactory.root()
        store = SQLiteLearningStore(root: root.appending(path: "store"))
        catalog = HeldEntryCatalog(root: root.appending(path: "assets"))
        model = ProductModel(workspace: ProductWorkspace(store: store, catalog: catalog, profileID: "entry-test"))
    }
    func remove() { try? FileManager.default.removeItem(at: root) }
}

private actor HeldEntryCatalog: ProductCatalog {
    let base: ProductTestCatalog
    private var hold = true
    private var failing = false
    private var continuation: CheckedContinuation<Void, Never>?
    private(set) var reads = 0
    init(root: URL) { base = ProductTestCatalog(root: root, mode: "audio") }
    func books() async -> [CatalogBook] { await base.books() }
    func permitsPractice(packageKey: String) async -> Bool { await base.permitsPractice(packageKey: packageKey) }
    func materials(packageKey: String) async throws -> BookMaterials {
        reads += 1
        if hold { await withCheckedContinuation { continuation = $0 } }
        if failing { throw ProductError.denied }
        return try await base.materials(packageKey: packageKey)
    }
    func release(failing: Bool = false) {
        hold = false; self.failing = failing
        continuation?.resume(); continuation = nil
    }
    func waitForRequest() async throws {
        let deadline = ContinuousClock.now + .seconds(5)
        while reads == 0, ContinuousClock.now < deadline { try await Task.sleep(for: .milliseconds(10)) }
        try #require(reads > 0)
    }
}
