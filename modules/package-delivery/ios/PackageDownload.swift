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

  func start(_ package: DeliveryPackage, publication: @escaping PackagePublication = { try $0() }) async throws {
    guard running == nil && !removing else { throw DeliveryError.busy }
    if try installation.isInstalled(package) { return }
    guard let transport else { throw DeliveryError.unavailable }
    let installation = installation
    state = DeliveryStatus(phase: "downloading", progress: 0)
    // Lifetime belongs to the download action, not to a React component's mount.
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
    guard [LibraryMaterial.hosted, LibraryMaterial.freeDuo, LibraryMaterial.paidDuo].contains(package.key) else { throw DeliveryError.invalidPackage }
    return try MaterialStorage(bytes: installation.materialBytes(package.key),
      installed: !removing && installation.isInstalled(package), busy: running != nil || removing)
  }

  func remove(_ package: DeliveryPackage) async throws -> Bool {
    guard [LibraryMaterial.hosted, LibraryMaterial.freeDuo, LibraryMaterial.paidDuo].contains(package.key) else { throw DeliveryError.invalidPackage }
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
