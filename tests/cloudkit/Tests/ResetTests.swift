import Foundation
import Testing

@MainActor
struct ResetTests {
  @Test(arguments: [false, true])
  func lateOldGenerationAssetCannotOutliveCompletedReset(reopen: Bool) async throws {
    let root = directory(), other = directory()
    defer { for url in [root, other] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud(), stale = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let deleting = try ProgressTransport(directory: other, scope: "test-scope", cloud: cloud)
    let initial = try await stale.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    let entered = TestGate(), release = TestGate(), request = UUID().uuidString
    cloud.onSave = { record in
      guard record.kind == "ProgressBackup", record.resetGeneration == nil else { return }
      entered.open(); await release.wait()
    }
    let uploading = Task { try await stale.publish(scope: "test-scope", revision: 2, json: "{\"old\":true}", base: initial.token) }
    await entered.wait()
    let pendingID = try #require(stale.store.state.pending?.backup.id)
    let reset = try await deleting.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    #expect(!reset.cleanupPending)
    release.open()
    await #expect(throws: ProgressCloudError.conflict) { try await uploading.value }
    // No retry/sweep on the deleting installation may be required after success.
    #expect(cloud.assets[pendingID] == nil)
    #expect(Set(cloud.assets.keys) == [reset.id])
    cloud.onSave = nil
    let retry = reopen ? try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud) : stale
    #expect(retry.store.state.pending?.backup.id == pendingID)
    await #expect(throws: ProgressCloudError.conflict) {
      try await retry.publish(scope: "test-scope", revision: 2, json: "{\"old\":true}", base: initial.token)
    }
    #expect(cloud.assets[pendingID] == nil)
  }
  @Test func learningCommittedDuringResetCleanupIsReturnedAsCurrentSnapshot() async throws {
    let root = directory(), other = directory()
    defer { for url in [root, other] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud(), deleting = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let learning = try ProgressTransport(directory: other, scope: "test-scope", cloud: cloud)
    let request = UUID().uuidString
    var fetches = 0
    var current: CloudPublication?
    cloud.onFetch = {
      fetches += 1
      guard fetches == 2 else { return }
      cloud.onFetch = nil
      let base = cloud.records[ProgressTransport.sharedHead]!.current!.id
      current = try? await learning.publish(scope: "test-scope", revision: 5,
        json: resetEnvelope(request, preferences: "[{\"key\":\"selection\",\"value\":\"new-learning\"}]"), base: base)
    }
    let result = try await deleting.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    #expect(result.id == current?.id)
    #expect(result.revision == 5)
  }
  @Test func resetRejectsStalePendingAndFreshBaseLegacyPayloads() async throws {
    let root = directory(), other = directory()
    defer { for url in [root, other] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud()
    let stale = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let initial = try await stale.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    cloud.failHead = true
    await #expect(throws: ProgressCloudError.offline) {
      try await stale.publish(scope: "test-scope", revision: 2, json: "{\"version\":4}", base: initial.token)
    }
    cloud.failHead = false
    let deleting = try ProgressTransport(directory: other, scope: "test-scope", cloud: cloud)
    let request = UUID().uuidString
    let reset = try await deleting.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    #expect(reset.resetGeneration == request)
    await #expect(throws: ProgressCloudError.conflict) {
      try await stale.publish(scope: "test-scope", revision: 2, json: "{\"version\":4}", base: initial.token)
    }
    await #expect(throws: ProgressCloudError.conflict) {
      try await stale.publish(scope: "test-scope", revision: 2, json: "{\"version\":4}", base: reset.token)
    }
    #expect(cloud.records[ProgressTransport.sharedHead]?.current?.id == reset.id)
  }

  @Test(arguments: [false, true])
  func lostReplyAndConcurrentResetAdoptLaterLearning(concurrent: Bool) async throws {
    let root = directory(), other = directory()
    defer { for url in [root, other] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud(), first = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let second = try ProgressTransport(directory: other, scope: "test-scope", cloud: cloud)
    let request = UUID().uuidString
    cloud.savedResponse = { record in
      if record.kind == "ProgressBackupHead" { var lost = record; lost.current = nil; return lost }
      return record
    }
    await #expect(throws: ProgressCloudError.conflict) {
      try await first.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    }
    cloud.savedResponse = nil
    let base = try #require(try await second.list(scope: "test-scope").first?.token)
    let learnedJSON = resetEnvelope(request, preferences: "[{\"key\":\"settings\",\"value\":\"{\\\"mode\\\":\\\"manual\\\",\\\"rate\\\":1}\"}]")
    let learned = try await second.publish(scope: "test-scope", revision: 3, json: learnedJSON, base: base)
    let replay = concurrent ? second : try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let retryID = concurrent ? UUID().uuidString : request
    let result = try await replay.reset(scope: "test-scope", requestId: retryID, expectedGeneration: "", json: resetEnvelope(retryID))
    #expect(result.id == learned.id)
    #expect(result.resetGeneration == request)
    #expect(try await replay.read(scope: "test-scope", id: result.id) == learnedJSON)
    #expect(!result.cleanupPending)
    #expect(cloud.assets.count == 1)
  }

  @Test func resetPersistsBeforeOfflineFetchAndCleanupSurvivesReopen() async throws {
    let root = directory()
    defer { try? FileManager.default.removeItem(at: root) }
    let cloud = TestCloud(), first = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let initial = try await first.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    let request = UUID().uuidString
    cloud.failFetch = true
    await #expect(throws: ProgressCloudError.offline) {
      try await first.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    }
    let reopened = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    #expect(reopened.store.state.resetIntent?.requestId == request)
    cloud.failFetch = false; cloud.deletionFailure = .offline
    let pending = try await reopened.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    #expect(pending.cleanupPending)
    #expect(cloud.assets[initial.id] != nil)
    cloud.deletionFailure = nil
    let retry = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let result = try await retry.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    #expect(result.id == pending.id && !result.cleanupPending)
    #expect(cloud.assets[initial.id] == nil)
  }

  @Test func competingResetWinsConditionalHeadWithoutReerase() async throws {
    let a = directory(), b = directory()
    defer { for url in [a, b] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud(), first = try ProgressTransport(directory: a, scope: "test-scope", cloud: cloud)
    let second = try ProgressTransport(directory: b, scope: "test-scope", cloud: cloud)
    let loser = UUID().uuidString, winner = UUID().uuidString
    var winning: CloudPublication?
    cloud.onSave = { record in
      guard record.kind == "ProgressBackupHead" else { return }
      cloud.onSave = nil
      winning = try? await second.reset(scope: "test-scope", requestId: winner, expectedGeneration: "", json: resetEnvelope(winner))
    }
    await #expect(throws: ProgressCloudError.conflict) {
      try await first.reset(scope: "test-scope", requestId: loser, expectedGeneration: "", json: resetEnvelope(loser))
    }
    let replay = try await first.reset(scope: "test-scope", requestId: loser, expectedGeneration: "", json: resetEnvelope(loser))
    #expect(replay.id == winning?.id && replay.resetGeneration == winner)
    #expect(cloud.assets.count == 1)
  }

  @Test func resetRejectsNonemptyOrMalformedDeletionEnvelope() async throws {
    let root = directory()
    defer { try? FileManager.default.removeItem(at: root) }
    let cloud = TestCloud(), transport = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let request = UUID().uuidString
    for json in ["{}", resetEnvelope(UUID().uuidString), resetEnvelope(request, preferences: "[{}]"),
      resetEnvelope(request).replacingOccurrences(of: "\"clocks\":{}", with: "\"clocks\":{\"x\":\"y\"}")] {
      await #expect(throws: ProgressCloudError.corrupt) {
        try await transport.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: json)
      }
    }
    #expect(cloud.records.isEmpty)
  }

  @Test func headAssetEnvelopeGenerationMismatchIsRejected() async throws {
    let root = directory(), other = directory()
    defer { for url in [root, other] { try? FileManager.default.removeItem(at: url) } }
    let cloud = TestCloud(), writer = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    let request = UUID().uuidString
    let reset = try await writer.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    let changed = Data(resetEnvelope(UUID().uuidString).utf8)
    cloud.assets[reset.id] = changed
    cloud.records[reset.id]?.hash = ProgressStore.hash(changed)
    cloud.records[reset.id]?.bytes = changed.count
    cloud.records[ProgressTransport.sharedHead]?.current = BackupReference(id: reset.id, hash: ProgressStore.hash(changed))
    let reader = try ProgressTransport(directory: other, scope: "test-scope", cloud: cloud)
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.list(scope: "test-scope") }
  }

  @Test func observedResetRejectsLegacyHeadRollbackAfterReopen() async throws {
    let root = directory()
    defer { try? FileManager.default.removeItem(at: root) }
    let cloud = TestCloud(), writer = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    _ = try await writer.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    let legacyRecords = cloud.records, legacyAssets = cloud.assets
    let request = UUID().uuidString
    _ = try await writer.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    cloud.records = legacyRecords; cloud.assets = legacyAssets
    let reader = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    await #expect(throws: ProgressCloudError.corrupt) { try await reader.list(scope: "test-scope") }
  }
  @Test func ordinaryPublicationCannotIntroduceResetGeneration() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let cloud = TestCloud()
    let transport = try ProgressTransport(directory: root, scope: "test-scope", cloud: cloud)
    await #expect(throws: ProgressCloudError.conflict) {
      try await transport.publish(scope: "test-scope", revision: 0,
        json: resetEnvelope(UUID().uuidString), base: "")
    }
    #expect(cloud.records.isEmpty)
  }

  private func directory() -> URL { FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString) }
}

func resetEnvelope(_ generation: String, preferences: String = "[]") -> String {
  """
  {"version":5,"generation":"\(generation)","progress":{"version":4,"tables":{"checkpoints":[],"completions":[],"daily_stages":[],"stage_awards":[],"study_days":[],"preferences":\(preferences),"cycle_credits":[],"unit_credits":[]},"sync":{"clocks":{},"runs":[]}}}
  """
}
