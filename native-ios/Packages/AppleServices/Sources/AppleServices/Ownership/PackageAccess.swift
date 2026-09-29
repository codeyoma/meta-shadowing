import Foundation
@MainActor public final class PackageAccess {
  let store: OwnershipService
  public let lease = PackageAccessLease()
  private var listeners: [UUID: @MainActor (PackageAccessSnapshot) -> Void] = [:]
  private var refreshTask: Task<Void, Never>?
  public var snapshot: PackageAccessSnapshot { lease.snapshot }

  public init(store: OwnershipService) {
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
