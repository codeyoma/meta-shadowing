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
