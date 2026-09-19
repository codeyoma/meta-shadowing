import Foundation
import Synchronization

public struct PackageAccessSnapshot: Sendable {
  public let revision: Int
  public let allowed: Bool
}

/// A short synchronous filesystem publication can share this lock with revocation.
/// Never hold it across an await or while downloading/hashing files.
public final class PackageAccessLease: Sendable {
  private let state = Mutex(PackageAccessSnapshot(revision: 0, allowed: false))
  public var snapshot: PackageAccessSnapshot { state.withLock { $0 } }
  func update(_ allowed: Bool) {
    state.withLock { if $0.allowed != allowed { $0 = PackageAccessSnapshot(revision: $0.revision + 1, allowed: allowed) } }
  }
  public func withAuthorization(revision: Int, _ operation: () throws -> Void) throws {
    try state.withLock {
      guard $0.allowed && $0.revision == revision else { throw CancellationError() }
      try operation()
    }
  }
}

@MainActor public final class PackageAccess {
  public static let shared = PackageAccess(store: PackagePurchases(
    productID: Bundle.main.object(forInfoDictionaryKey: "LearningBookProductID") as? String ?? ""))
  let store: PackagePurchases
  public let lease = PackageAccessLease()
  private var listeners: [UUID: @MainActor (PackageAccessSnapshot) -> Void] = [:]
  private var refreshTask: Task<Void, Never>?
  public var snapshot: PackageAccessSnapshot { lease.snapshot }

  init(store: PackagePurchases) {
    self.store = store
    store.accessChange = { [weak self] value in
      guard let self else { return }
      let previous = lease.snapshot
      lease.update(value.ownership == .owned && value.entitlementIssue == .none)
      if previous.revision != snapshot.revision { for listener in Array(listeners.values) { listener(snapshot) } }
    }
    store.startObserving()
  }
  public func refresh() async -> PackageAccessSnapshot {
    if let refreshTask {
      await refreshTask.value
      return snapshot
    }
    // Library, delivery and player share one query instead of invalidating each other.
    let task = Task { await store.refreshAccess() }
    refreshTask = task
    await task.value
    refreshTask = nil
    return snapshot
  }
  public func subscribe(_ callback: @escaping @MainActor (PackageAccessSnapshot) -> Void) -> UUID {
    let id = UUID(); listeners[id] = callback; callback(snapshot); return id
  }
  public func unsubscribe(_ id: UUID) { listeners[id] = nil }
}
