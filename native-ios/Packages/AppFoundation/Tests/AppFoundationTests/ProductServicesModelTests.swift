import AppleServices
import Foundation
import LearningDomain
import LearningPersistence
import Testing
@testable import AppFoundation

@MainActor struct ProductServicesModelTests {
    @Test func destructiveRetryWithoutCommittedIntentRequestsFreshConfirmation() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root)
        let services = try makeServices(store, cloud: UnavailableCloud(), root: root)
        await services.setActive(true)
        let token = services.profiles.registerBoundary { throw CancellationError() }
        #expect(await services.perform(services.confirmation(.removeLocal)) == false)
        services.profiles.unregisterBoundary(token)
        await services.setActive(false)
        await services.setActive(true)
        await services.retrySync()
        #expect(services.retryConfirmation?.action == .removeLocal)
        #expect(services.retryConfirmation?.profileID == "local")
        await services.setActive(false)
    }
    @Test func durableResetRetrySurvivesForegroundWithoutRepeatingConfirmation() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root)
        let lease = try await store.activateService(scope: "account")
        try await store.setServiceConsent(false, lease: lease)
        _ = try await store.savePreferences(.init(libraryLanguage: "french"), profileID: lease.profileID)
        let cloud = PausingCloud()
        await cloud.failDiscard(true)
        let services = try makeServices(store, cloud: cloud, root: root)
        await services.setActive(true)
        #expect(await services.perform(services.confirmation(.removeLocal)) == false)
        #expect(services.syncState.resetPending)
        await services.setActive(false)
        await services.setActive(true)
        await cloud.failDiscard(false)
        await services.retrySync()
        #expect(!services.syncState.resetPending)
        #expect(services.retryConfirmation == nil)
        #expect(try await store.preferences(profileID: lease.profileID) == ProfilePreferences())
        await services.setActive(false)
    }
    @Test func retryAfterFirstAccountSelectionActuallyRetriesTheFailedAction() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root)
        let cloud = PausingCloud()
        let services = try makeServices(store, cloud: cloud, root: root)
        await services.setActive(true)
        #expect(await services.perform(services.confirmation(.refresh(importGuest: true))) == false)
        #expect(services.syncState.profileID != "local")
        let before = await cloud.listCount
        await services.retrySync()
        #expect(await cloud.listCount > before)
        await services.setActive(false)
        await services.setActive(true)
        let foregroundCount = await cloud.listCount
        await services.retrySync()
        #expect(await cloud.listCount > foregroundCount)
        await services.setActive(false)
    }
    @Test func backgroundStopsServicesWithoutWaitingForBlockedForegroundFetch() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root)
        let lease = try await store.activateService(scope: "account")
        try await store.setServiceConsent(true, lease: lease)
        let cloud = PausingCloud()
        await cloud.pauseNextList()
        let services = try makeServices(store, cloud: cloud, root: root)
        let foreground = Task { await services.setActive(true) }
        for _ in 0..<500 {
            if await cloud.waiting { break }
            try await Task.sleep(for: .milliseconds(2))
        }
        #expect(await cloud.waiting)
        let stopsBefore = await cloud.stops
        var backgroundFinished = false
        let background = Task { await services.setActive(false); backgroundFinished = true }
        for _ in 0..<500 {
            if backgroundFinished { break }
            try await Task.sleep(for: .milliseconds(2))
        }
        let stoppedBeforeRelease = await cloud.stops > stopsBefore
        let finishedBeforeRelease = backgroundFinished
        await cloud.release()
        await foreground.value; await background.value
        #expect(stoppedBeforeRelease)
        #expect(finishedBeforeRelease)
    }
    @Test func unavailableServicesLeaveLocalHistoryUsableAndRejectOldConfirmation() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let store = SQLiteLearningStore(root: root)
        _ = try await store.savePreferences(.init(libraryLanguage: "french"), profileID: "local")
        let profiles = ProductProfileOwner(store: store, catalog: ServiceTestCatalog())
        let ownership = OwnershipService(productID: "", currentEntitlements: { [] })
        let access = PackageAccess(store: ownership)
        let delivery = try ContentDelivery(root: root.appendingPathComponent("content"), packages: [])
        let services = ProductServicesModel(profiles: profiles, store: store, ownership: ownership, access: access,
            delivery: delivery, transport: UnavailableCloud(), packages: [])
        await services.setActive(true)
        await services.refreshAccount()
        #expect(services.syncState.account == .unavailable)
        #expect(!services.syncState.enabled)
        let old = services.confirmation(.removeLocal)
        await services.setActive(false)
        #expect(await services.perform(old) == false)
        #expect(try await store.preferences(profileID: "local").libraryLanguage == "french")
    }
}

@MainActor private func makeServices(_ store: SQLiteLearningStore, cloud: any CloudTransport, root: URL) throws -> ProductServicesModel {
    let profiles = ProductProfileOwner(store: store, catalog: ServiceTestCatalog())
    let ownership = OwnershipService(productID: "", currentEntitlements: { [] })
    return ProductServicesModel(profiles: profiles, store: store, ownership: ownership, access: PackageAccess(store: ownership),
        delivery: try ContentDelivery(root: root.appendingPathComponent("content"), packages: []), transport: cloud, packages: [])
}
private actor PausingCloud: CloudTransport {
    var listCount = 0
    var stops = 0
    var waiting: Bool { continuation != nil }
    private var pause = false
    private var discardFails = false
    private var continuation: CheckedContinuation<Void, Never>?
    func pauseNextList() { pause = true }
    func failDiscard(_ value: Bool) { discardFails = value }
    func release() { continuation?.resume(); continuation = nil }
    func account() -> CloudAccount { .available("account") }
    func accountChanges() -> AsyncStream<Void> { AsyncStream { $0.finish() } }
    func list(scope: String) async throws -> [CloudBackup] {
        listCount += 1
        if pause { pause = false; await withCheckedContinuation { continuation = $0 } }
        throw ProgressCloudError.offline
    }
    func read(scope: String, id: String) throws -> Data { throw ProgressCloudError.unavailable }
    func publish(scope: String, revision: Int64, payload: Data, base: String) throws -> CloudPublication { throw ProgressCloudError.unavailable }
    func reset(scope: String, requestID: UUID, expectedGeneration: String?, payload: Data) throws -> CloudPublication { throw ProgressCloudError.unavailable }
    func cleanupAdopted(scope: String, base: String, abandoned: String?) throws -> Bool { throw ProgressCloudError.unavailable }
    func discardLocal(scope: String) throws { if discardFails { throw ProgressCloudError.offline } }
    func stop() { stops += 1 }
}

private struct ServiceTestCatalog: ProductCatalog {
    func books() async throws -> [CatalogBook] { [] }
    func materials(packageKey: String) async throws -> BookMaterials { throw ProductError.unavailable }
    func permitsPractice(packageKey: String) async -> Bool { false }
}
private struct UnavailableCloud: CloudTransport {
    func account() async -> CloudAccount { .unavailable }
    func accountChanges() async -> AsyncStream<Void> { AsyncStream { $0.finish() } }
    func list(scope: String) async throws -> [CloudBackup] { throw ProgressCloudError.unavailable }
    func read(scope: String, id: String) async throws -> Data { throw ProgressCloudError.unavailable }
    func publish(scope: String, revision: Int64, payload: Data, base: String) async throws -> CloudPublication { throw ProgressCloudError.unavailable }
    func reset(scope: String, requestID: UUID, expectedGeneration: String?, payload: Data) async throws -> CloudPublication { throw ProgressCloudError.unavailable }
    func cleanupAdopted(scope: String, base: String, abandoned: String?) async throws -> Bool { throw ProgressCloudError.unavailable }
    func discardLocal(scope: String) async throws { }
    func stop() async { }
}
