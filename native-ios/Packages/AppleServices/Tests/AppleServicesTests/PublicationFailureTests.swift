import Foundation
import CryptoKit
import Testing
@testable import AppleServices

/// Retained filesystem failure coverage from the historical paid-delivery suite.
struct PublicationFailureTests {
  @Test(arguments: [CocoaError.Code.fileWriteOutOfSpace, .fileWriteNoPermission])
  func publicationFailureCleansStagingAndPreservesOtherInstalledMaterial(code: CocoaError.Code) throws {
    let root = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
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
  @Test func cancelledPublicationCannotBecomeInstalled() throws {
    let root = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
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
