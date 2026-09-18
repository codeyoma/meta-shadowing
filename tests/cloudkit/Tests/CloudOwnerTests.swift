import Foundation
import CloudKit
import Testing

@MainActor
final class TestGate {
  private(set) var isOpen = false
  private var waiters: [CheckedContinuation<Void, Never>] = []
  func wait() async {
    if isOpen { return }
    await withCheckedContinuation { waiters.append($0) }
  }
  func open() {
    isOpen = true
    let pending = waiters; waiters.removeAll()
    for waiter in pending { waiter.resume() }
  }
}

@MainActor
struct CloudOwnerTests {
  @Test func offlineDiscardRetiresOnlySelectedCacheAndLateStoreCallbacks() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let cloud = TestCloud()
    let local: @MainActor @Sendable (String) throws -> URL = { root.appendingPathComponent(ProgressStore.hash(Data($0.utf8))) }
    let other = try ProgressStore(directory: local("other-scope"))
    try other.update { $0.engine = Data("preserved".utf8) }
    let owner = ProgressCloudOwner(cacheDirectory: local) {
      .init(identity: { "test-scope" }, makeTransport: { try ProgressTransport(directory: local($0), scope: $0, cloud: cloud) })
    }
    let active = try await owner.active("test-scope")
    let initial = try await active.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    let bytes = try active.store.asset(try #require(active.store.state.records[initial.id]))
    let record = try #require(active.store.state.records[initial.id])
    let earlierInstance = try ProgressStore(directory: local("test-scope"))
    cloud.failFetch = true; cloud.account = "offline-account"
    try await owner.discardLocal("test-scope")
    #expect(throws: ProgressCloudError.accountChanged) { try active.store.receive(record, asset: bytes) }
    #expect(throws: ProgressCloudError.accountChanged) { try earlierInstance.receive(record, asset: bytes) }
    #expect(throws: ProgressCloudError.accountChanged) { try active.store.update { $0.engine = Data() } }
    #expect(!FileManager.default.fileExists(atPath: active.store.assetURL(initial.id).path))
    #expect(try ProgressStore(directory: local("test-scope")).state.records.isEmpty)
    #expect(try ProgressStore(directory: local("other-scope")).state.engine == Data("preserved".utf8))
    #expect(cloud.assets[initial.id] != nil)
    await owner.destroy()
  }

  @Test func discardingOtherScopeDoesNotInvalidateCurrentTransport() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let cloud = TestCloud()
    let local: @MainActor @Sendable (String) throws -> URL = { root.appendingPathComponent(ProgressStore.hash(Data($0.utf8))) }
    let owner = ProgressCloudOwner(cacheDirectory: local) {
      .init(identity: { "test-scope" }, makeTransport: { try ProgressTransport(directory: local($0), scope: $0, cloud: cloud) })
    }
    let active = try await owner.active("test-scope")
    try await owner.discardLocal("other-scope")
    #expect(try await owner.active("test-scope") === active)
    #expect(try await active.publish(scope: "test-scope", revision: 1, json: "{}") == 1)
    await owner.destroy()
  }

  @Test func localDiscardFailureRemainsRetryableAndPreservesResetIntent() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let cloud = TestCloud()
    let local: @MainActor @Sendable (String) throws -> URL = { root.appendingPathComponent(ProgressStore.hash(Data($0.utf8))) }
    let owner = ProgressCloudOwner(cacheDirectory: local) {
      .init(identity: { "test-scope" }, makeTransport: { try ProgressTransport(directory: local($0), scope: $0, cloud: cloud) })
    }
    let active = try await owner.active("test-scope"), request = UUID().uuidString
    cloud.failFetch = true
    await #expect(throws: ProgressCloudError.offline) {
      try await active.reset(scope: "test-scope", requestId: request, expectedGeneration: "", json: resetEnvelope(request))
    }
    let target = try local("test-scope")
    try FileManager.default.setAttributes([.posixPermissions: 0o500], ofItemAtPath: target.path)
    await #expect(throws: ProgressCloudError.storage) { try await owner.discardLocal("test-scope") }
    try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: target.path)
    try await owner.discardLocal("test-scope")
    let reopened = try ProgressStore(directory: target)
    #expect(reopened.state.resetIntent?.requestId == request)
    #expect(reopened.state.pending == nil && reopened.state.records.isEmpty)
    await owner.destroy()
  }

  @Test(.timeLimit(.minutes(1)))
  func discardFinishesBeforeNetworkCancellationAndRejectsLateFetch() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let cloud = TestCloud(), entered = TestGate(), release = TestGate()
    cloud.onStop = { await release.wait() }
    let local: @MainActor @Sendable (String) throws -> URL = { root.appendingPathComponent(ProgressStore.hash(Data($0.utf8))) }
    let owner = ProgressCloudOwner(cacheDirectory: local) {
      .init(identity: { "test-scope" }, makeTransport: { try ProgressTransport(directory: local($0), scope: $0, cloud: cloud) })
    }
    let active = try await owner.active("test-scope")
    _ = try await active.publish(scope: "test-scope", revision: 1, json: "{}", base: "")
    cloud.onFetch = { entered.open(); await release.wait() }
    let fetching = Task { try await active.list(scope: "test-scope") }
    await entered.wait()
    try await owner.discardLocal("test-scope")
    #expect(try ProgressStore(directory: local("test-scope")).state.records.isEmpty)
    release.open()
    await #expect(throws: ProgressCloudError.accountChanged) { try await fetching.value }
    await owner.destroy()
  }
  @Test(.timeLimit(.minutes(1)))
  func accountChangeIsDeliveredBeforeExternalCancellationCompletes() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let cancellationEntered = TestGate(), releaseCancellation = TestGate(), observed = TestGate()
    let publicationEntered = TestGate(), releasePublication = TestGate()
    let cloud = TestCloud()
    cloud.onStop = { cancellationEntered.open(); await releaseCancellation.wait() }
    cloud.onSave = { _ in publicationEntered.open(); await releasePublication.wait() }
    let owner = ProgressCloudOwner {
      .init(identity: { "test-scope" }, makeTransport: { scope in
        try ProgressTransport(directory: root, scope: scope, cloud: cloud)
      })
    }
    let transport = try await owner.active("test-scope")
    let publication = Task { try await transport.publish(scope: "test-scope", revision: 1, json: "{}") }
    await publicationEntered.wait()
    owner.observe { observed.open() }
    NotificationCenter.default.post(name: .CKAccountChanged, object: nil)
    await cancellationEntered.wait()
    #expect(observed.isOpen)
    releasePublication.open()
    await #expect(throws: ProgressCloudError.accountChanged) { try await publication.value }
    #expect(cloud.records.values.allSatisfy { $0.kind != "ProgressBackupHead" })
    releaseCancellation.open()
    await observed.wait()
    await owner.destroy()
  }
  @Test(.timeLimit(.minutes(1)))
  func overlappingAccountActivationSharesTransportDuringPublication() async throws {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    defer { try? FileManager.default.removeItem(at: root) }
    let harness = ActivationHarness(root: root)
    let owner = ProgressCloudOwner { harness.access }
    _ = try await owner.active("account-A")
    harness.account = "account-B"
    let first = Task { try await owner.active("account-B") }
    await harness.firstConfirmationEntered.wait()
    let second = Task { try await owner.active("account-B") }
    await harness.secondConfirmationEntered.wait()
    harness.releaseFirstConfirmation.open()
    let firstTransport = try await first.value
    let publication = Task { try await firstTransport.publish(scope: "account-B", revision: 1, json: "{}") }
    await harness.publicationEntered.wait()
    harness.releaseSecondConfirmation.open()
    let secondTransport = try await second.value
    #expect(firstTransport === secondTransport)
    #expect(harness.constructedScopes == ["account-A", "account-B"])
    #expect(secondTransport.pendingRevision == 1)
    await #expect(throws: ProgressCloudError.busy) { try await secondTransport.list(scope: "account-B") }
    harness.releasePublication.open()
    #expect(try await publication.value == 1)
    await owner.destroy()
  }
}

@MainActor
private final class ActivationHarness {
  let root: URL
  var account = "account-A"
  var newAccountLookups = 0
  var constructedScopes: [String] = []
  let firstConfirmationEntered = TestGate(), secondConfirmationEntered = TestGate()
  let releaseFirstConfirmation = TestGate(), releaseSecondConfirmation = TestGate()
  let publicationEntered = TestGate(), releasePublication = TestGate()
  init(root: URL) { self.root = root }
  var access: ProgressCloudOwner.ActivationAccess {
    .init(identity: { try await self.identity() }, makeTransport: { try self.makeTransport($0) })
  }
  private func identity() async throws -> String {
    if account == "account-B" {
      newAccountLookups += 1
      if newAccountLookups == 2 {
        firstConfirmationEntered.open(); await releaseFirstConfirmation.wait()
      } else if newAccountLookups == 4 {
        secondConfirmationEntered.open(); await releaseSecondConfirmation.wait()
      }
    }
    return account
  }
  private func makeTransport(_ scope: String) throws -> ProgressTransport {
    constructedScopes.append(scope)
    let cloud = TestCloud(); cloud.account = scope
    if scope == "account-B" {
      cloud.onSave = { _ in
        self.publicationEntered.open()
        await self.releasePublication.wait()
      }
    }
    return try ProgressTransport(directory: root.appendingPathComponent(scope), scope: scope, cloud: cloud)
  }
}
