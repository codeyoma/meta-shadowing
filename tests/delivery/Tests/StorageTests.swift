import CryptoKit
import Foundation
import Testing

struct StorageTests {
  @Test func unexpectedStagingFileRejectsBeforeInstalledCopyIsRemoved() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let installer = PackageInstallation(root: root)
    let package = storagePackage()
    try installer.install(package) { _ in Data("abc".utf8) }
    try Data("unexpected".utf8).write(to: root.appendingPathComponent(".install-\(package.key)"))
    #expect(throws: DeliveryError.invalidPackage) { try installer.removeMaterials(package.key) }
    #expect(try installer.isInstalled(package))
  }

  @Test func trustedParentAliasDoesNotRejectNormalOwnedDirectories() throws {
    let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: base) }
    let documents = base.appendingPathComponent("documents")
    try FileManager.default.createDirectory(at: documents, withIntermediateDirectories: true)
    let alias = base.appendingPathComponent("trusted-alias")
    try FileManager.default.createSymbolicLink(at: alias, withDestinationURL: documents)
    let installer = PackageInstallation(root: alias.appendingPathComponent("lesson-packages"))
    try installer.install(storagePackage()) { _ in Data("abc".utf8) }
    #expect(try installer.materialBytes("hosted-morning-notes-v1") == 7)
    try installer.removeMaterials("hosted-morning-notes-v1")
    #expect(try installer.materialBytes("hosted-morning-notes-v1") == 0)
  }

  @Test func measuredBytesAndRemovalPreserveSiblingAndLearningRecords() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let installer = PackageInstallation(root: root)
    let package = storagePackage()
    #expect(try installer.materialBytes(package.key) == 0)
    try installer.install(package) { _ in Data("abc".utf8) }
    let sibling = DeliveryPackage(key: "morning-notes-v1", files: package.files)
    try installer.install(sibling) { _ in Data("abc".utf8) }
    try Data("records".utf8).write(to: root.appendingPathComponent("learning.db"))
    // A damaged/unlisted file is still local material; the manifest sum is six.
    try Data("extra".utf8).write(to: root.appendingPathComponent("\(package.key)/extra"))
    #expect(try installer.materialBytes(package.key) == 12)
    let staging = root.appendingPathComponent(".install-\(package.key)")
    try FileManager.default.createDirectory(at: staging, withIntermediateDirectories: false)
    try Data("partial".utf8).write(to: staging.appendingPathComponent("partial"))
    try installer.removeMaterials(package.key)
    try installer.removeMaterials(package.key)
    #expect(try installer.materialBytes(package.key) == 0)
    #expect(!FileManager.default.fileExists(atPath: staging.path))
    #expect(try installer.isInstalled(sibling))
    #expect(try Data(contentsOf: root.appendingPathComponent("learning.db")) == Data("records".utf8))
  }

  @Test(arguments: ["../outside", "delivery-diagnostic-v1", "foreign-v1", "/absolute", "morning-notes-v2"])
  func foreignIdentityCannotReachStorage(key: String) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let installer = PackageInstallation(root: root)
    #expect(throws: DeliveryError.invalidPackage) { try installer.materialBytes(key) }
    #expect(throws: DeliveryError.invalidPackage) { try installer.removeMaterials(key) }
    #expect(!FileManager.default.fileExists(atPath: root.path))
  }

  @Test(arguments: ["root", "package", "descendant", "staging", "dangling"])
  func symlinksRejectBeforeRemovingAnything(location: String) throws {
    let base = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: base) }
    let root = base.appendingPathComponent("lesson-packages")
    let outside = base.appendingPathComponent("preserved")
    try FileManager.default.createDirectory(at: outside, withIntermediateDirectories: true)
    try Data("records".utf8).write(to: outside.appendingPathComponent("learning.db"))
    let installer = PackageInstallation(root: root)
    let package = storagePackage()
    try installer.install(package) { _ in Data("abc".utf8) }
    let link: URL
    switch location {
    case "root": link = root
    case "package": link = root.appendingPathComponent(package.key)
    case "staging": link = root.appendingPathComponent(".install-\(package.key)")
    default: link = root.appendingPathComponent("\(package.key)/link")
    }
    if FileManager.default.fileExists(atPath: link.path) { try FileManager.default.removeItem(at: link) }
    try FileManager.default.createSymbolicLink(at: link, withDestinationURL:
      location == "dangling" ? outside.appendingPathComponent("absent") : outside)
    #expect(throws: DeliveryError.invalidPackage) { try installer.materialBytes(package.key) }
    #expect(throws: DeliveryError.invalidPackage) { try installer.removeMaterials(package.key) }
    #expect(try Data(contentsOf: outside.appendingPathComponent("learning.db")) == Data("records".utf8))
    if location == "staging" { #expect(try installer.isInstalled(package)) }
  }

  @Test func cancelledLateDownloadMustSettleBeforeRemoval() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let gate = StorageGate()
    let package = storagePackage()
    let actor = PackageDownload(installation: PackageInstallation(root: root), transport: StorageDelivery(gate: gate))
    let pending = Task { try await actor.start(package) }
    await gate.waitUntilStarted()
    #expect(try await actor.storage(package).busy)
    await #expect(throws: DeliveryError.busy) { try await actor.remove(package) }
    await actor.cancel()
    await #expect(throws: DeliveryError.busy) { try await actor.remove(package) }
    await gate.finish()
    _ = await pending.result
    #expect(try await actor.remove(package))
    #expect(try await actor.storage(package).installed == false)
    #expect(try await actor.storage(package).bytes == 0)
  }

  @Test func asynchronousPurgeBlocksStartAndFailureCanRetryWithoutLocalCopy() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let installer = PackageInstallation(root: root)
    let package = storagePackage()
    try installer.install(package) { _ in Data("abc".utf8) }
    let purge = StorageGate()
    let actor = PackageDownload(installation: installer, transport: nil, purgeCache: {
      await purge.hold()
      if await purge.fail { throw DeliveryError.unavailable }
    })
    let removing = Task { try await actor.remove(package) }
    await purge.waitUntilStarted()
    let during = try await actor.storage(package)
    #expect(during.busy && !during.installed && during.bytes == 0)
    #expect(try await actor.status(package).phase != "ready")
    await #expect(throws: DeliveryError.busy) { try await actor.start(package) }
    await #expect(throws: DeliveryError.busy) { try await actor.remove(package) }
    await purge.finish(fail: true)
    #expect(try await removing.value == false)
    #expect(try await actor.storage(package).installed == false)
    await purge.finish(fail: false)
    #expect(try await actor.remove(package))
    #expect(try await actor.storage(package).busy == false)
  }
}

private func storagePackage() -> DeliveryPackage {
  let data = Data("abc".utf8)
  let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  return DeliveryPackage(key: "hosted-morning-notes-v1", files: [
    .init(file: "manifest.json", bytes: 3, sha256: hash), .init(file: "audio/one.m4a", bytes: 3, sha256: hash),
  ])
}

private actor StorageGate {
  var fail = false
  private var started = false
  private var finished = false
  private var pending: CheckedContinuation<Void, Never>?
  private var waiter: CheckedContinuation<Void, Never>?
  func hold() async {
    started = true; waiter?.resume(); waiter = nil
    if !finished { await withCheckedContinuation { pending = $0 } }
  }
  func waitUntilStarted() async {
    if !started { await withCheckedContinuation { waiter = $0 } }
  }
  func finish(fail: Bool = false) {
    self.fail = fail; finished = true; pending?.resume(); pending = nil
  }
}
private struct StorageDelivery: AssetDelivery {
  let gate: StorageGate
  func download(progress: @escaping @Sendable (Double) async -> Void) async throws { await gate.hold() }
  func contents(_ file: String) throws -> Data { Data("abc".utf8) }
}
