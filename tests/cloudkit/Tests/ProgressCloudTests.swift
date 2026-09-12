import Foundation
import Testing

@MainActor
struct ProgressCloudTests {
  @Test(arguments: ["missing", "hash", "revision", "date"])
  func invalidCurrentWithoutRecoveryIsNeverEmpty(damage: String) async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud(), data = Data("{}".utf8)
    let hash = ProgressStore.hash(data)
    cloud.records["head-other"] = BackupRecord(id: "head-other", kind: "ProgressBackupHead", writer: "other",
      revision: 1, createdAt: "2026-01-01T00:00:00Z", current: BackupReference(id: "current", hash: hash))
    if damage != "missing" {
      cloud.records["current"] = BackupRecord(id: "current", kind: "ProgressBackup", writer: "other",
        revision: damage == "revision" ? 2 : 1,
        createdAt: damage == "date" ? "2026-01-02T00:00:00Z" : "2026-01-01T00:00:00Z",
        hash: damage == "hash" ? String(repeating: "a", count: 64) : hash, bytes: data.count)
      cloud.assets["current"] = data
    }
    let reader = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    let before = cloud.records
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.list(scope: "test-scope") }
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.publish(scope: "test-scope", revision: 1, json: "{}") }
    #expect(cloud.records == before)
  }
  @Test func validOtherHeadRemainsRecoverableAlongsideDamagedHead() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let freshDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory); try? FileManager.default.removeItem(at: freshDirectory) }
    let cloud = TestCloud()
    let writer = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    _ = try await writer.publish(scope: "test-scope", revision: 1, json: "{\"valid\":true}")
    let head = try #require(cloud.records.values.first { $0.kind == "ProgressBackupHead" })
    let current = try #require(head.current)
    cloud.records["head-damaged"] = BackupRecord(id: "head-damaged", kind: "ProgressBackupHead", writer: "damaged",
      revision: 1, createdAt: "2026-01-01T00:00:00Z", current: BackupReference(id: "missing", hash: String(repeating: "a", count: 64)))
    let reader = try ProgressTransport(directory: freshDirectory, scope: "test-scope", cloud: cloud)
    #expect(try await reader.list(scope: "test-scope").map(\.id) == [current.id])
    #expect(try await reader.read(scope: "test-scope", id: current.id) == "{\"valid\":true}")
    let before = cloud.records
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.publish(scope: "test-scope", revision: 1, json: "{}") }
    #expect(cloud.records == before)
  }
  @Test(arguments: ["missing", "hash", "revision", "date"])
  func brokenCurrentMetadataPreservesPreviousRecovery(damage: String) async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let freshDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory); try? FileManager.default.removeItem(at: freshDirectory) }
    let cloud = TestCloud()
    let writer = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    _ = try await writer.publish(scope: "test-scope", revision: 1, json: "{\"value\":1}")
    _ = try await writer.publish(scope: "test-scope", revision: 2, json: "{\"value\":2}")
    let head = try #require(cloud.records.values.first { $0.kind == "ProgressBackupHead" })
    let current = try #require(head.current), previous = try #require(head.previous)
    let record = try #require(cloud.records[current.id])
    if damage == "missing" { cloud.records.removeValue(forKey: current.id) }
    else {
      cloud.records[current.id] = BackupRecord(id: record.id, kind: record.kind, writer: record.writer,
        revision: damage == "revision" ? 99 : record.revision,
        createdAt: damage == "date" ? "2026-01-01T00:00:00Z" : record.createdAt,
        hash: damage == "hash" ? String(repeating: "a", count: 64) : record.hash, bytes: record.bytes)
    }
    let reader = try ProgressTransport(directory: freshDirectory, scope: "test-scope", cloud: cloud)
    #expect(try await reader.list(scope: "test-scope").map(\.id) == [previous.id])
    #expect(try await reader.read(scope: "test-scope", id: previous.id) == "{\"value\":1}")
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.read(scope: "test-scope", id: current.id) }
    let before = cloud.records
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.publish(scope: "test-scope", revision: 1, json: "{}") }
    #expect(cloud.records == before)
    #expect(cloud.assets[previous.id] == Data("{\"value\":1}".utf8))
  }
  @Test func mismatchedAcknowledgementNeverAdvancesHead() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud()
    cloud.savedResponse = { record in
      BackupRecord(id: record.id, kind: record.kind, writer: "wrong-writer", revision: record.revision,
        createdAt: record.createdAt, hash: record.hash, bytes: record.bytes)
    }
    let transport = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    await #expect(throws: ProgressCloudError.conflict) { try await transport.publish(scope: "test-scope", revision: 1, json: "{}") }
    #expect(cloud.records.values.allSatisfy { $0.kind != "ProgressBackupHead" })
    #expect(transport.pendingRevision == 1)
  }
  @Test func unavailableOwnerDoesNotInitializeCloudKit() async {
    let owner = ProgressCloudOwner()
    #expect(await owner.account() == ["status": "unavailable"])
    await owner.stop()
    #expect(await owner.account() == ["status": "unavailable"])
  }
  @Test func staleAccountAcknowledgementCannotAdvanceHead() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud()
    let transport = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    cloud.onSave = { _ in cloud.account = "other-scope" }
    await #expect(throws: ProgressCloudError.accountChanged) {
      try await transport.publish(scope: "test-scope", revision: 1, json: "{}")
    }
    #expect(cloud.records.values.allSatisfy { $0.kind != "ProgressBackupHead" })
    let reopened = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    #expect(reopened.pendingRevision == 1)
  }
  @Test func stoppedPublicationCannotAcknowledgeAfterExternalSaveReturns() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud()
    let transport = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    cloud.onSave = { _ in await transport.stop() }
    await #expect(throws: ProgressCloudError.accountChanged) {
      try await transport.publish(scope: "test-scope", revision: 1, json: "{}")
    }
    #expect(cloud.records.values.allSatisfy { $0.kind != "ProgressBackupHead" })
    cloud.onSave = nil
    #expect(try await transport.publish(scope: "test-scope", revision: 1, json: "{}") == 1)
  }
  @Test func failedFetchCannotAuthorizeFirstPublication() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud(); cloud.failFetch = true
    let transport = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    await #expect(throws: ProgressCloudError.offline) { try await transport.list(scope: "test-scope") }
    await #expect(throws: ProgressCloudError.offline) { try await transport.publish(scope: "test-scope", revision: 1, json: "{}") }
    #expect(cloud.records.isEmpty)
  }
  @Test func quotaFailurePreservesCurrentAndPreviousAndDurablePending() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud()
    let transport = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    _ = try await transport.publish(scope: "test-scope", revision: 1, json: "{\"value\":1}")
    _ = try await transport.publish(scope: "test-scope", revision: 2, json: "{\"value\":2}")
    cloud.saveFailure = .quota
    await #expect(throws: ProgressCloudError.quota) { try await transport.publish(scope: "test-scope", revision: 3, json: "{\"value\":3}") }
    #expect(try await transport.list(scope: "test-scope").count == 2)
    let reopened = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    #expect(reopened.pendingRevision == 3)
  }
  @Test func retainsTwoGenerationsAndRetriesOnlyAcknowledgedCleanup() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let otherDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory); try? FileManager.default.removeItem(at: otherDirectory) }
    let cloud = TestCloud()
    let other = try ProgressTransport(directory: otherDirectory, scope: "test-scope", cloud: cloud)
    _ = try await other.publish(scope: "test-scope", revision: 50, json: "{\"other\":true}")
    let transport = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    for revision in 1...10 { _ = try await transport.publish(scope: "test-scope", revision: revision, json: "{\"value\":\(revision)}") }
    #expect(cloud.assets.count == 3)
    #expect(try await transport.list(scope: "test-scope").count == 3)
    cloud.deletionFailure = .offline
    await #expect(throws: ProgressCloudError.offline) { try await transport.publish(scope: "test-scope", revision: 11, json: "{\"value\":11}") }
    #expect(cloud.assets.count == 4)
    cloud.deletionFailure = nil
    let reopened = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    #expect(try await reopened.publish(scope: "test-scope", revision: 11, json: "{\"value\":11}") == 11)
    #expect(cloud.assets.count == 3)
  }
  @Test func incompleteHeadIsNotAnEmptyAccount() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud()
    cloud.records["head-other"] = BackupRecord(id: "head-other", kind: "ProgressBackupHead", writer: "other",
      revision: 1, createdAt: "2026-01-01T00:00:00Z", current: BackupReference(id: "missing", hash: String(repeating: "a", count: 64)))
    let reader = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.list(scope: "test-scope") }
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.publish(scope: "test-scope", revision: 1, json: "{}") }
  }
  @Test func damagedCurrentStillOffersPreviousForExplicitRecovery() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let freshDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory); try? FileManager.default.removeItem(at: freshDirectory) }
    let cloud = TestCloud()
    let writer = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    _ = try await writer.publish(scope: "test-scope", revision: 1, json: "{\"value\":1}")
    _ = try await writer.publish(scope: "test-scope", revision: 2, json: "{\"value\":2}")
    let head = try #require(cloud.records.values.first { $0.kind == "ProgressBackupHead" })
    let current = try #require(head.current), previous = try #require(head.previous)
    cloud.assets[current.id] = Data("broken".utf8)
    let reader = try ProgressTransport(directory: freshDirectory, scope: "test-scope", cloud: cloud)
    #expect(try await reader.list(scope: "test-scope").count == 2)
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.read(scope: "test-scope", id: current.id) }
    #expect(try await reader.read(scope: "test-scope", id: previous.id) == "{\"value\":1}")
  }
  @Test func newerPayloadFinishesDurablePendingBeforePublishingItsOwnGeneration() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud()
    cloud.failHead = true
    let first = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    await #expect(throws: ProgressCloudError.offline) {
      try await first.publish(scope: "test-scope", revision: 7, json: "{\"value\":1}")
    }
    let reopened = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    #expect(reopened.pendingRevision == 7)
    #expect(try await reopened.list(scope: "test-scope").isEmpty)
    cloud.failHead = false
    #expect(try await reopened.publish(scope: "test-scope", revision: 7, json: "{\"value\":2}") == 7)
    let backups = try await reopened.list(scope: "test-scope")
    #expect(backups.count == 2)
    var values: Set<String> = []
    for backup in backups { values.insert(try await reopened.read(scope: "test-scope", id: backup.id)) }
    #expect(values == ["{\"value\":1}", "{\"value\":2}"])
  }
  @Test func publicationSurvivesReopenAndRestoresExactJSON() async throws {
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: directory) }
    let cloud = TestCloud()
    let transport = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    let result = try await transport.publish(scope: "test-scope", revision: 7, json: "{\"example\":true}")
    #expect(result == 7)
    let reopened = try ProgressTransport(directory: directory, scope: "test-scope", cloud: cloud)
    let backups = try await reopened.list(scope: "test-scope")
    #expect(backups.count == 1)
    let backup = try #require(backups.first)
    #expect(try await reopened.read(scope: "test-scope", id: backup.id) == "{\"example\":true}")
  }
}
