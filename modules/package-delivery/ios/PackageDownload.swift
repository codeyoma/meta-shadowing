import Foundation

/// Only the external delivery service is substituted in tests; installation uses real files.
protocol AssetDelivery: Sendable {
  func download(progress: @escaping @Sendable (Double) async -> Void) async throws
  func contents(_ file: String) throws -> Data
}

struct DeliveryStatus: Sendable {
  let phase: String
  let progress: Double
}

actor PackageDownload {
  private let installation: PackageInstallation
  private let transport: (any AssetDelivery)?
  private var running: Task<Void, Error>?
  private var state = DeliveryStatus(phase: "idle", progress: 0)

  init(installation: PackageInstallation, transport: (any AssetDelivery)?) {
    self.installation = installation
    self.transport = transport
  }

  func status(_ package: DeliveryPackage) throws -> DeliveryStatus {
    if running != nil { return state }
    if try installation.isInstalled(package) { return DeliveryStatus(phase: "ready", progress: 1) }
    if transport == nil { return DeliveryStatus(phase: "unavailable", progress: 0) }
    if ["failed", "cancelled"].contains(state.phase) { return state }
    return DeliveryStatus(phase: "idle", progress: 0)
  }

  func start(_ package: DeliveryPackage) async throws {
    guard running == nil else { throw DeliveryError.busy }
    if try installation.isInstalled(package) { return }
    guard let transport else { throw DeliveryError.unavailable }
    let installation = installation
    state = DeliveryStatus(phase: "downloading", progress: 0)
    // Lifetime belongs to the download action, not to a React component's mount.
    let task = Task {
      try await transport.download { value in await self.progress(value) }
      try Task.checkCancellation()
      self.state = DeliveryStatus(phase: "installing", progress: 1)
      try installation.install(package, source: transport.contents)
    }
    running = task
    defer { running = nil }
    do {
      try await task.value
      state = DeliveryStatus(phase: "ready", progress: 1)
    } catch {
      state = DeliveryStatus(phase: task.isCancelled ? "cancelled" : "failed", progress: 0)
      if task.isCancelled { throw CancellationError() }
      throw error
    }
  }

  func cancel() {
    guard let running else { return }
    state = DeliveryStatus(phase: "cancelling", progress: state.progress)
    running.cancel()
  }

  private func progress(_ value: Double) {
    guard state.phase == "downloading", value.isFinite else { return }
    state = DeliveryStatus(phase: "downloading", progress: min(1, max(0, value)))
  }
}
