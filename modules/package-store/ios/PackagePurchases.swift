import Foundation
import StoreKit

struct StoreProduct: Codable, Equatable, Sendable {
  let id: String
  let title: String
  let price: String
}

enum PackageOwnership: String, Codable { case unknown, notOwned, owned }
enum StoreOutcome: String, Codable { case none, purchased, restored, cancelled, pending, unverified, failed, unavailable }

struct StoreSnapshot: Codable {
  var revision = 0
  var busy = false
  var product: StoreProduct?
  var ownership: PackageOwnership = .unknown
  var outcome: StoreOutcome = .none
  var entitlementIssue: StoreOutcome = .none
  var catalogIssue: StoreOutcome = .none
}

/// StoreKit is the only ownership authority. No application-owned receipt flag is persisted.
@MainActor
final class PackagePurchases {
  private let productID: String
  private var product: Product?
  private var observer: Task<Void, Never>?
  private var entitlementRevision = 0
  var onChange: ((StoreSnapshot) -> Void)?
  private(set) var snapshot = StoreSnapshot()

  init(productID: String) { self.productID = productID }

  func startObserving() {
    guard observer == nil else { return }
    observer = Task { [weak self] in
      for await result in Transaction.updates {
        guard !Task.isCancelled else { break }
        await self?.handleUpdate(result)
      }
    }
  }

  func stopObserving() { observer?.cancel(); observer = nil }
  deinit { observer?.cancel() }

  private func handleUpdate(_ result: VerificationResult<Transaction>) async {
    defer { publish() }
    if case .unverified(let transaction, _) = result {
      // Untrusted metadata may exclude an unrelated result, never grant ownership.
      guard transaction.productID == productID, transaction.productType == .nonConsumable else { return }
      entitlementRevision += 1
      snapshot.entitlementIssue = .unverified
      snapshot.outcome = .unverified
      return
    }
    guard case .verified(let transaction) = result,
          transaction.productID == productID, transaction.productType == .nonConsumable else { return }
    await applyVerified(transaction)
  }

  private func applyVerified(_ transaction: Transaction) async {
    entitlementRevision += 1
    snapshot.entitlementIssue = .none
    snapshot.ownership = transaction.revocationDate == nil ? .owned : .notOwned
    snapshot.outcome = transaction.revocationDate == nil ? .purchased : .none
    // Setting ownership is idempotent; no XP, history or download side effects.
    await transaction.finish()
  }

  func purchase() async {
    guard !snapshot.busy else { return }
    guard snapshot.ownership != .owned, snapshot.outcome != .pending else { return }
    snapshot.busy = true
    publish()
    defer { snapshot.busy = false; publish() }
    startObserving()
    guard let product else { snapshot.outcome = .unavailable; return }
    do {
      switch try await product.purchase() {
      case .success(let result):
        guard case .verified(let transaction) = result,
              transaction.productID == productID, transaction.productType == .nonConsumable else {
          snapshot.outcome = .unverified
          snapshot.entitlementIssue = .unverified
          return
        }
        await applyVerified(transaction)
      case .userCancelled: snapshot.outcome = .cancelled
      case .pending: snapshot.outcome = .pending
      @unknown default: snapshot.outcome = .failed
      }
    } catch { snapshot.outcome = .failed }
  }

  func refresh() async {
    guard !snapshot.busy else { return }
    if snapshot.outcome != .pending { snapshot.outcome = .none }
    snapshot.busy = true
    publish()
    defer { snapshot.busy = false; publish() }
    startObserving()
    do {
      product = productID.isEmpty ? nil : try await Product.products(for: [productID]).first(where: { $0.type == .nonConsumable })
      snapshot.catalogIssue = product == nil ? .unavailable : .none
    } catch {
      product = nil
      snapshot.catalogIssue = .failed
    }
    snapshot.product = product.map { StoreProduct(id: $0.id, title: $0.displayName, price: $0.displayPrice) }
    await refreshEntitlements(preserveOnAbsence: snapshot.catalogIssue == .failed)
  }

  /// Forced synchronization is explicit; routine refresh never calls AppStore.sync().
  func restore() async {
    guard !snapshot.busy else { return }
    guard !productID.isEmpty else { snapshot.outcome = .unavailable; publish(); return }
    snapshot.busy = true
    publish()
    defer { snapshot.busy = false; publish() }
    startObserving()
    do {
      try await AppStore.sync()
      await refreshEntitlements()
      snapshot.outcome = snapshot.entitlementIssue == .unverified ? .unverified : .restored
    } catch {
      snapshot.outcome = .failed
      snapshot.entitlementIssue = .failed
    }
  }

  private func refreshEntitlements(preserveOnAbsence: Bool = false) async {
    let revision = entitlementRevision
    var ownership = PackageOwnership.notOwned
    var unverified = false
    for await result in Transaction.currentEntitlements {
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
    onChange?(snapshot)
  }
}
