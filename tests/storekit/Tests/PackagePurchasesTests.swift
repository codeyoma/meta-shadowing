import Foundation
import StoreKit
import StoreKitTest
import Testing

// StoreKitTest changes process-wide storefront state, so these scenarios are serial.
@Suite(.serialized)
@MainActor
struct PackagePurchasesTests {
  let productID = "com.example.packagestore.book"

  func session() throws -> SKTestSession {
    let bundle = Bundle(for: BundleMarker.self)
    let url = try #require(bundle.url(forResource: "Books", withExtension: "storekit"))
    let session = try SKTestSession(contentsOf: url)
    session.resetToDefaultState()
    session.clearTransactions()
    session.disableDialogs = true
    return session
  }

  @Test func showsLocalizedStoreProductWithoutGrantingOwnership() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    await store.refresh()
    #expect(store.snapshot.product?.title == "Test Learning Book")
    #expect(store.snapshot.product?.price == "$29.00")
    #expect(store.snapshot.ownership == .notOwned)
  }

  @Test func buysOnceAndRecoversOwnershipWithoutApplicationStorage() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    await store.refresh()
    await store.purchase()
    #expect(store.snapshot.outcome == .purchased)
    #expect(store.snapshot.ownership == .owned)
    let reopened = PackagePurchases(productID: productID)
    await reopened.refresh()
    for _ in 0..<20 where reopened.snapshot.ownership != .owned {
      try await Task.sleep(for: .milliseconds(100))
      await reopened.refresh()
    }
    #expect(reopened.snapshot.ownership == .owned)
    var unfinished = 0
    for await _ in Transaction.unfinished { unfinished += 1 }
    #expect(unfinished == 0)
  }

  @Test func observesExternalPurchaseAndRefundWithoutDuplicatingSideEffects() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    store.startObserving()
    defer { store.stopObserving() }
    await store.refresh()
    let transaction = try await session.buyProduct(identifier: productID)
    try await waitUntil { store.snapshot.ownership == .owned }
    try session.refundTransaction(identifier: UInt(transaction.id))
    try await waitUntil { store.snapshot.ownership == .notOwned }
    await store.refresh()
    #expect(store.snapshot.ownership == .notOwned)
  }

  func waitUntil(_ condition: () -> Bool) async throws {
    for _ in 0..<50 {
      if condition() { return }
      try await Task.sleep(for: .milliseconds(100))
    }
    #expect(condition(), "StoreKit update did not arrive within five seconds")
  }

  @Test func explicitRestoreRecoversPurchaseAndNetworkFailureDoesNotRevokeIt() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    _ = try await session.buyProduct(identifier: productID)
    let store = PackagePurchases(productID: productID)
    await store.restore()
    #expect(store.snapshot.ownership == .owned)
    #expect(store.snapshot.outcome == .restored)
    try await session.setSimulatedError(.generic(.networkError(URLError(.notConnectedToInternet))), forAPI: StoreKitAppStoreSyncAPI())
    await store.restore()
    #expect(store.snapshot.outcome == .failed)
    #expect(store.snapshot.ownership == .owned)
  }

  @Test func verificationFailureIsNotDefinitiveLossAndCannotCreateOwnership() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    _ = try await session.buyProduct(identifier: productID)
    let store = PackagePurchases(productID: productID)
    await store.restore()
    #expect(store.snapshot.ownership == .owned)
    try await session.setSimulatedError(.verification(.invalidSignature), forAPI: StoreKitVerificationAPI())
    session.clearTransactions()
    _ = try await session.buyProduct(identifier: productID)
    await store.refresh()
    #expect(store.snapshot.ownership == .owned)
    #expect(store.snapshot.entitlementIssue == .unverified)
    let fresh = PackagePurchases(productID: productID)
    await fresh.refresh()
    #expect(fresh.snapshot.ownership == .unknown)
    #expect(fresh.snapshot.entitlementIssue == .unverified)
  }

  @Test func unrelatedUnverifiedEntitlementDoesNotBlockThisBook() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    try await session.setSimulatedError(.verification(.invalidSignature), forAPI: StoreKitVerificationAPI())
    _ = try await session.buyProduct(identifier: "com.example.packagestore.other")
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.refresh()
    #expect(store.snapshot.product?.id == productID)
    #expect(store.snapshot.ownership == .notOwned)
    #expect(store.snapshot.entitlementIssue == .none)
  }

  @Test func unrelatedUnverifiedUpdateDoesNotChangeThisBook() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    defer { store.stopObserving() }
    await store.refresh()
    let revision = store.snapshot.revision
    try await session.setSimulatedError(.verification(.invalidSignature), forAPI: StoreKitVerificationAPI())
    _ = try await session.buyProduct(identifier: "com.example.packagestore.other")
    // The observer publishes even an ignored update; wait until it has consumed it.
    try await waitUntil { store.snapshot.revision > revision }
    #expect(store.snapshot.ownership == .notOwned)
    #expect(store.snapshot.entitlementIssue == .none)
    #expect(store.snapshot.outcome == .none)
  }

  @Test(arguments: ["", "com.example.packagestore.missing"])
  func missingProductIsUnavailableNotAFabricatedOffer(id: String) async throws {
    let session = try session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: id)
    await store.refresh()
    #expect(store.snapshot.product == nil)
    #expect(store.snapshot.catalogIssue == .unavailable)
    await store.purchase()
    #expect(store.snapshot.outcome == .unavailable)
    #expect(store.snapshot.ownership != .owned)
  }

  @Test(arguments: [true, false])
  func cancelledAndFailedPurchasesDoNotGrantOwnership(cancelled: Bool) async throws {
    let session = try session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    await store.refresh()
    try await session.setSimulatedError(.generic(cancelled ? .userCancelled : .networkError(URLError(.notConnectedToInternet))), forAPI: StoreKitPurchaseAPI())
    await store.purchase()
    #expect(store.snapshot.outcome == (cancelled ? .cancelled : .failed))
    #expect(store.snapshot.ownership == .notOwned)
  }

  @Test func pendingApprovalOnlyUnlocksAfterVerifiedUpdate() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    session.askToBuyEnabled = true
    let store = PackagePurchases(productID: productID)
    store.startObserving()
    defer { store.stopObserving() }
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
    let session = try session()
    defer { session.clearTransactions() }
    _ = try await session.buyProduct(identifier: productID)
    let store = PackagePurchases(productID: productID)
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
    let session = try session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    await store.refresh()
    try await session.setSimulatedError(.verification(.invalidSignature), forAPI: StoreKitVerificationAPI())
    await store.purchase()
    #expect(store.snapshot.outcome == .unverified)
    #expect(store.snapshot.entitlementIssue == .unverified)
    #expect(store.snapshot.ownership == .notOwned)
    var unfinished = 0
    // StoreKit's local query cache can lag behind the purchase result.
    for _ in 0..<20 where unfinished == 0 {
      for await _ in Transaction.unfinished { unfinished += 1 }
      if unfinished == 0 { try await Task.sleep(for: .milliseconds(100)) }
    }
    #expect(unfinished == 1)
  }

  @Test func concurrentAndRepeatedPurchaseActionsCreateOnlyOneTransaction() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    let store = PackagePurchases(productID: productID)
    await store.refresh()
    async let first: Void = store.purchase()
    async let duplicate: Void = store.purchase()
    _ = await (first, duplicate)
    await store.purchase()
    #expect(store.snapshot.ownership == .owned)
    #expect(session.allTransactions().count == 1)
  }

  @Test func explicitApprovalRecheckRecoversAfterAskToBuyIsDeclined() async throws {
    let session = try session()
    defer { session.clearTransactions() }
    session.askToBuyEnabled = true
    let store = PackagePurchases(productID: productID)
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
