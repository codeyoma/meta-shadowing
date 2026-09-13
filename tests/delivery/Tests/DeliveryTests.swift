import CryptoKit
import Foundation
import Testing

struct DeliveryTests {
  @Test func retryDiscardsOnlyItsInterruptedStagingDirectory() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let staging = root.appendingPathComponent(".install-hosted-sample-v1")
    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: true)
    try Data("interrupted".utf8).write(to: staging.appendingPathComponent("partial"))
    let preserved = root.appendingPathComponent("other-package")
    try Data("unrelated".utf8).write(to: preserved)
    let data = Data("controlled fixture".utf8)
    let package = DeliveryPackage(key: "hosted-sample-v1", files: [entry("manifest.json", data), entry("audio/one.m4a", data)])
    let installer = PackageInstallation(root: root)
    try installer.install(package) { _ in data }
    #expect(try installer.isInstalled(package))
    #expect(!FileManager.default.fileExists(atPath: staging.path))
    #expect(try Data(contentsOf: preserved) == Data("unrelated".utf8))
  }

  @Test func aColdUnconfiguredBuildCanStillReadAnInstalledPackage() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let data = Data("controlled fixture".utf8)
    let package = DeliveryPackage(key: "hosted-sample-v1", files: [entry("manifest.json", data), entry("audio/one.m4a", data)])
    let installer = PackageInstallation(root: root)
    let download = PackageDownload(installation: installer, transport: nil)
    #expect(try await download.status(package).phase == "unavailable")
    await #expect(throws: DeliveryError.unavailable) { try await download.start(package) }
    try installer.install(package) { _ in data }
    #expect(try await download.status(package).phase == "ready")
    try FileManager.default.removeItem(at: root.appendingPathComponent("hosted-sample-v1/manifest.json"))
    #expect(try await download.status(package).phase == "unavailable")
  }

  @Test(arguments: ["manifest.json", "audio/one.m4a"], ["missing", "short", "hash"])
  func damagedDeliveryNeverBecomesReady(file: String, damage: String) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let data = Data("controlled fixture".utf8)
    let package = DeliveryPackage(key: "hosted-sample-v1", files: [entry("manifest.json", data), entry("audio/one.m4a", data)])
    let installer = PackageInstallation(root: root)
    #expect(throws: (any Error).self) {
      try installer.install(package) { name in
        if name != file { return data }
        if damage == "missing" { throw CocoaError(.fileReadNoSuchFile) }
        return damage == "short" ? Data(data.dropLast()) : Data(repeating: 0, count: data.count)
      }
    }
    #expect(try installer.isInstalled(package) == false)
    #expect(try FileManager.default.contentsOfDirectory(atPath: root.path).isEmpty)
    try installer.install(package) { _ in data }
    #expect(try installer.isInstalled(package))
    // Reopening an intact immutable version does not consult delivery at all.
    try installer.install(package) { _ in throw CocoaError(.fileReadNoSuchFile) }
    #expect(try installer.isInstalled(package))
  }

  @Test(arguments: ["../outside", "/absolute", "audio/../outside", "audio/one.m4a/audio"])
  func unsafePathsNeverTouchTheFilesystem(path: String) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let data = Data("controlled fixture".utf8)
    let package = DeliveryPackage(key: "hosted-sample-v1", files: [entry("manifest.json", data), entry(path, data)])
    #expect(throws: DeliveryError.invalidPackage) { try PackageInstallation(root: root).install(package) { _ in data } }
    #expect(!FileManager.default.fileExists(atPath: root.path))
  }

  @Test func browsingDoesNotDownloadAndCancellationCannotPublishLateDelivery() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let data = Data("controlled fixture".utf8)
    let package = DeliveryPackage(key: "hosted-sample-v1", files: [entry("manifest.json", data), entry("audio/one.m4a", data)])
    let gate = DownloadGate()
    let delivery = PackageDownload(installation: PackageInstallation(root: root), transport: HeldDelivery(gate: gate, data: data))
    #expect(try await delivery.status(package).phase == "idle")
    #expect(await gate.started == false)
    let first = Task { try await delivery.start(package) }
    await gate.waitUntilStarted()
    #expect(try await delivery.status(package).phase == "downloading")
    #expect(try await delivery.status(package).progress == 0.5)
    await #expect(throws: DeliveryError.busy) { try await delivery.start(package) }
    await delivery.cancel()
    #expect(try await delivery.status(package).phase == "cancelling")
    await gate.finish()
    await #expect(throws: CancellationError.self) { try await first.value }
    #expect(try await delivery.status(package).phase == "cancelled")
    #expect(try PackageInstallation(root: root).isInstalled(package) == false)
    try await delivery.start(package)
    #expect(try await delivery.status(package).phase == "ready")
  }

  @Test func verifiedFilesSurviveAColdInstallerAndMissingAudioRequiresRecovery() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let audio = Data("controlled speech fixture".utf8)
    let metadata = Data("controlled metadata fixture".utf8)
    let descriptor = DeliveryPackage(key: "hosted-sample-v1", files: [
      entry("manifest.json", metadata), entry("audio/one.m4a", audio),
    ])
    let installer = PackageInstallation(root: root)
    #expect(try installer.isInstalled(descriptor) == false)
    try installer.install(descriptor) { $0 == "manifest.json" ? metadata : audio }
    let cold = PackageInstallation(root: root)
    #expect(try cold.isInstalled(descriptor))
    let localAudio = root.appendingPathComponent("hosted-sample-v1/audio/one.m4a")
    #expect(try Data(contentsOf: localAudio) == audio)
    try FileManager.default.removeItem(at: localAudio)
    #expect(try cold.isInstalled(descriptor) == false)
  }
}

private actor DownloadGate {
  var started = false
  private var held: CheckedContinuation<Void, Never>?
  private var startedWaiter: CheckedContinuation<Void, Never>?
  private var finished = false
  func hold() async {
    started = true
    startedWaiter?.resume(); startedWaiter = nil
    if finished { return }
    await withCheckedContinuation { held = $0 }
  }
  func waitUntilStarted() async {
    if started { return }
    await withCheckedContinuation { startedWaiter = $0 }
  }
  func finish() { finished = true; held?.resume(); held = nil }
}

private struct HeldDelivery: AssetDelivery {
  let gate: DownloadGate
  let data: Data
  func download(progress: @escaping @Sendable (Double) async -> Void) async throws {
    await progress(0.5)
    await gate.hold() // Deliberately ignores task cancellation like a late OS callback.
  }
  func contents(_ file: String) throws -> Data { data }
}

private func entry(_ path: String, _ bytes: Data) -> DeliveryPackage.Entry {
  .init(file: path, bytes: bytes.count, sha256: SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined())
}
