import Foundation
import CryptoKit
import Testing

struct PaidDeliveryTests {
  @Test func deniedStartAndRevocationDoNotPublishAndRenewedAccessCanRetry() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let bytes = Data("fixture".utf8)
    let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    let names = ["manifest.json", "cover.jpg", "info.json", "text.txt", "syntax.json"] + (1...560).map { String(format: "audio/phrase-%03d.m4a", $0) }
    let package = DeliveryPackage(key: LibraryMaterial.paidDuo, files: names.map { .init(file: $0, bytes: bytes.count, sha256: hash) })
    let installer = PackageInstallation(root: root)
    let transport = PaidHeldTransport(bytes: bytes)
    let lease = PackageAccessLease()
    let download = PackageDownload(installation: installer, transport: transport)
    let paid = PaidPackageDownload(download: download, authorize: {
      let value = lease.snapshot; return (value.revision, value.allowed)
    }, publish: { revision, commit in try lease.withAuthorization(revision: revision, commit) })
    await #expect(throws: DeliveryError.unauthorized) { try await paid.start(package) }
    #expect(await transport.started == false)
    lease.update(true)
    let attempt = Task { try await paid.start(package) }
    await transport.waitUntilStarted()
    lease.update(false)
    await transport.finish()
    await #expect(throws: CancellationError.self) { try await attempt.value }
    #expect(try !installer.isInstalled(package))
    lease.update(true)
    try await paid.start(package)
    #expect(try await paid.status(package).phase == "ready")
    lease.update(false)
    await #expect(throws: DeliveryError.unauthorized) { try await paid.status(package) }
    #expect(try await download.storage(package).installed)
    #expect(try await download.remove(package))
    #expect(try !installer.isInstalled(package))
  }

  @Test(arguments: [CocoaError.Code.fileWriteOutOfSpace, .fileWriteNoPermission])
  func publicationFailureCleansStagingAndPreservesOtherInstalledMaterial(code: CocoaError.Code) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let bytes = Data("fixture".utf8)
    let files = ["manifest.json", "audio/one.m4a"].map { DeliveryPackage.Entry(file: $0, bytes: bytes.count,
      sha256: SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()) }
    let installer = PackageInstallation(root: root)
    let old = DeliveryPackage(key: "hosted-morning-notes-v1", files: files)
    let next = DeliveryPackage(key: "hosted-morning-notes-v2", files: files)
    try installer.install(old) { _ in bytes }
    #expect(throws: CocoaError.self) {
      try installer.install(next, publication: { _ in throw CocoaError(code) }) { _ in bytes }
    }
    #expect(try installer.isInstalled(old))
    #expect(try !installer.isInstalled(next))
    #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent(".install-\(next.key)").path))
    try installer.install(next) { _ in bytes }
    #expect(try installer.isInstalled(next))
  }
  @Test func authorizationCannotPublishAfterItWasRevoked() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let data = Data("fixture".utf8)
    let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    let package = DeliveryPackage(key: "hosted-morning-notes-v1", files: ["manifest.json", "audio/one.m4a"].map {
      .init(file: $0, bytes: data.count, sha256: hash)
    })
    let installer = PackageInstallation(root: root)
    #expect(throws: CancellationError.self) {
      try installer.install(package, publication: { _ in throw CancellationError() }, source: { _ in data })
    }
    #expect(try !installer.isInstalled(package))
    try installer.install(package) { _ in data }
    #expect(try installer.isInstalled(package))
  }
}

private actor PaidHeldTransport: AssetDelivery {
  nonisolated let bytes: Data
  var started = false
  private var completed = false
  private var held: CheckedContinuation<Void, Never>?
  private var waiter: CheckedContinuation<Void, Never>?
  init(bytes: Data) { self.bytes = bytes }
  func download(progress: @escaping @Sendable (Double) async -> Void) async throws {
    started = true; waiter?.resume(); waiter = nil
    await progress(0.5)
    if !completed { await withCheckedContinuation { held = $0 } }
  }
  func waitUntilStarted() async {
    if !started { await withCheckedContinuation { waiter = $0 } }
  }
  func finish() { completed = true; held?.resume(); held = nil }
  nonisolated func contents(_ file: String) throws -> Data { bytes }
}
