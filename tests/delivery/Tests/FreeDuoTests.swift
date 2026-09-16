import CryptoKit
import Foundation
import Testing
import AVFAudio

struct FreeDuoTests {
  @Test(.enabled(if: ProcessInfo.processInfo.environment["DUO_PREPARED_PATH"] != nil))
  func preparedAudioInstallsAndDecodesOfflineAndCorruptionIsRejected() throws {
    let source = URL(fileURLWithPath: try #require(ProcessInfo.processInfo.environment["DUO_PREPARED_PATH"]))
    let manifestData = try Data(contentsOf: source.appendingPathComponent("manifest.json"))
    struct Manifest: Decodable { let phrases: [DeliveryPackage.Entry] }
    let manifest = try JSONDecoder().decode(Manifest.self, from: manifestData)
    #expect(manifest.phrases.count == 560)
    let hash = SHA256.hash(data: manifestData).map { String(format: "%02x", $0) }.joined()
    let package = DeliveryPackage(key: "duo-33-free-test-v1", files: [
      .init(file: "manifest.json", bytes: manifestData.count, sha256: hash)
    ] + manifest.phrases)
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let installer = PackageInstallation(root: root)
    #expect(throws: DeliveryError.damagedFiles) {
      try installer.install(package) { file in
        file == "audio/phrase-560.m4a" ? Data("damaged".utf8) : try Data(contentsOf: source.appendingPathComponent(file))
      }
    }
    #expect(try !installer.isInstalled(package))
    try installer.install(package) { try Data(contentsOf: source.appendingPathComponent($0)) }
    #expect(try installer.isInstalled(package))
    // Open only the published local installation; no network or source fallback.
    for entry in manifest.phrases {
      let audio = try AVAudioFile(forReading: root.appendingPathComponent(package.key).appendingPathComponent(entry.file))
      let buffer = try #require(AVAudioPCMBuffer(pcmFormat: audio.processingFormat, frameCapacity: 1024))
      try audio.read(into: buffer)
      #expect(buffer.frameLength > 0)
    }
  }
  @Test func freeAccessRequiresExplicitTestBuildAndNonProductionEnvironment() {
    #expect(!FreeDuoPolicy.allows(enabled: false, development: true, receiptName: nil))
    #expect(!FreeDuoPolicy.allows(enabled: true, development: false, receiptName: nil))
    #expect(!FreeDuoPolicy.allows(enabled: true, development: false, receiptName: "receipt"))
    #expect(FreeDuoPolicy.allows(enabled: true, development: true, receiptName: nil))
    #expect(FreeDuoPolicy.allows(enabled: true, development: false, receiptName: "sandboxReceipt"))
  }
  @Test func installsFullSizedTestBookWithoutTouchingSample() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let data = Data("fixture".utf8)
    let hash = SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    let files = ["manifest.json"] + (1...560).map { "audio/phrase-\($0).m4a" }
    let package = DeliveryPackage(key: "duo-33-free-test-v1", files: files.map { .init(file: $0, bytes: data.count, sha256: hash) })
    let installer = PackageInstallation(root: root)
    let sample = DeliveryPackage(key: "hosted-morning-notes-v1", files: Array(package.files.prefix(2)))
    try installer.install(sample) { _ in data }
    try installer.install(package) { _ in data }
    #expect(try installer.isInstalled(package))
    let download = PackageDownload(installation: installer, transport: nil)
    #expect(try await download.storage(package).installed)
    _ = try await download.remove(package)
    #expect(try !installer.isInstalled(package))
    #expect(try installer.isInstalled(sample))
  }
}
