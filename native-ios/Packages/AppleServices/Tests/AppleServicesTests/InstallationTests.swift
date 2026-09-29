import CryptoKit
import Foundation
import Testing
@testable import AppleServices

struct InstallationTests {
    @Test func invalidSemanticContentCannotPublishAReadyInstallation() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let bytes = Data("not a valid manifest".utf8)
        let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
        let package = DeliveryPackage(key: "hosted-morning-notes-v1", files: ["manifest.json", "audio/one.m4a"].map {
            .init(file: $0, bytes: bytes.count, sha256: hash)
        })
        let installation = PackageInstallation(root: root, validateContent: { _, _ in throw DeliveryError.invalidPackage })
        #expect(throws: DeliveryError.invalidPackage) { try installation.install(package) { _ in bytes } }
        #expect(try !installation.isInstalled(package))
        #expect(!FileManager.default.fileExists(atPath: root.appendingPathComponent(".identity-\(package.key)").path))
    }
}
