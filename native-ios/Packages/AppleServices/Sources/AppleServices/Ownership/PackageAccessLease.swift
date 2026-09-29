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
    state.withLock { $0 = PackageAccessSnapshot(revision: $0.revision + 1, allowed: allowed) }
  }
  public func withAuthorization(revision: Int, _ operation: () throws -> Void) throws {
    try state.withLock {
      guard $0.allowed && $0.revision == revision else { throw CancellationError() }
      try operation()
    }
  }
}
