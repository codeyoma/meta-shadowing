import Foundation
import StoreKit

public struct StoreProduct: Codable, Equatable, Sendable {
  public let id: String
  public let title: String
  public let price: String
}

public enum PackageOwnership: String, Codable, Sendable { case unknown, notOwned, owned }
public enum StoreOutcome: String, Codable, Sendable { case none, purchased, restored, cancelled, pending, unverified, failed, unavailable }

public struct OwnershipSnapshot: Codable, Sendable {
  public internal(set) var revision = 0
  public internal(set) var busy = false
  public internal(set) var product: StoreProduct?
  public internal(set) var ownership: PackageOwnership = .unknown
  public internal(set) var outcome: StoreOutcome = .none
  public internal(set) var entitlementIssue: StoreOutcome = .none
  public internal(set) var catalogIssue: StoreOutcome = .none
}

/// StoreKit is the only ownership authority. No application-owned receipt flag is persisted.
@MainActor
public final class OwnershipService {
  private let productID: String
  private let currentEntitlements: @MainActor () async -> [VerificationResult<Transaction>]
  private let synchronize: @MainActor () async throws -> Void
  private let finishTransaction: @MainActor (Transaction) async -> Void
  private let purchaseProduct: @MainActor (Product) async throws -> Product.PurchaseResult
  private var product: Product?
  private var observer: Task<Void, Never>?
  private var entitlementRevision = 0
  private var lifetime = UUID()
  private var streams: [UUID: AsyncStream<OwnershipSnapshot>.Continuation] = [:]
  var onChange: ((OwnershipSnapshot) -> Void)?
  var accessChange: ((OwnershipSnapshot) -> Void)?
  public private(set) var snapshot = OwnershipSnapshot()

  public init(
    productID: String,
    currentEntitlements: @escaping @MainActor () async -> [VerificationResult<Transaction>] = {
      var results: [VerificationResult<Transaction>] = []
      for await result in Transaction.currentEntitlements { results.append(result) }
      return results
    },
    synchronize: @escaping @MainActor () async throws -> Void = { try await AppStore.sync() },
    finishTransaction: @escaping @MainActor (Transaction) async -> Void = { await $0.finish() },
    purchaseProduct: @escaping @MainActor (Product) async throws -> Product.PurchaseResult = { try await $0.purchase() }
  ) {
    self.productID = productID
    self.currentEntitlements = currentEntitlements
    self.synchronize = synchronize
    self.finishTransaction = finishTransaction
    self.purchaseProduct = purchaseProduct
  }

  public func startObserving() {
    // Unconfigured builds must not initialize a StoreKit environment at launch.
    guard !productID.isEmpty, observer == nil else { return }
    let lifetime = lifetime
    observer = Task { [weak self] in
      for await result in Transaction.updates {
        guard !Task.isCancelled, self?.lifetime == lifetime else { break }
        await self?.handleUpdate(result)
      }
    }
  }

  public func stopObserving() {
    lifetime = UUID()
    entitlementRevision += 1
    observer?.cancel(); observer = nil
    snapshot.busy = false
  }
  public func snapshots() async -> AsyncStream<OwnershipSnapshot> {
    let id = UUID()
    let (stream, continuation) = AsyncStream<OwnershipSnapshot>.makeStream(bufferingPolicy: .bufferingNewest(1))
    streams[id] = continuation
    continuation.yield(snapshot)
    continuation.onTermination = { [weak self] _ in
      Task { @MainActor in self?.streams[id] = nil }
    }
    return stream
  }
  public func stop() async {
    stopObserving()
    product = nil
    snapshot = OwnershipSnapshot()
    publish()
    for continuation in streams.values { continuation.finish() }
    streams.removeAll()
  }
  deinit { observer?.cancel() }

  private func handleUpdate(_ result: VerificationResult<Transaction>) async {
    let lifetime = lifetime
    defer { if self.lifetime == lifetime { publish() } }
    if case .unverified(let transaction, _) = result {
      // Untrusted metadata may exclude an unrelated result, never grant ownership.
      guard transaction.productID == productID, transaction.productType == .nonConsumable else { return }
      invalidateEntitlements(.unverified)
      return
    }
    guard case .verified(let transaction) = result,
          transaction.productID == productID, transaction.productType == .nonConsumable else { return }
    await applyVerified(transaction)
  }

  private func invalidateEntitlements(_ issue: StoreOutcome) {
    // Queries started before this failure must not republish their older authority.
    entitlementRevision += 1
    snapshot.entitlementIssue = issue
    snapshot.outcome = issue
  }

  private func applyVerified(_ transaction: Transaction) async {
    entitlementRevision += 1
    snapshot.entitlementIssue = .none
    snapshot.ownership = transaction.revocationDate == nil ? .owned : .notOwned
    snapshot.outcome = transaction.revocationDate == nil ? .purchased : .none
    // Setting ownership is idempotent; no XP, history or download side effects.
    publish()
    await finishTransaction(transaction)
  }

  public func purchase() async {
    guard !snapshot.busy else { return }
    guard snapshot.ownership != .owned, snapshot.outcome != .pending else { return }
    snapshot.busy = true
    let lifetime = lifetime
    publish()
    defer { if self.lifetime == lifetime { snapshot.busy = false; publish() } }
    startObserving()
    guard let product else { snapshot.outcome = .unavailable; return }
    do {
      let result = try await purchaseProduct(product)
      guard self.lifetime == lifetime else { return }
      switch result {
      case .success(let result):
        guard case .verified(let transaction) = result,
              transaction.productID == productID, transaction.productType == .nonConsumable else {
          invalidateEntitlements(.unverified)
          return
        }
        await applyVerified(transaction)
      case .userCancelled: snapshot.outcome = .cancelled
      case .pending: snapshot.outcome = .pending
      @unknown default: snapshot.outcome = .failed
      }
    } catch {
      guard self.lifetime == lifetime else { return }
      if case StoreKitError.userCancelled = error { snapshot.outcome = .cancelled }
      else { snapshot.outcome = .failed }
    }
  }

  public func refresh() async {
    guard !snapshot.busy else { return }
    if snapshot.outcome != .pending { snapshot.outcome = .none }
    snapshot.busy = true
    let lifetime = lifetime
    publish()
    defer { if self.lifetime == lifetime { snapshot.busy = false; publish() } }
    startObserving()
    do {
      let loaded = productID.isEmpty ? nil : try await Product.products(for: [productID]).first(where: { $0.type == .nonConsumable })
      guard self.lifetime == lifetime else { return }
      product = loaded
      snapshot.catalogIssue = product == nil ? .unavailable : .none
    } catch {
      guard self.lifetime == lifetime else { return }
      product = nil
      snapshot.catalogIssue = .failed
    }
    snapshot.product = product.map { StoreProduct(id: $0.id, title: $0.displayName, price: $0.displayPrice) }
    await refreshEntitlements(preserveOnAbsence: snapshot.catalogIssue == .failed)
  }

  /// Forced synchronization is explicit; routine refresh never calls AppStore.sync().
  public func restore() async {
    guard !snapshot.busy else { return }
    guard !productID.isEmpty else { snapshot.outcome = .unavailable; publish(); return }
    snapshot.busy = true
    let lifetime = lifetime
    publish()
    defer { if self.lifetime == lifetime { snapshot.busy = false; publish() } }
    startObserving()
    do {
      try await synchronize()
      guard self.lifetime == lifetime else { return }
      await refreshEntitlements()
      guard self.lifetime == lifetime else { return }
      snapshot.outcome = snapshot.entitlementIssue == .unverified ? .unverified : .restored
    } catch {
      guard self.lifetime == lifetime else { return }
      invalidateEntitlements(.failed)
    }
  }

  public func refreshAccess() async {
    let lifetime = lifetime
    startObserving()
    await refreshEntitlements()
    if self.lifetime == lifetime { publish() }
  }

  private func refreshEntitlements(preserveOnAbsence: Bool = false) async {
    guard !productID.isEmpty else {
      snapshot.ownership = .notOwned
      snapshot.entitlementIssue = .none
      return
    }
    entitlementRevision += 1
    let revision = entitlementRevision
    var ownership = PackageOwnership.notOwned
    var unverified = false
    for result in await currentEntitlements() {
      if case .unverified(let transaction, _) = result,
         transaction.productID == productID, transaction.productType == .nonConsumable {
        unverified = true
      }
      if case .verified(let transaction) = result, transaction.productID == productID,
         transaction.revocationDate == nil, transaction.productType == .nonConsumable {
        ownership = .owned
      }
    }
    if revision == entitlementRevision {
      let uncertain = unverified || (preserveOnAbsence && ownership == .notOwned)
      snapshot.entitlementIssue = unverified ? .unverified : uncertain ? .failed : .none
      // An invalid signature is not proof that a previous verified entitlement was revoked.
      if !uncertain || ownership == .owned { snapshot.ownership = ownership }
    }
  }

  private func publish() {
    snapshot.revision += 1
    accessChange?(snapshot)
    onChange?(snapshot)
    for continuation in streams.values { continuation.yield(snapshot) }
  }
}
