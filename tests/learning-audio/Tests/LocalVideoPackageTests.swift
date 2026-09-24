import Foundation
import CryptoKit
import Testing
import Synchronization

struct LocalVideoPackageTests {
  @Test func repeatedSegmentAccessReusesVerificationButRelaunchVerifiesAgain() async throws {
    let (root, installer) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    try await installer.install()
    let reads = Mutex(0)
    let checksum: @Sendable (URL) throws -> String = { url in
      reads.withLock { $0 += 1 }
      return try LocalVideoPackage.sha256(url)
    }
    let store = LocalVideoPackage(source: root.appendingPathComponent("source"),
      packages: root.appendingPathComponent("installed"), checksum: checksum)
    #expect(try await store.status().installed)
    let url = try await store.mediaURL()
    for _ in 0..<20 {
      #expect(try await store.mediaURL() == url)
      #expect(try await store.status().installed)
    }
    #expect(reads.withLock { $0 } == 1, "Repeated segment preparation must not reread the complete movie")
    let relaunched = LocalVideoPackage(source: root.appendingPathComponent("source"),
      packages: root.appendingPathComponent("installed"), checksum: checksum)
    #expect(try await relaunched.status().installed)
    #expect(reads.withLock { $0 } == 2, "A new package instance must verify the installed bytes again")
  }
  @Test func malformedSourceIsReportedButAbsentOptInIsNotAnError() throws {
    let (root, _) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    let source = root.appendingPathComponent("source")
    try Data("invalid".utf8).write(to: source.appendingPathComponent("manifest.json"))
    #expect(LocalVideoPackage(source: source, packages: root).manifestInvalid)
    #expect(!LocalVideoPackage(source: nil, packages: root).manifestInvalid)
    #expect(!LocalVideoPackage(source: root.appendingPathComponent("absent"), packages: root).manifestInvalid)
  }
  @Test func cachedVerificationRejectsSameSizeEditsAndReplacementsAndCanRecover() async throws {
    let (root, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    try await store.install()
    let url = try await store.mediaURL()
    let modified = try #require(FileManager.default.attributesOfItem(atPath: url.path)[.modificationDate] as? Date)
    try Data("changed!!".utf8).write(to: url)
    try FileManager.default.setAttributes([.modificationDate: modified], ofItemAtPath: url.path)
    #expect(try await store.status().installed == false)
    await #expect(throws: (any Error).self) { try await store.mediaURL() }
    try Data("synthetic".utf8).write(to: url, options: .atomic)
    #expect(try await store.mediaURL() == url)
    try Data("changed!!".utf8).write(to: url, options: .atomic)
    try FileManager.default.setAttributes([.modificationDate: modified], ofItemAtPath: url.path)
    await #expect(throws: (any Error).self) { try await store.mediaURL() }
    try await store.remove()
    await #expect(throws: (any Error).self) { try await store.mediaURL() }
    try await store.install()
    #expect(try await store.mediaURL() == url)
    #expect(try await store.status().installed)
  }
  func fixture() throws -> (URL, LocalVideoPackage) {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let source = root.appendingPathComponent("source")
    try FileManager.default.createDirectory(at: source.appendingPathComponent("video"), withIntermediateDirectories: true)
    let bytes = Data("synthetic".utf8)
    try bytes.write(to: source.appendingPathComponent("video/source.mp4"))
    let hash = SHA256.hash(data: bytes).map { String(format: "%02x", $0) }.joined()
    let object: [String: Any] = ["kind": "video", "schemaVersion": 1, "id": "video-practice", "version": 1,
      "title": "Video practice", "media": ["file": "video/source.mp4", "bytes": bytes.count, "sha256": hash, "duration": 20],
      "phrases": [["id": "p1", "start": 10, "end": 12.5, "text": "Hello.", "translation": "안녕."]]]
    try JSONSerialization.data(withJSONObject: object).write(to: source.appendingPathComponent("manifest.json"))
    return (root, LocalVideoPackage(source: source, packages: root.appendingPathComponent("installed")))
  }
  @Test func installVerifyRemoveAndRejectChangedMedia() async throws {
    let (root, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    #expect(try await store.status().installed == false)
    try await store.install()
    #expect(try await store.status().installed)
    let url = try await store.mediaURL()
    #expect(try Data(contentsOf: url) == Data("synthetic".utf8))
    try Data("changed!!".utf8).write(to: url)
    #expect(try await store.status().installed == false)
    await #expect(throws: (any Error).self) { try await store.mediaURL() }
    try await store.remove()
    #expect(try await store.status().bytes == 0)
  }
  @Test func symlinkedMediaIsNeitherInstalledNorRemovedOutsideThePackage() async throws {
    let (root, store) = try fixture()
    defer { try? FileManager.default.removeItem(at: root) }
    try await store.install()
    let installed = try await store.mediaURL()
    let outside = root.appendingPathComponent("outside.mp4")
    try FileManager.default.moveItem(at: installed, to: outside)
    try FileManager.default.createSymbolicLink(at: installed, withDestinationURL: outside)
    await #expect(throws: (any Error).self) { try await store.mediaURL() }
    try await store.remove()
    #expect(try Data(contentsOf: outside) == Data("synthetic".utf8))
  }
}
