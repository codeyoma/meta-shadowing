import Foundation
import Testing

@MainActor
struct SingletonTests {
  @Test(arguments: ["asset-offline", "asset-quota", "head-offline", "head-quota", "lost-head-reply"])
  func failedPublicationBoundaryKeepsLastGoodAndRetries(boundary: String) async throws {
    let url = directory()
    defer { try? FileManager.default.removeItem(at: url) }
    let cloud = TestCloud(), first = try ProgressTransport(directory: url, scope: "test-scope", cloud: cloud)
    let initial = try await first.publish(scope: "test-scope", revision: 1, json: "{\"good\":true}", base: "")
    if boundary == "lost-head-reply" {
      cloud.savedResponse = { record in
        if record.id == ProgressTransport.sharedHead { var bad = record; bad.current = nil; return bad }
        return record
      }
    } else {
      cloud.onSave = { record in
        if record.kind == (boundary.hasPrefix("head") ? "ProgressBackupHead" : "ProgressBackup") {
          cloud.saveFailure = boundary.hasSuffix("quota") ? .quota : .offline
        }
      }
    }
    await #expect(throws: (any Error).self) {
      try await first.publish(scope: "test-scope", revision: 2, json: "{\"new\":true}", base: initial.token)
    }
    #expect(cloud.assets[initial.id] == Data("{\"good\":true}".utf8))
    if boundary != "lost-head-reply" { #expect(cloud.records[ProgressTransport.sharedHead]?.current?.id == initial.id) }
    let before = cloud.records[ProgressTransport.sharedHead]?.current?.id
    cloud.onSave = nil; cloud.saveFailure = nil; cloud.savedResponse = nil
    let reopened = try ProgressTransport(directory: url, scope: "test-scope", cloud: cloud)
    let ack = try await reopened.publish(scope: "test-scope", revision: 2, json: "{\"new\":true}", base: initial.token)
    if boundary == "lost-head-reply" { #expect(ack.id == before) }
    #expect(ack.revision == 2)
    #expect(!ack.cleanupPending)
    #expect(cloud.assets.count == 1)
  }

  @Test func corruptSingletonHasNoHistoricalFallback() async throws {
    let a = directory(), b = directory()
    defer { try? FileManager.default.removeItem(at: a); try? FileManager.default.removeItem(at: b) }
    let cloud = TestCloud(), writer = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    let ack = try await writer.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    cloud.assets[ack.id] = Data("damaged".utf8)
    let reader = try ProgressTransport(directory: b, scope: "test-scope", cloud: cloud)
    #expect(try await reader.list(scope: "test-scope").count == 1)
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.read(scope: "test-scope", id: ack.id) }
    cloud.records.removeValue(forKey: ack.id)
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.list(scope: "test-scope") }
  }
  @Test func anotherInstallationFinishesInterruptedMigrationCleanup() async throws {
    let a = directory(), b = directory()
    defer { try? FileManager.default.removeItem(at: a); try? FileManager.default.removeItem(at: b) }
    let cloud = TestCloud(), first = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    try await cloud.seedLegacy(first, revision: 1, json: "{}")
    let base = try #require(try await first.list(scope: "test-scope").first?.token)
    cloud.onSave = { record in if record.retired == true { cloud.saveFailure = .offline } }
    let ack = try await first.publish(scope: "test-scope", revision: 2, json: "{\"new\":true}", base: base)
    #expect(ack.cleanupPending)
    cloud.onSave = nil; cloud.saveFailure = nil
    let second = try ProgressTransport(directory: b, scope: "test-scope", cloud: cloud)
    #expect(try await second.list(scope: "test-scope").first?.cleanupPending == true)
    let retry = try await second.publish(scope: "test-scope", revision: 1, json: "{\"new\":true}", base: ack.token)
    #expect(!retry.cleanupPending)
    #expect(try await second.list(scope: "test-scope").first?.cleanupPending == false)
    #expect(cloud.assets.count == 1)
    #expect(cloud.records["head-" + first.store.state.writer]?.retired == true)
  }
  private func directory() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }

  @Test(arguments: ["retry", "restart", "second-race", "progress-changed"])
  func pendingPublicationSurvivesMetadataCleanup(boundary: String) async throws {
    let a = directory(), b = directory(), c = directory()
    defer { for url in [a, b, c] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud(), loser = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    let writer = try ProgressTransport(directory: b, scope: "test-scope", cloud: cloud)
    let initial = try await loser.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    cloud.failHead = true
    await #expect(throws: ProgressCloudError.offline) {
      try await loser.publish(scope: "test-scope", revision: 2, json: "{\"loser\":true}", base: initial.token)
    }
    let abandoned = try #require(loser.store.state.pending?.backup.id)
    cloud.failHead = false
    let chosen = try await writer.publish(scope: "test-scope", revision: 3, json: "{\"winner\":true}", base: initial.token)
    cloud.failHead = true
    await #expect(throws: ProgressCloudError.offline) {
      try await writer.publish(scope: "test-scope", revision: 4, json: "{\"next\":true}", base: chosen.token)
    }
    let pending = try #require(writer.store.state.pending)
    cloud.failHead = false; cloud.deletionFailure = .offline
    #expect(try await loser.cleanupAdopted(scope: "test-scope", base: chosen.token, abandoned: abandoned))
    #expect(cloud.records[ProgressTransport.sharedHead]?.current?.id == chosen.token)
    #expect(cloud.records[ProgressTransport.sharedHead]?.changeTag != pending.head.changeTag)
    let retry = try ProgressTransport(directory: boundary == "restart" ? b : c, scope: "test-scope", cloud: cloud)
    let active = boundary == "restart" ? retry : writer
    if boundary == "progress-changed" {
      let newer = try await retry.publish(scope: "test-scope", revision: 8, json: "{\"other\":true}", base: chosen.token)
      await #expect(throws: ProgressCloudError.conflict) {
        try await active.publish(scope: "test-scope", revision: 4, json: "{\"next\":true}", base: chosen.token)
      }
      #expect(active.store.state.pending?.expectedBase == chosen.token)
      #expect(cloud.records[ProgressTransport.sharedHead]?.current?.id == newer.token)
      return
    }
    if boundary == "second-race" {
      // A second metadata writer wins after fetch but before the conditional save.
      cloud.onSave = { record in
        guard record.id == ProgressTransport.sharedHead else { return }
        cloud.onSave = nil
        guard var head = cloud.records[ProgressTransport.sharedHead] else {
          Issue.record("Missing confirmed shared head"); return
        }
        head.changeTag = UUID().uuidString
        cloud.records[head.id] = head
      }
      await #expect(throws: ProgressCloudError.conflict) {
        try await active.publish(scope: "test-scope", revision: 4, json: "{\"next\":true}", base: chosen.token)
      }
    }
    let saved = try await active.publish(scope: "test-scope", revision: 4, json: "{\"next\":true}", base: chosen.token)
    #expect(saved.id == pending.backup.id && saved.revision == 4)
    #expect(saved.cleanupPending)
    #expect(try await active.read(scope: "test-scope", id: saved.id) == "{\"next\":true}")
    let head = try #require(cloud.records[ProgressTransport.sharedHead])
    #expect(try CleanupManifest.decode(try #require(head.cleanupManifest)).assets.contains(abandoned))
    cloud.deletionFailure = nil
    let fresh = try ProgressTransport(directory: directory(), scope: "test-scope", cloud: cloud)
    defer { try? FileManager.default.removeItem(at: fresh.store.directory) }
    #expect(try await fresh.cleanupAdopted(scope: "test-scope", base: saved.token, abandoned: nil) == false)
    #expect(cloud.assets.count == 1 && cloud.assets[saved.id] != nil)
  }

  @Test(arguments: ["normal", "before-authority", "lost-authority-reply", "delete-failure", "other-installation"])
  func adoptedWinnerRetiresExactLoserWithoutNewProgress(boundary: String) async throws {
    let a = directory(), b = directory(), c = directory()
    defer { for url in [a, b, c] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud(), loser = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    let winner = try ProgressTransport(directory: b, scope: "test-scope", cloud: cloud)
    let initial = try await loser.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    cloud.failHead = true
    await #expect(throws: ProgressCloudError.offline) {
      try await loser.publish(scope: "test-scope", revision: 2, json: "{\"loser\":true}", base: initial.token)
    }
    let id = try #require(loser.store.state.pending?.backup.id)
    cloud.failHead = false
    let chosen = try await winner.publish(scope: "test-scope", revision: 5, json: "{\"winner\":true}", base: initial.token)
    let before = try #require(cloud.records[ProgressTransport.sharedHead])
    #expect(cloud.assets.count == 2)
    #expect(try await loser.list(scope: "test-scope").first?.pendingPublication == id)
    #expect(try await loser.list(scope: "test-scope").first?.cleanupPending == true)
    if boundary == "before-authority" { cloud.failHead = true }
    if boundary == "lost-authority-reply" {
      cloud.savedResponse = { record in
        if record.id == ProgressTransport.sharedHead { var bad = record; bad.current = nil; return bad }
        return record
      }
    }
    if boundary == "delete-failure" || boundary == "other-installation" { cloud.deletionFailure = .offline }
    if boundary == "before-authority" || boundary == "lost-authority-reply" {
      await #expect(throws: (any Error).self) {
        try await loser.cleanupAdopted(scope: "test-scope", base: chosen.token, abandoned: id)
      }
      #expect(loser.store.state.pending?.expectedBase == initial.token)
      #expect(cloud.assets.count == 2)
    } else {
      #expect(try await loser.cleanupAdopted(scope: "test-scope", base: chosen.token, abandoned: id)
        == (boundary != "normal"))
      #expect(loser.store.state.pending == nil)
    }
    cloud.failHead = false; cloud.savedResponse = nil; cloud.deletionFailure = nil
    let resumed = try ProgressTransport(directory: boundary == "other-installation" ? c : a, scope: "test-scope", cloud: cloud)
    if boundary == "other-installation" {
      #expect(try await resumed.list(scope: "test-scope").first?.cleanupPending == true)
    }
    #expect(try await resumed.cleanupAdopted(scope: "test-scope", base: chosen.token,
      abandoned: boundary == "other-installation" ? nil : id) == false)
    let after = try #require(cloud.records[ProgressTransport.sharedHead])
    #expect(after.current == before.current && after.revision == before.revision && after.createdAt == before.createdAt)
    #expect(try CleanupManifest.decode(try #require(after.cleanupManifest)).assets.contains(id))
    #expect(cloud.assets.count == 1 && cloud.assets[chosen.id] != nil)
  }

  @Test(arguments: ["account", "base", "pending-id", "head-cas", "account-during-cas", "current"])
  func abandonedCleanupRejectsStaleAuthority(boundary: String) async throws {
    let a = directory(), b = directory()
    defer { for url in [a, b] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud(), first = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    let other = try ProgressTransport(directory: b, scope: "test-scope", cloud: cloud)
    let initial = try await first.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    cloud.failHead = true
    await #expect(throws: ProgressCloudError.offline) {
      try await first.publish(scope: "test-scope", revision: 2, json: "{\"next\":true}", base: initial.token)
    }
    cloud.failHead = false
    let pending = try #require(first.store.state.pending)
    if boundary == "account" { cloud.account = "other-scope" }
    if boundary == "head-cas" {
      cloud.onSave = { record in
        if record.id == ProgressTransport.sharedHead {
          cloud.onSave = nil
          _ = try? await other.publish(scope: "test-scope", revision: 3, json: "{\"other\":true}", base: initial.token)
        }
      }
    }
    if boundary == "account-during-cas" { cloud.onSave = { _ in cloud.account = "other-scope" } }
    await #expect(throws: (any Error).self) {
      try await first.cleanupAdopted(scope: "test-scope", base: boundary == "base" ? "stale" : initial.token,
        abandoned: boundary == "pending-id" || boundary == "current" ? initial.id : pending.backup.id)
    }
    #expect(first.store.state.pending?.backup.id == pending.backup.id)
    #expect(first.store.state.pending?.expectedBase == initial.token)
    #expect(cloud.assets[pending.backup.id] != nil)
    // A clean maintenance call with no explicit abandonment protects active intent.
    cloud.account = "test-scope"; cloud.onSave = nil
    let base = try #require(try await first.list(scope: "test-scope").first?.token)
    _ = try await first.cleanupAdopted(scope: "test-scope", base: base, abandoned: nil)
    #expect(first.store.state.pending?.backup.id == pending.backup.id)
    #expect(cloud.assets[pending.backup.id] != nil)
  }

  @Test func staleBaseAndHeadRaceNeverOverwriteWinner() async throws {
    let a = directory(), b = directory()
    defer { try? FileManager.default.removeItem(at: a); try? FileManager.default.removeItem(at: b) }
    let cloud = TestCloud()
    let first = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    let second = try ProgressTransport(directory: b, scope: "test-scope", cloud: cloud)
    let initial = try await first.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    await #expect(throws: ProgressCloudError.conflict) {
      try await second.publish(scope: "test-scope", revision: 2, json: "{}", base: "")
    }
    var winner: CloudPublication?
    cloud.onSave = { record in
      if record.id == ProgressTransport.sharedHead {
        cloud.onSave = nil
        winner = try? await second.publish(scope: "test-scope", revision: 4, json: "{\"winner\":true}", base: initial.token)
      }
    }
    await #expect(throws: ProgressCloudError.conflict) {
      try await first.publish(scope: "test-scope", revision: 3, json: "{\"loser\":true}", base: initial.token)
    }
    let winnerID = try #require(winner?.id)
    let reopened = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    await #expect(throws: ProgressCloudError.conflict) {
      try await reopened.publish(scope: "test-scope", revision: 3, json: "{\"loser\":true}", base: initial.token)
    }
    #expect(try await reopened.list(scope: "test-scope").map(\.id) == [winnerID])
    #expect(try await reopened.list(scope: "test-scope").first?.cleanupPending == true)
    let resolution = try await reopened.publish(scope: "test-scope", revision: 3, json: "{\"loser\":true}", base: winnerID)
    #expect(resolution.revision == 3)
    #expect(cloud.assets.count == 1)
  }

  @Test func lostHeadReplyRetriesCommittedIdentityAndDurableCleanup() async throws {
    let url = directory()
    defer { try? FileManager.default.removeItem(at: url) }
    let cloud = TestCloud()
    // Use a shared external cloud with a real new store for each process lifetime.
    let first = try ProgressTransport(directory: url, scope: "test-scope", cloud: cloud)
    let initial = try await first.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    cloud.deletionFailure = .offline
    let acknowledged = try await first.publish(scope: "test-scope", revision: 2, json: "{\"next\":true}", base: initial.token)
    #expect(acknowledged.cleanupPending)
    #expect(cloud.assets.count == 2)
    let reopened = try ProgressTransport(directory: url, scope: "test-scope", cloud: cloud)
    cloud.deletionFailure = nil
    let retry = try await reopened.publish(scope: "test-scope", revision: 2, json: "{\"next\":true}", base: initial.token)
    #expect(retry.id == acknowledged.id)
    #expect(!retry.cleanupPending)
    #expect(cloud.assets.count == 1)
    await #expect(throws: ProgressCloudError.corrupt) { try await reopened.read(scope: "test-scope", id: initial.id) }
  }

  @Test(arguments: [false, true])
  func migrationRetiresOnlyUnchangedLegacyHeads(changed: Bool) async throws {
    let url = directory(), readerURL = directory()
    defer { try? FileManager.default.removeItem(at: url); try? FileManager.default.removeItem(at: readerURL) }
    let cloud = TestCloud(), writer = try ProgressTransport(directory: url, scope: "test-scope", cloud: cloud)
    try await cloud.seedLegacy(writer, revision: 1, json: "{\"legacy\":1}")
    try await cloud.seedLegacy(writer, revision: 2, json: "{\"legacy\":2}")
    let reader = try ProgressTransport(directory: readerURL, scope: "test-scope", cloud: cloud)
    let choices = try await reader.list(scope: "test-scope")
    #expect(choices.count == 2)
    #expect(choices.allSatisfy { $0.legacy && $0.token == choices[0].token })
    #expect(try await writer.list(scope: "test-scope").first?.token == choices[0].token)
    if changed {
      cloud.onSave = { record in
        if record.retired == true {
          cloud.onSave = nil
          try? await cloud.seedLegacy(writer, revision: 3, json: "{\"legacy\":3}")
        }
      }
    }
    let ack = try await reader.publish(scope: "test-scope", revision: 9, json: "{\"selected\":2}", base: choices[0].token)
    #expect(ack.cleanupPending == changed)
    let single = try await reader.list(scope: "test-scope")
    #expect(single.count == 1)
    #expect(single.first?.legacy == false)
    if changed {
      #expect(cloud.records["head-" + writer.store.state.writer]?.revision == 3)
      let retry = try await reader.publish(scope: "test-scope", revision: 9, json: "{\"selected\":2}", base: ack.token)
      #expect(retry.cleanupPending)
    } else {
      #expect(cloud.assets.count == 1)
      #expect(cloud.records["head-" + writer.store.state.writer]?.retired == true)
    }
  }

  @Test func legacyFingerprintChangesWhenNonselectedHeadChanges() async throws {
    let a = directory(), b = directory()
    defer { try? FileManager.default.removeItem(at: a); try? FileManager.default.removeItem(at: b) }
    let cloud = TestCloud(), first = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    let second = try ProgressTransport(directory: b, scope: "test-scope", cloud: cloud)
    try await cloud.seedLegacy(first, revision: 1, json: "{}")
    try await cloud.seedLegacy(second, revision: 1, json: "{}")
    let base = try #require(try await first.list(scope: "test-scope").first?.token)
    try await cloud.seedLegacy(second, revision: 2, json: "{\"other\":true}")
    #expect(try await first.list(scope: "test-scope").first?.token != base)
    await #expect(throws: ProgressCloudError.conflict) {
      try await first.publish(scope: "test-scope", revision: 1, json: "{}", base: base)
    }
    #expect(cloud.records[ProgressTransport.sharedHead] == nil)
  }
  @Test func sequentialDevicesMaintainOneRecoverableBackup() async throws {
    let firstURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    let secondURL = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: firstURL); try? FileManager.default.removeItem(at: secondURL) }
    let cloud = TestCloud()
    let first = try ProgressTransport(directory: firstURL, scope: "test-scope", cloud: cloud)
    let second = try ProgressTransport(directory: secondURL, scope: "test-scope", cloud: cloud)
    let initial = try await first.publish(scope: "test-scope", revision: 4, json: "{\"first\":true}", base: "")
    _ = try await second.publish(scope: "test-scope", revision: 1, json: "{\"second\":true}", base: initial.token)
    #expect(try await first.list(scope: "test-scope").count == 1)
    #expect(cloud.records.values.filter { $0.kind == "ProgressBackupHead" }.count == 1)
    #expect(cloud.assets.count == 1)
  }
}
