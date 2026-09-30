import Foundation

/// Only the external delivery service is substituted in tests; installation uses real files.
public typealias AssetDeliveryProgress = @Sendable (Double) async -> Void
public protocol AssetDelivery: Sendable {
  func download(progress: @escaping AssetDeliveryProgress) async throws
  func contents(_ file: String) throws -> Data
}

public struct DeliveryStatus: Equatable, Sendable {
  public let phase: String
  public let progress: Double
  public init(phase: String, progress: Double) { self.phase = phase; self.progress = progress }
}

actor PackageDownload {
  private let installation: PackageInstallation
  private let transport: (any AssetDelivery)?
  private var running: Task<Void, Error>?
  private var listeners: [UUID: AsyncStream<DeliveryStatus>.Continuation] = [:]
  private var state = DeliveryStatus(phase: "idle", progress: 0) {
    didSet { for listener in listeners.values { listener.yield(state) } }
  }
  private var removing = false
  private var needsCacheReset = false
  private let purgeCache: @Sendable () async throws -> Void

  init(installation: PackageInstallation, transport: (any AssetDelivery)?,
    purgeCache: @escaping @Sendable () async throws -> Void = {}) {
    self.installation = installation
    self.transport = transport
    self.purgeCache = purgeCache
  }

  func status(_ package: DeliveryPackage) throws -> DeliveryStatus {
    if removing { return DeliveryStatus(phase: "idle", progress: 0) }
    if running != nil { return state }
    if try installation.isInstalled(package) { return DeliveryStatus(phase: "ready", progress: 1) }
    if transport == nil { return DeliveryStatus(phase: "unavailable", progress: 0) }
    if ["failed", "cancelled"].contains(state.phase) { return state }
    return DeliveryStatus(phase: "idle", progress: 0)
  }
  func statuses(_ package: DeliveryPackage) throws -> AsyncStream<DeliveryStatus> {
    let initial = try status(package), id = UUID()
    let (stream, continuation) = AsyncStream<DeliveryStatus>.makeStream(bufferingPolicy: .bufferingNewest(1))
    listeners[id] = continuation
    continuation.yield(initial)
    continuation.onTermination = { [weak self] _ in Task { await self?.removeListener(id) } }
    return stream
  }
  private func removeListener(_ id: UUID) { listeners[id] = nil }

  func start(_ package: DeliveryPackage, publication: @escaping PackagePublication = { try $0() }) async throws {
    // A cancelled caller must not create a fresh, independently owned transfer.
    try Task.checkCancellation()
    guard running == nil && !removing else { throw DeliveryError.busy }
    if try installation.isInstalled(package) { return }
    guard let transport else { throw DeliveryError.unavailable }
    let installation = installation
    state = DeliveryStatus(phase: "downloading", progress: 0)
    // Lifetime belongs to the download action, not to a view's lifetime.
    let task = Task {
      // Only an explicit retry may discard the identified managed cache. Local
      // verified installations and learning records are never part of this purge.
      if self.needsCacheReset {
        try await self.purgeCache()
        self.needsCacheReset = false
      }
      try Task.checkCancellation()
      try await transport.download { value in await self.progress(value) }
      try Task.checkCancellation()
      self.state = DeliveryStatus(phase: "installing", progress: 1)
      try installation.install(package, publication: publication, source: transport.contents)
    }
    running = task
    defer { running = nil }
    do {
      try await task.value
      state = DeliveryStatus(phase: "ready", progress: 1)
    } catch {
      if error as? DeliveryError == .damagedFiles || (error as? CocoaError)?.code == .fileReadNoSuchFile {
        needsCacheReset = true
      }
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

  func syntax(_ package: DeliveryPackage) throws -> String? {
    guard running == nil && !removing else { throw DeliveryError.busy }
    return try installation.syntax(package)
  }

  func storage(_ package: DeliveryPackage) throws -> MaterialStorage {
    try installation.validateMaterialKey(package.key)
    return try MaterialStorage(bytes: installation.materialBytes(package.key),
      installed: !removing && installation.isInstalled(package), busy: running != nil || removing)
  }

  func remove(_ package: DeliveryPackage) async throws -> Bool {
    try installation.validateMaterialKey(package.key)
    guard running == nil && !removing else { throw DeliveryError.busy }
    removing = true
    defer { removing = false }
    try installation.removeMaterials(package.key)
    state = DeliveryStatus(phase: "idle", progress: 0)
    // Actor reentrancy must not permit start() during this service operation.
    // A failed purge cannot put an already removed installation back in ready.
    do { try await purgeCache(); needsCacheReset = false; return true }
    catch { needsCacheReset = true; return false }
  }

  private func progress(_ value: Double) {
    guard state.phase == "downloading", value.isFinite else { return }
    state = DeliveryStatus(phase: "downloading", progress: min(1, max(0, value)))
  }
}
