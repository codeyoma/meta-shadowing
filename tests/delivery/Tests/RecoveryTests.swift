import CryptoKit
import Foundation
import Testing
import Synchronization

struct RecoveryTests {
  @Test func legacyVerificationPinsIdentityAndEntryOrderingDoesNotChangeIt() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let data = Data("legacy fixture".utf8)
    let package = descriptor(data)
    let directory = root.appendingPathComponent(package.key)
    try FileManager.default.createDirectory(at: directory.appendingPathComponent("audio"), withIntermediateDirectories: true)
    for entry in package.files { try data.write(to: directory.appendingPathComponent(entry.file)) }
    try Data("1".utf8).write(to: directory.appendingPathComponent("ready"))
    let installer = PackageInstallation(root: root)
    #expect(try installer.isInstalled(package))
    #expect(try installer.isInstalled(.init(key: package.key, files: package.files.reversed())))
    try installer.removeMaterials(package.key)
    #expect(throws: DeliveryError.incompatibleVersion) {
      try installer.install(descriptor(Data("changed".utf8))) { _ in Data("changed".utf8) }
    }
    try installer.install(package) { _ in data }
    #expect(try installer.isInstalled(package))
  }

  @Test(arguments: ["symlink", "corrupt"])
  func damagedIdentityCannotBeFollowedOrOverwritten(kind: String) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let data = Data("original".utf8), package = descriptor(data)
    let installer = PackageInstallation(root: root)
    try installer.install(package) { _ in data }
    let identity = root.appendingPathComponent(".identity-\(package.key)")
    let preserved = root.appendingPathComponent("other-account-data")
    try Data("untouched".utf8).write(to: preserved)
    try FileManager.default.removeItem(at: identity)
    if kind == "symlink" { try FileManager.default.createSymbolicLink(at: identity, withDestinationURL: preserved) }
    else { try Data("damaged".utf8).write(to: identity) }
    #expect(try !installer.isInstalled(package))
    #expect(throws: DeliveryError.incompatibleVersion) { try installer.install(package) { _ in data } }
    #expect(try Data(contentsOf: preserved) == Data("untouched".utf8))
    #expect(try Data(contentsOf: root.appendingPathComponent("\(package.key)/manifest.json")) == data)
  }

  @Test func failedCacheCleanupCanBeRetriedWithoutPublishingPartialContent() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let bytes = Data("controlled cache fixture".utf8), package = descriptor(bytes)
    let cache = RecoveryCache(bytes: bytes, missing: false)
    let refusePurge = Mutex(true)
    let download = PackageDownload(installation: PackageInstallation(root: root), transport: cache, purgeCache: {
      if refusePurge.withLock({ $0 }) { throw CocoaError(.fileWriteNoPermission) }
      cache.repair()
    })
    await #expect(throws: DeliveryError.damagedFiles) { try await download.start(package) }
    await #expect(throws: CocoaError.self) { try await download.start(package) }
    #expect(try await download.status(package).phase == "failed")
    #expect(try await download.storage(package).installed == false)
    refusePurge.withLock { $0 = false }
    try await download.start(package)
    #expect(try await download.status(package).phase == "ready")
  }

  @Test(arguments: [false, true])
  func corruptManagedCacheRequiresExplicitAuthorizedRetry(missing: Bool) async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let bytes = Data("controlled cache fixture".utf8)
    let package = descriptor(bytes)
    let installer = PackageInstallation(root: root)
    let cache = RecoveryCache(bytes: bytes, missing: missing)
    let download = PackageDownload(installation: installer, transport: cache, purgeCache: { cache.repair() })
    let lease = PackageAccessLease()
    lease.update(true)
    let paid = PaidPackageDownload(download: download, authorize: {
      let value = lease.snapshot; return (value.revision, value.allowed)
    }, publish: { revision, commit in try lease.withAuthorization(revision: revision, commit) })
    await #expect(throws: (any Error).self) { try await paid.start(package) }
    #expect(try await paid.status(package).phase == "failed")
    #expect(try !installer.isInstalled(package))
    lease.update(false)
    await #expect(throws: DeliveryError.unauthorized) { try await paid.start(package) }
    #expect(try !installer.isInstalled(package))
    lease.update(true)
    try await paid.start(package)
    #expect(try await paid.status(package).phase == "ready")
  }

  @Test(arguments: [false, true])
  func sameVersionContentCannotReplaceItsPinnedIdentity(afterRemoval: Bool) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let original = Data("original controlled content".utf8)
    let changed = Data("different controlled content".utf8)
    let package = descriptor(original)
    let conflict = descriptor(changed)
    let installer = PackageInstallation(root: root)
    try installer.install(package) { _ in original }
    if afterRemoval { try installer.removeMaterials(package.key) }
    let cold = PackageInstallation(root: root)
    #expect(throws: (any Error).self) { try cold.install(conflict) { _ in changed } }
    #expect(try !cold.isInstalled(conflict))
    if !afterRemoval { #expect(try cold.isInstalled(package)) }
    try cold.install(package) { _ in original }
    #expect(try cold.isInstalled(package))
  }

  private func descriptor(_ data: Data) -> DeliveryPackage {
    let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    return DeliveryPackage(key: LibraryMaterial.hosted, files: ["manifest.json", "audio/one.m4a"].map {
      .init(file: $0, bytes: data.count, sha256: hash)
    })
  }
}

private final class RecoveryCache: AssetDelivery {
  let bytes: Data
  let missing: Bool
  private let repaired = Mutex(false)
  init(bytes: Data, missing: Bool) { self.bytes = bytes; self.missing = missing }
  func repair() { repaired.withLock { $0 = true } }
  func download(progress: @escaping @Sendable (Double) async -> Void) async throws { await progress(1) }
  func contents(_ file: String) throws -> Data {
    if repaired.withLock({ $0 }) { return bytes }
    if missing { throw CocoaError(.fileReadNoSuchFile) }
    return Data("corrupt cached content".utf8)
  }
}
