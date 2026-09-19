import Foundation
import StoreKit
import StoreKitTest
import Testing

// StoreKitTest changes process-wide storefront state, so these scenarios are serial.
@Suite(.serialized)
@MainActor
struct PackagePurchasesTests {
  let productID = "com.example.packagestore.book"

  @Test func overlappingAccessRefreshesReturnTheVerifiedResultToEveryCaller() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let transaction = try await buyProduct(session, identifier: productID)
    var results: [VerificationResult<Transaction>] = []
    for await result in Transaction.currentEntitlements { results.append(result) }
    await transaction.finish()
    session.clearTransactions()
    try await waitUntil {
      for await _ in Transaction.all { return false }
      return true
    }
    let verified = results
    let gate = ConcurrentEntitlementGate()
    let store = PackagePurchases(productID: productID, currentEntitlements: {
      await gate.wait()
      return verified
    })
    defer { store.stopObserving() }
    let access = PackageAccess(store: store)
    let first = Task { await access.refresh() }
    try await waitUntil { !gate.waiters.isEmpty }
    let second = Task { gate.secondCallerStarted = true; return await access.refresh() }
    try await waitUntil { gate.secondCallerStarted }
    gate.releaseFirst()
    let firstResult = await first.value
    gate.releaseAll()
    let secondResult = await second.value
    #expect(firstResult.allowed)
    #expect(secondResult.allowed)
  }

  @Test func staleEntitlementQueryCannotUndoNewerRestoreFailure() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let transaction = try await buyProduct(session, identifier: productID)
    var verifiedResults: [VerificationResult<Transaction>] = []
    for await result in Transaction.currentEntitlements {
      verifiedResults.append(result)
    }
    // Hold a real verified response without relying on delivery of a past update.
    await transaction.finish()
    session.clearTransactions()
    try await waitUntil {
      for await _ in Transaction.all { return false }
      return true
    }
    let gate = EntitlementQueryGate()
    let results = verifiedResults
    let store = PackagePurchases(productID: productID, currentEntitlements: {
      if gate.enabled { await withCheckedContinuation { gate.held = $0 } }
      return results
    }, synchronize: { throw URLError(.notConnectedToInternet) })
    defer { store.stopObserving() }
    let access = PackageAccess(store: store)
    #expect((await access.refresh()).allowed)
    gate.enabled = true
    let staleQuery = Task { await access.refresh() }
    try await waitUntil { gate.held != nil }
    await store.restore()
    #expect(store.snapshot.entitlementIssue == .failed)
    gate.held?.resume()
    let result = await staleQuery.value
    #expect(store.snapshot.entitlementIssue == .failed)
    #expect(!result.allowed)
  }

  @Test func paidAccessUsesVerifiedLocalEntitlementAndRevokesOldLeases() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    let access = PackageAccess(store: store)
    #expect(!(await access.refresh()).allowed)
    let transaction = try await buyProduct(session, identifier: productID)
    let allowed = await access.refresh()
    #expect(allowed.allowed)
    try access.lease.withAuthorization(revision: allowed.revision) {}
    try await session.setSimulatedError(.generic(.networkError(URLError(.notConnectedToInternet))), forAPI: StoreKitLoadProductsAPI())
    #expect((await access.refresh()).allowed)
    try session.refundTransaction(identifier: UInt(transaction.id))
    try await waitUntil { !(await access.refresh()).allowed }
    #expect(throws: (any Error).self) { try access.lease.withAuthorization(revision: allowed.revision) {} }
  }

  func session() async throws -> SKTestSession {
    let bundle = Bundle(for: BundleMarker.self)
    let url = try #require(bundle.url(forResource: "Books", withExtension: "storekit"))
    let session = try SKTestSession(contentsOf: url)
    session.resetToDefaultState()
    session.clearTransactions()
    session.disableDialogs = true
    // Clearing the fixture server does not synchronously invalidate StoreKit's query cache.
    try await waitUntil("StoreKit history did not clear") {
      for await _ in Transaction.all { return false }
      return true
    }
    return session
  }

  @Test func showsLocalizedStoreProductWithoutGrantingOwnership() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.refresh()
    #expect(store.snapshot.product?.title == "Test Learning Book")
    #expect(store.snapshot.product?.price == "$29.00")
    #expect(store.snapshot.ownership == .notOwned)
  }

  @Test func buysOnceAndRecoversOwnershipWithoutApplicationStorage() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let finishing = TransactionFinishingProbe()
    let store = PackagePurchases(productID: productID, finishTransaction: finishing.finish)
    defer { store.stopObserving() }
    await store.refresh()
    await store.purchase()
    #expect(store.snapshot.outcome == .purchased)
    #expect(store.snapshot.ownership == .owned)
    #expect(!finishing.ids.isEmpty)
    let reopened = PackagePurchases(productID: productID)
    defer { reopened.stopObserving() }
    await reopened.refresh()
    try await waitUntil("Reopened store did not recover ownership") {
      await reopened.refresh()
      return reopened.snapshot.ownership == .owned
    }
    #expect(reopened.snapshot.ownership == .owned)
    var unfinished = 0
    for await _ in Transaction.unfinished { unfinished += 1 }
    #expect(unfinished == 0)
  }

  @Test func observesExternalPurchaseAndRefundWithoutDuplicatingSideEffects() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    store.startObserving()
    await store.refresh()
    let purchaseRevision = store.snapshot.revision
    let transaction = try await buyProduct(session, identifier: productID)
    // Ownership changes before finish() returns; publication marks observer completion.
    try await waitUntil { store.snapshot.revision > purchaseRevision && store.snapshot.ownership == .owned }
    let refundRevision = store.snapshot.revision
    try session.refundTransaction(identifier: UInt(transaction.id))
    try await waitUntil { store.snapshot.revision > refundRevision && store.snapshot.ownership == .notOwned }
    await store.refresh()
    #expect(store.snapshot.ownership == .notOwned)
  }

  // Fail setup at a monotonic deadline instead of continuing into misleading assertions.
  func waitUntil(
    _ message: Comment = "StoreKit state did not arrive within ten seconds",
    _ condition: () async -> Bool
  ) async throws {
    let clock = ContinuousClock()
    let deadline = clock.now.advanced(by: .seconds(10))
    while !(await condition()) {
      try #require(clock.now < deadline, message)
      try await Task.sleep(for: .milliseconds(100))
    }
  }

  func buyProduct(_ session: SKTestSession, identifier: String) async throws -> Transaction {
    let transaction = try await session.buyProduct(identifier: identifier)
    // This is a fixture precondition, not a retry of the app's purchase/restore action.
    try await waitUntil("Fixture purchase did not reach StoreKit entitlements") {
      for await result in Transaction.currentEntitlements {
        if result.unsafePayloadValue.id == transaction.id { return true }
      }
      return false
    }
    return transaction
  }

  @Test func explicitRestoreRecoversPurchaseAndNetworkFailureDoesNotRevokeIt() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    _ = try await buyProduct(session, identifier: productID)
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.restore()
    #expect(store.snapshot.ownership == .owned)
    #expect(store.snapshot.outcome == .restored)
    try await session.setSimulatedError(.generic(.networkError(URLError(.notConnectedToInternet))), forAPI: StoreKitAppStoreSyncAPI())
    await store.restore()
    #expect(store.snapshot.outcome == .failed)
    #expect(store.snapshot.ownership == .owned)
  }

  @Test func verificationFailureIsNotDefinitiveLossAndCannotCreateOwnership() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    _ = try await buyProduct(session, identifier: productID)
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.restore()
    #expect(store.snapshot.ownership == .owned)
    try await session.setSimulatedError(.verification(.invalidSignature), forAPI: StoreKitVerificationAPI())
    session.clearTransactions()
    _ = try await buyProduct(session, identifier: productID)
    await store.refresh()
    #expect(store.snapshot.ownership == .owned)
    #expect(store.snapshot.entitlementIssue == .unverified)
    let fresh = PackagePurchases(productID: productID)
    defer { fresh.stopObserving() }
    await fresh.refresh()
    #expect(fresh.snapshot.ownership == .unknown)
    #expect(fresh.snapshot.entitlementIssue == .unverified)
  }

  @Test func unrelatedUnverifiedEntitlementDoesNotBlockThisBook() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    try await session.setSimulatedError(.verification(.invalidSignature), forAPI: StoreKitVerificationAPI())
    _ = try await buyProduct(session, identifier: "com.example.packagestore.other")
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.refresh()
    #expect(store.snapshot.product?.id == productID)
    #expect(store.snapshot.ownership == .notOwned)
    #expect(store.snapshot.entitlementIssue == .none)
  }

  @Test func unrelatedUnverifiedUpdateDoesNotChangeThisBook() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.refresh()
    let revision = store.snapshot.revision
    try await session.setSimulatedError(.verification(.invalidSignature), forAPI: StoreKitVerificationAPI())
    _ = try await buyProduct(session, identifier: "com.example.packagestore.other")
    // The observer publishes even an ignored update; wait until it has consumed it.
    try await waitUntil { store.snapshot.revision > revision }
    #expect(store.snapshot.ownership == .notOwned)
    #expect(store.snapshot.entitlementIssue == .none)
    #expect(store.snapshot.outcome == .none)
  }

  @Test(arguments: ["", "com.example.packagestore.missing"])
  func missingProductIsUnavailableNotAFabricatedOffer(id: String) async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: id)
    defer { store.stopObserving() }
    await store.refresh()
    #expect(store.snapshot.product == nil)
    #expect(store.snapshot.catalogIssue == .unavailable)
    await store.purchase()
    #expect(store.snapshot.outcome == .unavailable)
    #expect(store.snapshot.ownership != .owned)
  }

  @Test(arguments: [true, false])
  func cancelledAndFailedPurchasesDoNotGrantOwnership(cancelled: Bool) async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.refresh()
    try await session.setSimulatedError(.generic(cancelled ? .userCancelled : .networkError(URLError(.notConnectedToInternet))), forAPI: StoreKitPurchaseAPI())
    await store.purchase()
    #expect(store.snapshot.outcome == (cancelled ? .cancelled : .failed))
    #expect(store.snapshot.ownership == .notOwned)
  }

  @Test func pendingApprovalOnlyUnlocksAfterVerifiedUpdate() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    session.askToBuyEnabled = true
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    store.startObserving()
    await store.refresh()
    await store.purchase()
    #expect(store.snapshot.outcome == .pending)
    #expect(store.snapshot.ownership == .notOwned)
    let pending = try #require(session.allTransactions().first)
    try session.approveAskToBuyTransaction(identifier: pending.identifier)
    try await waitUntil { store.snapshot.ownership == .owned }
    #expect(store.snapshot.outcome == .purchased)
  }

  @Test func failedCatalogRefreshCannotTurnUnknownAvailabilityIntoRevocation() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    _ = try await buyProduct(session, identifier: productID)
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.restore()
    #expect(store.snapshot.ownership == .owned)
    store.stopObserving()
    // Simulate unavailable cached history and a disconnected product lookup.
    session.clearTransactions()
    try await session.setSimulatedError(.generic(.networkError(URLError(.notConnectedToInternet))), forAPI: StoreKitLoadProductsAPI())
    await store.refresh()
    #expect(store.snapshot.catalogIssue == .failed)
    #expect(store.snapshot.entitlementIssue == .failed)
    #expect(store.snapshot.ownership == .owned)
  }

  @Test func unverifiedPurchaseIsNotFinishedOrUnlocked() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let finishing = TransactionFinishingProbe()
    let store = PackagePurchases(productID: productID, finishTransaction: finishing.finish)
    defer { store.stopObserving() }
    await store.refresh()
    try await session.setSimulatedError(.verification(.invalidSignature), forAPI: StoreKitVerificationAPI())
    await store.purchase()
    #expect(store.snapshot.outcome == .unverified)
    #expect(store.snapshot.entitlementIssue == .unverified)
    #expect(store.snapshot.ownership == .notOwned)
    let purchases = session.allTransactions().filter { $0.productIdentifier == productID }
    #expect(purchases.count == 1)
    // Observe the app's finish boundary, not a second StoreKit query after
    // changing process-wide verification faults (runtime/cache dependent).
    #expect(finishing.ids.isEmpty)
    store.stopObserving()
    #expect(store.snapshot.outcome == .unverified)
    #expect(store.snapshot.ownership == .notOwned)
  }

  @Test func concurrentAndRepeatedPurchaseActionsCreateOnlyOneTransaction() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.refresh()
    async let first: Void = store.purchase()
    async let duplicate: Void = store.purchase()
    _ = await (first, duplicate)
    await store.purchase()
    #expect(store.snapshot.ownership == .owned)
    #expect(session.allTransactions().count == 1)
  }

  @Test func explicitApprovalRecheckRecoversAfterAskToBuyIsDeclined() async throws {
    let session = try await session()
    defer { session.clearTransactions() }
    session.askToBuyEnabled = true
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.refresh()
    await store.purchase()
    let pending = try #require(session.allTransactions().first)
    try session.declineAskToBuyTransaction(identifier: pending.identifier)
    // Denial need not generate an update. The labeled recovery action is explicit sync.
    await store.restore()
    #expect(store.snapshot.ownership == .notOwned)
    #expect(store.snapshot.outcome == .restored)
    await store.purchase()
    #expect(store.snapshot.outcome == .pending)
  }
}

private final class BundleMarker: NSObject {}

@MainActor private final class EntitlementQueryGate {
  var enabled = false
  var held: CheckedContinuation<Void, Never>?
}

@MainActor private final class TransactionFinishingProbe {
  var ids = Set<UInt64>()
  func finish(_ transaction: Transaction) async {
    ids.insert(transaction.id)
    await transaction.finish()
  }
}

@MainActor private final class ConcurrentEntitlementGate {
  var secondCallerStarted = false
  var waiters: [CheckedContinuation<Void, Never>] = []
  func wait() async { await withCheckedContinuation { waiters.append($0) } }
  func releaseFirst() { if !waiters.isEmpty { waiters.removeFirst().resume() } }
  func releaseAll() { while !waiters.isEmpty { releaseFirst() } }
}
