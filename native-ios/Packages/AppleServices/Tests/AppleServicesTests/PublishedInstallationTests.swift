import CryptoKit
import Foundation
import Testing
@testable import AppleServices

struct PublishedInstallationTests {
    @Test(arguments: [false, true])
    func publishedReadsDoNotRehashUnusedMedia(afterRelaunch: Bool) async throws {
        let fixture = try PublishedFixture()
        defer { fixture.remove() }
        let delivery = try fixture.delivery()
        try await delivery.download(packageKey: fixture.key)
        // Same-size changes to unused media are deliberately no longer policed on
        // every metadata read. The actual media consumer handles read/play errors.
        try Data("xyz".utf8).write(to: fixture.file("audio/one.m4a"))
        let reader = try afterRelaunch ? fixture.delivery() : delivery
        #expect(try await reader.state(packageKey: fixture.key).phase == "ready")
        #expect(try await reader.installation(packageKey: fixture.key).manifest.phrases.first?.text == "Hello")
        // Explicit re-download still verifies and repairs the installation.
        try await reader.download(packageKey: fixture.key)
        #expect(try Data(contentsOf: fixture.file("audio/one.m4a")) == Data("abc".utf8))
    }

    @Test(arguments: ["ready", "package", "identity"])
    func removingPublicationEvidenceImmediatelyRevokesReadiness(item: String) async throws {
        let fixture = try PublishedFixture()
        defer { fixture.remove() }
        let delivery = try fixture.delivery()
        try await delivery.download(packageKey: fixture.key)
        #expect(try await delivery.state(packageKey: fixture.key).phase == "ready")
        let target = item == "package" ? fixture.directory
            : item == "identity" ? fixture.identity : fixture.file("ready")
        try FileManager.default.removeItem(at: target)
        #expect(try await delivery.state(packageKey: fixture.key).phase != "ready")
        await #expect(throws: DeliveryError.unavailable) {
            try await delivery.installation(packageKey: fixture.key)
        }
        if item == "identity" {
            #expect(!FileManager.default.fileExists(atPath: fixture.identity.path),
                "Reading readiness must not silently adopt an unpinned package")
        }
        try await delivery.download(packageKey: fixture.key)
        #expect(try await delivery.state(packageKey: fixture.key).phase == "ready")
    }

    @Test func invalidPublicationMarkerDoesNotAuthorizeFiles() async throws {
        let fixture = try PublishedFixture()
        defer { fixture.remove() }
        let delivery = try fixture.delivery()
        try await delivery.download(packageKey: fixture.key)
        try Data("0".utf8).write(to: fixture.file("ready"))
        #expect(try await delivery.state(packageKey: fixture.key).phase != "ready")
    }

    @Test(arguments: ["root", "package", "ready", "identity"])
    func symbolicPublicationEvidenceCannotAuthorizeFiles(item: String) async throws {
        let fixture = try PublishedFixture()
        defer { fixture.remove() }
        let delivery = try fixture.delivery()
        try await delivery.download(packageKey: fixture.key)
        let moved = fixture.root.appendingPathExtension("moved")
        defer { try? FileManager.default.removeItem(at: moved) }
        let target = item == "root" ? fixture.root : item == "package" ? fixture.directory
            : item == "identity" ? fixture.identity : fixture.file("ready")
        try FileManager.default.moveItem(at: target, to: moved)
        try FileManager.default.createSymbolicLink(at: target, withDestinationURL: moved)
        await #expect(throws: (any Error).self) {
            try await delivery.installation(packageKey: fixture.key)
        }
    }

    @Test(arguments: ["missing", "invalid", "symlink"])
    func requestedManifestStillFailsSafely(kind: String) async throws {
        let fixture = try PublishedFixture()
        defer { fixture.remove() }
        let delivery = try fixture.delivery()
        try await delivery.download(packageKey: fixture.key)
        let manifest = fixture.file("manifest.json")
        try FileManager.default.removeItem(at: manifest)
        if kind == "invalid" { try Data("not JSON".utf8).write(to: manifest) }
        if kind == "symlink" {
            let outside = fixture.root.appendingPathComponent("outside.json")
            try fixture.files["manifest.json"]!.write(to: outside)
            try FileManager.default.createSymbolicLink(at: manifest, withDestinationURL: outside)
        }
        await #expect(throws: (any Error).self) {
            try await delivery.installation(packageKey: fixture.key)
        }
    }

    @Test func aDifferentDescriptorCannotReuseThePublication() async throws {
        let fixture = try PublishedFixture()
        defer { fixture.remove() }
        let delivery = try fixture.delivery()
        try await delivery.download(packageKey: fixture.key)
        let changed = DeliveryPackage(key: fixture.key, files: fixture.package.descriptor.files.map {
            .init(file: $0.file, bytes: $0.bytes, sha256: String(repeating: "0", count: 64))
        })
        let reader = try ContentDelivery(root: fixture.root, packages: [.init(descriptor: changed, assetPackID: nil)])
        await #expect(throws: DeliveryError.unavailable) { try await reader.installation(packageKey: fixture.key) }
    }
}

private struct PublishedFixture {
    let root = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let key = "hosted-morning-notes-v1"
    let package: HostedPackage
    let files: [String: Data]
    var directory: URL { root.appendingPathComponent(key) }
    var identity: URL { root.appendingPathComponent(".identity-\(key)") }

    init() throws {
        let manifest = Data(#"{"id":"morning-notes","version":1,"title":"Published fixture","phrases":[{"text":"Hello","translation":"안녕","file":"audio/one.m4a","bytes":3,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"}]}"#.utf8)
        files = ["manifest.json": manifest, "audio/one.m4a": Data("abc".utf8)]
        package = HostedPackage(descriptor: DeliveryPackage(key: key, files: files.map {
            .init(file: $0.key, bytes: $0.value.count, sha256: SHA256.hash(data: $0.value).map { String(format: "%02x", $0) }.joined())
        }), assetPackID: nil)
    }
    func delivery() throws -> ContentDelivery {
        try ContentDelivery(root: root, packages: [package], transport: { [files] _ in PublishedAssets(files: files) })
    }
    func file(_ name: String) -> URL { directory.appendingPathComponent(name) }
    func remove() { try? FileManager.default.removeItem(at: root) }
}

private struct PublishedAssets: AssetDelivery {
    let files: [String: Data]
    func download(progress: @escaping AssetDeliveryProgress) async throws { await progress(1) }
    func contents(_ file: String) throws -> Data { try #require(files[file]) }
}
