import Foundation
import Testing
@testable import AppleServices

struct OwnershipTests {
    @Test @MainActor func unconfiguredAccessNeverQueriesStoreKitEntitlements() async {
        let service = OwnershipService(productID: "", currentEntitlements: {
            Issue.record("An unconfigured product must not query StoreKit entitlements")
            return []
        })
        defer { service.stopObserving() }
        let access = PackageAccess(store: service)
        #expect(!(await access.refresh()).allowed)
        await service.refresh()
        #expect(service.snapshot.product == nil)
        #expect(service.snapshot.catalogIssue == .unavailable)
    }
    @Test @MainActor func stoppedRestoreCannotPublishIntoRestartedService() async throws {
        var held: CheckedContinuation<Void, Never>?
        let service = OwnershipService(productID: "com.example.book", currentEntitlements: { [] }, synchronize: {
            await withCheckedContinuation { held = $0 }
        })
        let old = Task { await service.restore() }
        while held == nil { await Task.yield() }
        await service.stop()
        await service.refreshAccess()
        let revision = service.snapshot.revision
        held?.resume()
        await old.value
        #expect(service.snapshot.revision == revision)
        #expect(service.snapshot.outcome == .none)
        service.stopObserving()
    }

    @Test @MainActor func emptyProductCannotRestoreOrRequestSynchronization() async {
        let service = OwnershipService(productID: "", synchronize: { Issue.record("An unconfigured product must not contact App Store sync") })
        await service.restore()
        #expect(service.snapshot.outcome == .unavailable)
        #expect(service.snapshot.ownership == .unknown)
    }

    @Test func deniedLeaseCannotPublish() {
        let lease = PackageAccessLease()
        #expect(throws: CancellationError.self) { try lease.withAuthorization(revision: lease.snapshot.revision) {} }
        lease.update(true)
        let owned = lease.snapshot
        lease.update(false)
        #expect(throws: CancellationError.self) { try lease.withAuthorization(revision: owned.revision) {} }
    }
    @Test @MainActor func stoppingEndsSnapshotSubscriptionWithoutRestartingServices() async throws {
        let service = OwnershipService(productID: "", currentEntitlements: { [] })
        let updates = await service.snapshots()
        var iterator = updates.makeAsyncIterator()
        let initial = await iterator.next()
        #expect(initial?.ownership == .unknown)
        await service.stop()
        while let value = await iterator.next() { #expect(value.ownership == .unknown) }
        #expect(service.snapshot.busy == false)
    }
    @Test @MainActor func stoppedServiceRejectsLateEntitlementQuery() async throws {
        var held: CheckedContinuation<Void, Never>?
        let service = OwnershipService(productID: "com.example.book", currentEntitlements: {
            await withCheckedContinuation { held = $0 }
            return []
        })
        let query = Task { await service.refreshAccess() }
        while held == nil { await Task.yield() }
        service.stopObserving()
        let before = service.snapshot.revision
        held?.resume()
        await query.value
        #expect(service.snapshot.revision == before)
        #expect(service.snapshot.ownership == .unknown)
    }
    @Test func replacingAllowedAuthorityInvalidatesAnOlderPublication() throws {
        let lease = PackageAccessLease()
        lease.update(true)
        let old = lease.snapshot
        try lease.withAuthorization(revision: old.revision) {}
        lease.update(true)
        #expect(lease.snapshot.allowed)
        #expect(throws: CancellationError.self) {
            try lease.withAuthorization(revision: old.revision) {
                Issue.record("Old authority must not publish content")
            }
        }
    }
}
