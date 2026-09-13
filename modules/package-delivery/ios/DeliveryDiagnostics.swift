import Foundation

struct DiagnosticStatus: Sendable {
  let phase: String
  let progress: Double
  let outcome: String
  let observedProgress: Double
}

/// Internal opt-in harness. No learning database, preferences, or package paths
/// are accepted from JavaScript. Its installation root is separate from lessons.
actor DeliveryDiagnostics {
  private let enabled: Bool
  private let root: URL
  private let package: DeliveryPackage
  private let download: PackageDownload
  private let cacheAvailable: @Sendable () async -> Bool
  private let purgeCache: @Sendable () async throws -> Void
  private var busy = false
  private var outcome = "not-run"
  private var observedProgress: Double = 0
  private var requestedCancellation = false

  init(enabled: Bool, root: URL, package: DeliveryPackage, transport: (any AssetDelivery)?,
    cacheAvailable: @escaping @Sendable () async -> Bool = { false },
    purgeCache: @escaping @Sendable () async throws -> Void = {}) {
    self.enabled = enabled
    self.root = root
    self.package = package
    self.cacheAvailable = cacheAvailable
    self.purgeCache = purgeCache
    self.download = PackageDownload(installation: PackageInstallation(root: root), transport: transport)
  }

  func status() async throws -> DiagnosticStatus {
    try requireEnabled()
    let value = try await download.status(package)
    return DiagnosticStatus(phase: value.phase, progress: value.progress, outcome: outcome, observedProgress: observedProgress)
  }

  func start(autoCancel: Bool) async throws {
    try requireEnabled()
    guard !busy else { throw DeliveryError.busy }
    busy = true
    defer { busy = false }
    if autoCancel {
      outcome = "observing"
      observedProgress = 0
      requestedCancellation = false
    }
    let observer = autoCancel ? Task { await self.cancelAtProgress() } : nil
    defer { observer?.cancel() }
    do {
      try await download.start(package)
      if autoCancel { outcome = "inconclusive" }
    } catch {
      if autoCancel {
        let value = try await download.status(package)
        outcome = requestedCancellation && value.phase == "cancelled"
          ? "cancelled-unpublished" : "failed"
        if requestedCancellation, await cacheAvailable() { outcome = "inconclusive" }
      }
      throw error
    }
  }

  func cancel() async throws {
    try requireEnabled()
    // Manual cancellation is not evidence for the automatic trial.
    outcome = "not-run"
    requestedCancellation = false
    await download.cancel()
  }

  func reset() async throws {
    try requireEnabled()
    guard !busy else { throw DeliveryError.busy }
    busy = true
    defer { busy = false }
    try await purgeCache()
    // Exact diagnostic paths only; never delete the root or another version.
    for name in ["delivery-diagnostic-v1", ".install-delivery-diagnostic-v1"] {
      let directory = root.appendingPathComponent(name)
      if FileManager.default.fileExists(atPath: directory.path) { try FileManager.default.removeItem(at: directory) }
    }
    outcome = "not-run"
    observedProgress = 0
  }

  private func cancelAtProgress() async {
    while !Task.isCancelled {
      guard let state = try? await download.status(package) else { return }
      guard !Task.isCancelled else { return }
      if state.phase == "downloading", state.progress > 0, state.progress < 1 {
        observedProgress = state.progress
        requestedCancellation = true
        await download.cancel()
        return
      }
      do { try await Task.sleep(for: .milliseconds(10)) } catch { return }
    }
  }

  func damage(_ fault: String) throws {
    try requireEnabled()
    guard !busy else { throw DeliveryError.busy }
    guard ["missing", "corrupt"].contains(fault) else { throw DeliveryError.invalidPackage }
    guard try PackageInstallation(root: root).isInstalled(package) else { throw DeliveryError.damagedFiles }
    let file = root.appendingPathComponent("delivery-diagnostic-v1/audio/phrase-01.m4a")
    if fault == "missing" {
      try FileManager.default.removeItem(at: file)
    } else {
      var bytes = try Data(contentsOf: file)
      guard !bytes.isEmpty else { throw DeliveryError.damagedFiles }
      bytes[0] ^= 0xff // Same size: recovery must detect the digest, not just length.
      try bytes.write(to: file, options: .atomic)
    }
  }

  private func requireEnabled() throws {
    guard enabled else { throw DeliveryError.unavailable }
    guard package.key == "delivery-diagnostic-v1" else { throw DeliveryError.invalidPackage }
  }
}
