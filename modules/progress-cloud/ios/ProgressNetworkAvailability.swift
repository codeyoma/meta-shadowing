import Foundation
import Network

/// Connectivity is only a retry hint; CloudKit remains the authority on reachability.
@MainActor
final class ProgressNetworkAvailability {
  typealias Receive = @MainActor @Sendable (Bool) -> Void
  typealias Source = @MainActor (@escaping Receive) -> (@MainActor () -> Void)
  private let source: Source
  private var cancel: (@MainActor () -> Void)?
  private var previous: Bool?
  private var active = false
  private var stopped = false

  nonisolated init(source: @escaping Source = ProgressNetworkAvailability.nativeSource) {
    self.source = source
  }
  func observe(_ available: @escaping @MainActor @Sendable () -> Void) {
    guard !active, !stopped else { return }
    active = true
    previous = nil
    cancel = source { [weak self] connected in
      guard let self, self.active else { return }
      let reconnected = self.previous == false && connected
      self.previous = connected
      if reconnected { available() }
    }
  }
  func stop() {
    stopped = true
    active = false
    cancel?()
    cancel = nil
    previous = nil
  }
  private static func nativeSource(_ receive: @escaping Receive) -> (@MainActor () -> Void) {
    let monitor = NWPathMonitor()
    monitor.pathUpdateHandler = { path in
      // The source is explicitly scheduled on the main queue. Keeping delivery
      // synchronous preserves the order of offline/online changes.
      MainActor.assumeIsolated { receive(path.status == .satisfied) }
    }
    monitor.start(queue: .main)
    return { monitor.pathUpdateHandler = nil; monitor.cancel() }
  }
}
