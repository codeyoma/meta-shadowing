import CloudKit
import Foundation
import Testing

@MainActor
struct CloudKitDeliveryTests {
  @Test func sharedHeadAndRetiredLegacyMetadataRoundTripThroughCloudKit() throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try ProgressStore(directory: root)
    let writer = UUID().uuidString, assetID = UUID().uuidString
    let original = BackupRecord(id: "head-" + writer, kind: "ProgressBackupHead", writer: writer,
      revision: 1, createdAt: "2026-01-01T00:00:00Z",
      current: BackupReference(id: assetID, hash: String(repeating: "a", count: 64)))
    var shared = original
    shared = BackupRecord(id: ProgressTransport.sharedHead, kind: original.kind, writer: writer,
      revision: 1, createdAt: original.createdAt, current: original.current,
      cleanupManifest: try CleanupManifest(heads: [original], assets: [assetID]).encoded())
    var retired = original; retired.retired = true; retired.current = nil
    let encodedShared = try CloudKitService.encode(shared, asset: nil)
    let encodedRetired = try CloudKitService.encode(retired, asset: nil)
    let service = CloudKitService(scope: "test-scope") { "test-scope" }
    try service.deliver(.records([encodedShared, encodedRetired]), into: store)
    #expect(store.state.records[ProgressTransport.sharedHead]?.hasSamePayload(as: shared) == true)
    #expect(store.state.records[original.id]?.retired == true)
    #expect(store.state.records[original.id]?.current == nil)
    encodedShared["previousID"] = UUID().uuidString as NSString
    encodedShared["previousHash"] = String(repeating: "b", count: 64) as NSString
    #expect(throws: ProgressCloudError.corrupt) { try CloudKitService.decode(encodedShared) }
    encodedRetired["currentID"] = assetID as NSString
    #expect(throws: ProgressCloudError.corrupt) { try CloudKitService.decode(encodedRetired) }
  }
  @Test
  func initialSignInAllowsReplayStateWithoutChangingLocalRecords() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try ProgressStore(directory: root)
    let service = CloudKitService(scope: "account-a") { "account-a" }
    await service.receiveAccountChange(.signIn(currentUser: CKRecord.ID(recordName: "test-user")))
    let token = Data("signed-in-state".utf8)
    try service.deliver(.state(token), into: store)
    #expect(try ProgressStore(directory: root).state.engine == token)
    #expect(store.state.records.isEmpty)
  }

  @Test(arguments: [false, true])
  func accountReplacementBlocksStateAndLaterSignInCannotReviveIt(switchAccount: Bool) async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try ProgressStore(directory: root)
    let token = Data("previous-state".utf8)
    try store.update { $0.engine = token }
    let service = CloudKitService(scope: "account-a") { "account-a" }
    let user = CKRecord.ID(recordName: "test-user")
    await service.receiveAccountChange(switchAccount
      ? .switchAccounts(previousUser: user, currentUser: CKRecord.ID(recordName: "other-user"))
      : .signOut(previousUser: user))
    await service.receiveAccountChange(.signIn(currentUser: user))
    #expect(throws: ProgressCloudError.accountChanged) { try service.deliver(.state(Data()), into: store) }
    #expect(try ProgressStore(directory: root).state.engine == token)
  }

  @Test
  func signInForDifferentIdentityStillBlocksDelivery() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let store = try ProgressStore(directory: root)
    let service = CloudKitService(scope: "account-a") { "account-b" }
    await service.receiveAccountChange(.signIn(currentUser: CKRecord.ID(recordName: "other-user")))
    #expect(throws: ProgressCloudError.accountChanged) { try service.deliver(.state(Data()), into: store) }
    #expect(store.state.engine == nil)
  }

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
