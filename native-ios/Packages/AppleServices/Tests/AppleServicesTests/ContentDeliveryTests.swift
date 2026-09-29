import CryptoKit
import Foundation
import Testing
@testable import AppleServices

struct ContentDeliveryTests {
    @Test(arguments: [false, true]) func configuredVideoInstallsAndRemovesWithoutBroadDirectoryAuthority(withAnalysis: Bool) async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let manifest = Data(#"{"kind":"video","schemaVersion":1,"id":"video-sample","version":1,"title":"Video","media":{"file":"video/source.mp4","bytes":3,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad","duration":2},"phrases":[{"id":"one","start":0,"end":1,"text":"Hello","translation":"안녕"}]}"#.utf8)
        var files = ["manifest.json": manifest, "video/source.mp4": Data("abc".utf8)]
        if withAnalysis { files["syntax.json"] = Data("{}".utf8) }
        let descriptor = DeliveryPackage(key: "video-sample-v1", files: files.map {
            .init(file: $0.key, bytes: $0.value.count, sha256: SHA256.hash(data: $0.value).map { String(format: "%02x", $0) }.joined())
        })
        let delivery = try ContentDelivery(root: root, packages: [.init(descriptor: descriptor, assetPackID: nil, paid: false)], transport: { [files] _ in FixtureAssets(files: files) })
        try await delivery.download(packageKey: descriptor.key)
        #expect(try await delivery.installation(packageKey: descriptor.key).manifest.phrases.first?.media == .video("video/source.mp4", start: 0, end: 1))
        await #expect(throws: DeliveryError.invalidPackage) { try await delivery.remove(packageKey: "../unrelated") }
        try await delivery.remove(packageKey: descriptor.key)
        #expect(try await delivery.state(packageKey: descriptor.key).phase == "idle")
    }
    @Test func unchangedPermissionsStillEmitAuthorityReplacement() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = contentFixture(paid: true)
        let delivery = try ContentDelivery(root: root, packages: [fixture.package], transport: { _ in nil })
        var iterator = await delivery.changes().makeAsyncIterator()
        await delivery.authorityChanged()
        #expect(await iterator.next() != nil)
    }
    @Test func cachePurgeFailureIsReportedAfterLocalRemoval() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = contentFixture()
        let delivery = try ContentDelivery(root: root, packages: [fixture.package],
            transport: { _ in FixtureAssets(files: fixture.files) }, purgeCache: { _ in throw DeliveryError.unavailable })
        try await delivery.download(packageKey: fixture.package.descriptor.key)
        await #expect(throws: DeliveryError.unavailable) { try await delivery.remove(packageKey: fixture.package.descriptor.key) }
        await #expect(throws: DeliveryError.unavailable) { try await delivery.installation(packageKey: fixture.package.descriptor.key) }
    }
    @Test func bothConfiguredFreePackageVersionsCanBeRemoved() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = contentFixture(key: "duo-33-free-test-v2", book: "duo-33-free-test", version: 2)
        let delivery = try ContentDelivery(root: root, packages: [fixture.package], transport: { _ in FixtureAssets(files: fixture.files) })
        try await delivery.download(packageKey: fixture.package.descriptor.key)
        try await delivery.remove(packageKey: fixture.package.descriptor.key)
        #expect(try await delivery.state(packageKey: fixture.package.descriptor.key).phase == "idle")
    }
    @Test func onlyValidatedInstallationEnablesContentAndRemovalPreservesSiblingHistory() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = contentFixture()
        let delivery = try ContentDelivery(root: root, packages: [fixture.package], transport: { _ in FixtureAssets(files: fixture.files) })
        #expect(try await delivery.state(packageKey: fixture.package.descriptor.key).phase == "idle")
        await #expect(throws: DeliveryError.unavailable) { try await delivery.installation(packageKey: fixture.package.descriptor.key) }
        try await delivery.download(packageKey: fixture.package.descriptor.key)
        let installed = try await delivery.installation(packageKey: fixture.package.descriptor.key)
        #expect(installed.manifest.phrases.first?.text == "Hello")
        let history = root.appendingPathComponent("preserved-history")
        try Data("history".utf8).write(to: history)
        try await delivery.remove(packageKey: fixture.package.descriptor.key)
        #expect(try await delivery.state(packageKey: fixture.package.descriptor.key).phase == "idle")
        #expect(try Data(contentsOf: history) == Data("history".utf8))
    }
}

struct FixtureAssets: AssetDelivery {
    let files: [String: Data]
    func download(progress: @escaping @Sendable (Double) async -> Void) async throws { await progress(1) }
    func contents(_ file: String) throws -> Data {
        guard let data = files[file] else { throw CocoaError(.fileReadNoSuchFile) }
        return data
    }
}

func contentFixture(paid: Bool = false, key: String = "hosted-morning-notes-v1", book: String = "morning-notes", version: Int = 1) -> (package: HostedPackage, files: [String: Data]) {
    let audio = Data("abc".utf8)
    let audioHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    let manifest = Data("{\"id\":\"\(book)\",\"version\":\(version),\"title\":\"Sample\",\"phrases\":[{\"text\":\"Hello\",\"translation\":\"안녕\",\"file\":\"audio/one.m4a\",\"bytes\":3,\"sha256\":\"\(audioHash)\"}]}".utf8)
    let files = ["manifest.json": manifest, "audio/one.m4a": audio]
    let descriptor = DeliveryPackage(key: key, files: files.map {
        .init(file: $0.key, bytes: $0.value.count, sha256: SHA256.hash(data: $0.value).map { String(format: "%02x", $0) }.joined())
    })
    return (HostedPackage(descriptor: descriptor, assetPackID: "fixture", paid: paid), files)
}
