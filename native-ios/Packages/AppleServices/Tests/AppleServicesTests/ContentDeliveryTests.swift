import CryptoKit
import Foundation
import Testing
import Synchronization
@testable import AppleServices

struct ContentDeliveryTests {
    @Test func cancellationAfterTransferBeforePublicationLeavesNoReadyPackageAndAllowsRetry() async throws {
        let root = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = contentFixture()
        let lastFile = try #require(fixture.package.descriptor.files.last).file
        let assets = CancellationBeforePublicationAssets(files: fixture.files, lastFile: lastFile)
        let delivery = try ContentDelivery(root: root, packages: [fixture.package], transport: { _ in assets })
        await #expect(throws: CancellationError.self) { try await delivery.download(packageKey: fixture.package.descriptor.key) }
        #expect(try await delivery.state(packageKey: fixture.package.descriptor.key).phase == "cancelled")
        await #expect(throws: DeliveryError.unavailable) { try await delivery.installation(packageKey: fixture.package.descriptor.key) }
        try await delivery.download(packageKey: fixture.package.descriptor.key)
        #expect(try await delivery.installation(packageKey: fixture.package.descriptor.key).descriptor == fixture.package.descriptor)
    }
    @Test(.timeLimit(.minutes(1))) func cancelledFreeDownloadCannotPublishLateTransportAndRetryPreservesSibling() async throws {
        let root = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let sibling = contentFixture()
        let next = contentFixture(key: "duo-33-free-test-v1", book: "duo-33-free-test")
        let gate = FreeDownloadGate()
        let delivery = try ContentDelivery(root: root, packages: [sibling.package, next.package], transport: { package in
            package.descriptor.key == sibling.package.descriptor.key
                ? FixtureAssets(files: sibling.files) as any AssetDelivery
                : HeldFreeAssets(gate: gate, files: next.files)
        })
        try await delivery.download(packageKey: sibling.package.descriptor.key)
        let attempt = Task { try await delivery.download(packageKey: next.package.descriptor.key) }
        await gate.waitUntilStarted()
        await delivery.cancel(packageKey: next.package.descriptor.key)
        await gate.finish()
        await #expect(throws: CancellationError.self) { try await attempt.value }
        #expect(try await delivery.state(packageKey: next.package.descriptor.key).phase == "cancelled")
        await #expect(throws: DeliveryError.unavailable) { try await delivery.installation(packageKey: next.package.descriptor.key) }
        #expect(try await delivery.installation(packageKey: sibling.package.descriptor.key).descriptor == sibling.package.descriptor)
        try await delivery.download(packageKey: next.package.descriptor.key)
        #expect(try await delivery.installation(packageKey: next.package.descriptor.key).manifest.bookID == "duo-33-free-test")
    }
    @Test(arguments: ["manifest.json", "audio/one.m4a"])
    func corruptFreeDownloadRequiresExplicitRetryWithoutLosingSibling(file: String) async throws {
        let root = URL.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let sibling = contentFixture()
        let next = contentFixture(key: "duo-33-free-test-v1", book: "duo-33-free-test")
        let damaged = RepairableFreeAssets(files: next.files, damagedFile: file)
        let delivery = try ContentDelivery(root: root, packages: [sibling.package, next.package], transport: { package in
            package.descriptor.key == sibling.package.descriptor.key
                ? FixtureAssets(files: sibling.files) as any AssetDelivery : damaged
        }, purgeCache: { _ in damaged.repair() })
        try await delivery.download(packageKey: sibling.package.descriptor.key)
        await #expect(throws: DeliveryError.damagedFiles) { try await delivery.download(packageKey: next.package.descriptor.key) }
        #expect(try await delivery.state(packageKey: next.package.descriptor.key).phase == "failed")
        await #expect(throws: DeliveryError.unavailable) { try await delivery.installation(packageKey: next.package.descriptor.key) }
        #expect(try await delivery.installation(packageKey: sibling.package.descriptor.key).descriptor == sibling.package.descriptor)
        try await delivery.download(packageKey: next.package.descriptor.key)
        #expect(try await delivery.installation(packageKey: next.package.descriptor.key).descriptor == next.package.descriptor)
    }
    @Test func configuredPackageDownloadsWithoutPurchaseAuthority() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = contentFixture()
        let delivery = try ContentDelivery(root: root, packages: [fixture.package], transport: { _ in FixtureAssets(files: fixture.files) })
        #expect(try await delivery.state(packageKey: fixture.package.descriptor.key).phase == "idle")
        try await delivery.download(packageKey: fixture.package.descriptor.key)
        #expect(try await delivery.installation(packageKey: fixture.package.descriptor.key).descriptor == fixture.package.descriptor)
    }
    @Test(arguments: [false, true]) func configuredVideoInstallsAndRemovesWithoutBroadDirectoryAuthority(withAnalysis: Bool) async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let manifest = Data(#"{"kind":"video","schemaVersion":1,"id":"video-sample","version":1,"title":"Video","media":{"file":"video/source.mp4","bytes":3,"sha256":"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad","duration":2},"phrases":[{"id":"one","start":0,"end":1,"text":"Hello","translation":"안녕"}]}"#.utf8)
        var files = ["manifest.json": manifest, "video/source.mp4": Data("abc".utf8)]
        if withAnalysis { files["syntax.json"] = Data("{}".utf8) }
        let descriptor = DeliveryPackage(key: "video-sample-v1", files: files.map {
            .init(file: $0.key, bytes: $0.value.count, sha256: SHA256.hash(data: $0.value).map { String(format: "%02x", $0) }.joined())
        })
        let delivery = try ContentDelivery(root: root, packages: [.init(descriptor: descriptor, assetPackID: nil)], transport: { [files] _ in FixtureAssets(files: files) })
        try await delivery.download(packageKey: descriptor.key)
        #expect(try await delivery.installation(packageKey: descriptor.key).manifest.phrases.first?.media == .video("video/source.mp4", start: 0, end: 1))
        await #expect(throws: DeliveryError.invalidPackage) { try await delivery.remove(packageKey: "../unrelated") }
        try await delivery.remove(packageKey: descriptor.key)
        #expect(try await delivery.state(packageKey: descriptor.key).phase == "idle")
    }
    @Test func completedDownloadEmitsInstalledContentChange() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let fixture = contentFixture()
        let delivery = try ContentDelivery(root: root, packages: [fixture.package], transport: { _ in FixtureAssets(files: fixture.files) })
        var iterator = await delivery.changes().makeAsyncIterator()
        try await delivery.download(packageKey: fixture.package.descriptor.key)
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

private final class CancellationBeforePublicationAssets: AssetDelivery {
    let files: [String: Data]
    let lastFile: String
    private let cancelOnce = Mutex(true)
    init(files: [String: Data], lastFile: String) { self.files = files; self.lastFile = lastFile }
    func download(progress: @escaping AssetDeliveryProgress) async throws { await progress(1) }
    func contents(_ file: String) throws -> Data {
        let data = try #require(files[file])
        if file == lastFile && cancelOnce.withLock({ value in let previous = value; value = false; return previous }) {
            // Transfer has returned; cancel the owned installation task on its final source read.
            withUnsafeCurrentTask { $0?.cancel() }
        }
        return data
    }
}

private actor FreeDownloadGate {
    private var started = false
    private var finished = false
    private var held: CheckedContinuation<Void, Never>?
    private var startedWaiter: CheckedContinuation<Void, Never>?
    func hold() async {
        started = true; startedWaiter?.resume(); startedWaiter = nil
        if !finished { await withCheckedContinuation { held = $0 } }
    }
    func waitUntilStarted() async {
        if !started { await withCheckedContinuation { startedWaiter = $0 } }
    }
    func finish() { finished = true; held?.resume(); held = nil }
}
private struct HeldFreeAssets: AssetDelivery {
    let gate: FreeDownloadGate
    let files: [String: Data]
    func download(progress: @escaping AssetDeliveryProgress) async throws {
        await progress(0.5)
        await gate.hold() // A late OS completion may ignore cancellation.
    }
    func contents(_ file: String) throws -> Data { try #require(files[file]) }
}
private final class RepairableFreeAssets: AssetDelivery {
    let files: [String: Data]
    let damagedFile: String
    private let repaired = Mutex(false)
    init(files: [String: Data], damagedFile: String) { self.files = files; self.damagedFile = damagedFile }
    func repair() { repaired.withLock { $0 = true } }
    func download(progress: @escaping AssetDeliveryProgress) async throws { await progress(1) }
    func contents(_ file: String) throws -> Data {
        if file == damagedFile && !repaired.withLock({ $0 }) { return Data("corrupt".utf8) }
        return try #require(files[file])
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

func contentFixture(key: String = "hosted-morning-notes-v1", book: String = "morning-notes", version: Int = 1) -> (package: HostedPackage, files: [String: Data]) {
    let audio = Data("abc".utf8)
    let audioHash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    let manifest = Data("{\"id\":\"\(book)\",\"version\":\(version),\"title\":\"Sample\",\"phrases\":[{\"text\":\"Hello\",\"translation\":\"안녕\",\"file\":\"audio/one.m4a\",\"bytes\":3,\"sha256\":\"\(audioHash)\"}]}".utf8)
    let files = ["manifest.json": manifest, "audio/one.m4a": audio]
    let descriptor = DeliveryPackage(key: key, files: files.map {
        .init(file: $0.key, bytes: $0.value.count, sha256: SHA256.hash(data: $0.value).map { String(format: "%02x", $0) }.joined())
    })
    return (HostedPackage(descriptor: descriptor, assetPackID: "fixture"), files)
}
