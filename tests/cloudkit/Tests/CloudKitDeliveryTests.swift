import CloudKit
import Foundation
import Testing

@MainActor
struct CloudKitDeliveryTests {
  @Test(arguments: [false, true])
  func temporaryAssetReadFailureRetainsReplayPointUntilOwnedCopyExists(resourceLookupSucceeds: Bool) throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try ProgressStore(directory: root.appendingPathComponent("profile"))
    let previousToken = Data("previous-serialization".utf8)
    let nextToken = Data("next-serialization".utf8)
    try store.update { $0.engine = previousToken }
    let json = Data("{\"value\":42}".utf8)
    let assetURL = root.appendingPathComponent("cloud-temporary-asset")
    if resourceLookupSucceeds {
      // Resource lookup succeeds for this file, while read permission is temporarily denied.
      try json.write(to: assetURL, options: .atomic)
      try FileManager.default.setAttributes([.posixPermissions: 0], ofItemAtPath: assetURL.path)
      #expect(try assetURL.resourceValues(forKeys: [.fileSizeKey]).fileSize == json.count)
    }
    let writer = UUID().uuidString
    let metadata = BackupRecord(id: UUID().uuidString, kind: "ProgressBackup", writer: writer,
      revision: 42, createdAt: "2026-01-01T00:00:00Z", hash: ProgressStore.hash(json), bytes: json.count)
    let backup = try CloudKitService.encode(metadata, asset: assetURL)
    let head = try CloudKitService.encode(BackupRecord(id: "head-" + writer, kind: "ProgressBackupHead",
      writer: writer, revision: 42, createdAt: metadata.createdAt,
      current: BackupReference(id: metadata.id, hash: metadata.hash)), asset: nil)
    let service = CloudKitService(scope: "test-scope") { "test-scope" }
    // The URL names a valid asset, but its local delivery file is temporarily unavailable.
    #expect(throws: ProgressCloudError.storage) { try service.deliver(.records([backup, head]), into: store) }
    #expect(throws: ProgressCloudError.storage) { try service.deliver(.state(nextToken), into: store) }
    #expect(try ProgressStore(directory: store.directory).state.engine == previousToken)

    if resourceLookupSucceeds {
      try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: assetURL.path)
    }
    try json.write(to: assetURL, options: .atomic)
    let retry = CloudKitService(scope: "test-scope") { "test-scope" }
    try retry.deliver(.records([backup, head]), into: store)
    try retry.deliver(.state(nextToken), into: store)
    let reopened = try ProgressStore(directory: store.directory)
    #expect(reopened.state.engine == nextToken)
    #expect(try reopened.asset(metadata) == json)
    // The app-owned copy remains usable after CloudKit removes its temporary delivery file.
    try FileManager.default.removeItem(at: assetURL)
    #expect(try reopened.asset(metadata) == json)
  }
}
