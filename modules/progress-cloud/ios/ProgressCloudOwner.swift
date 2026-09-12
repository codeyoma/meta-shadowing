import CloudKit
import Foundation

@MainActor
final class ProgressCloudOwner {
  private var transport: ProgressTransport?
  private var epoch = UUID()
  private var observer: NSObjectProtocol?
  private var destroyed = false
  struct ActivationAccess: Sendable {
    let identity: @MainActor @Sendable () async throws -> String
    let makeTransport: @MainActor @Sendable (String) throws -> ProgressTransport
  }
  private let activationAccess: @MainActor @Sendable () throws -> ActivationAccess
  nonisolated init(activationAccess: @escaping @MainActor @Sendable () throws -> ActivationAccess = {
    try ProgressCloudOwner.nativeActivationAccess()
  }) {
    self.activationAccess = activationAccess
  }
  func observe(_ changed: @escaping @MainActor @Sendable () -> Void) {
    guard !destroyed, observer == nil else { return }
    observer = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { [weak self] _ in
      Task { @MainActor in
        guard let self else { return }
        let cancel = self.suspend()
        changed()
        await cancel()
      }
    }
  }
  func destroy() async {
    destroyed = true
    if let observer { NotificationCenter.default.removeObserver(observer) }
    observer = nil
    await stop()
  }

  func account() async -> [String: String] {
    guard !destroyed else { return ["status": "unavailable"] }
    guard let configuration = Self.configuration() else { return ["status": "unavailable"] }
    let ticket = epoch
    do {
      let container = CKContainer(identifier: configuration.container)
      let status = try await container.accountStatus()
      guard ticket == epoch else { return ["status": "unknown"] }
      guard status == .available else {
        if status == .noAccount { await stop(); return ["status": "no-account"] }
        return ["status": status == .restricted ? "unavailable" : "unknown"]
      }
      let scope = try await Self.identity(container, configuration)
      guard ticket == epoch else { return ["status": "unknown"] }
      if let transport, transport.scope != scope {
        await stop()
        let stoppedTicket = epoch
        let confirmed = try await Self.identity(container, configuration)
        guard confirmed == scope, stoppedTicket == epoch else { return ["status": "unknown"] }
      }
      // Query only. No sync engine, filesystem profile, zone, or upload is created.
      return ["status": "available", "scope": scope]
    } catch { return ["status": "unknown"] }
  }
  func active(_ scope: String) async throws -> ProgressTransport {
    guard !destroyed else { throw ProgressCloudError.unavailable }
    let ticket = epoch
    let access = try activationAccess()
    let current = try await access.identity()
    guard current == scope, ticket == epoch else { throw ProgressCloudError.accountChanged }
    if let transport, transport.scope == scope { return transport }
    while let previous = transport, previous.scope != scope {
      await previous.stop()
      guard ticket == epoch else { throw ProgressCloudError.accountChanged }
      let confirmed = try await access.identity()
      guard confirmed == scope, ticket == epoch else { throw ProgressCloudError.accountChanged }
      // An overlapping activation can install this scope during either await.
      // Retire only the instance we stopped, then reconsider the current owner.
      if transport === previous { transport = nil }
    }
    if let transport { return transport }
    let next = try access.makeTransport(scope)
    transport = next
    return next
  }
  private func suspend() -> CloudCancellation {
    epoch = UUID()
    let old = transport
    transport = nil
    // Invalidate all native delivery synchronously before notifying JS consumers.
    // Only the already-captured external operation cancellation may suspend later.
    if let old { return old.suspend() }
    return {}
  }
  func stop() async {
    let cancel = suspend()
    await cancel()
  }
  struct Configuration: Sendable { let container: String; let environment: String }
  private static func nativeActivationAccess() throws -> ActivationAccess {
    guard let configuration = configuration() else { throw ProgressCloudError.unavailable }
    let container = CKContainer(identifier: configuration.container)
    return ActivationAccess(identity: { try await identity(container, configuration) }, makeTransport: { scope in
      let cloud = CloudKitService(container: container, scope: scope) { try await identity(container, configuration) }
      let root = try FileManager.default.url(for: .applicationSupportDirectory,
        in: .userDomainMask, appropriateFor: nil, create: true)
        .appendingPathComponent("ProgressCloud", isDirectory: true)
        .appendingPathComponent(ProgressStore.hash(Data(scope.utf8)), isDirectory: true)
      return try ProgressTransport(directory: root, scope: scope, cloud: cloud)
    })
  }
  static func configuration(bundle: Bundle = .main) -> Configuration? {
    #if targetEnvironment(simulator)
    // Controlled tests use the cloud seam. Identity requires an owner-signed device.
    return nil
    #else
    guard bundle.object(forInfoDictionaryKey: "ProgressCloudConfigured") as? Bool == true,
          let container = bundle.object(forInfoDictionaryKey: "ProgressCloudContainer") as? String,
          container.range(of: #"^iCloud\.[A-Za-z0-9][A-Za-z0-9-]*(?:\.[A-Za-z0-9][A-Za-z0-9-]*)+$"#, options: .regularExpression) != nil,
          let environment = bundle.object(forInfoDictionaryKey: "ProgressCloudEnvironment") as? String,
          ["Development", "Production"].contains(environment) else { return nil }
    return Configuration(container: container, environment: environment)
    #endif
  }
  private static func identity(_ container: CKContainer, _ configuration: Configuration) async throws -> String {
    guard try await container.accountStatus() == .available else { throw ProgressCloudError.accountChanged }
    let user = try await container.userRecordID()
    return ProgressStore.hash(Data((configuration.container + "\n" + configuration.environment + "\n" + user.recordName).utf8))
  }
}
