import Foundation

/// Destruction can arrive off the main queue. The tombstone is synchronous and
/// permanent; all reads/writes are protected by the lock, including bridge reads.
final class MonitorLifetime: @unchecked Sendable {
  private let lock = NSLock()
  private var closed = false
  var isOpen: Bool { lock.withLock { !closed } }
  func close() { lock.withLock { closed = true } }
}
