import CloudKit
import Foundation

@MainActor
final class ProgressCloudOwner {
  private var transport: ProgressTransport?
  private var epoch = UUID()
  private var observer: NSObjectProtocol?
  private var destroyed = false
  nonisolated init() {}
  func observe(_ changed: @escaping @Sendable () -> Void) {
    guard !destroyed, observer == nil else { return }
    observer = NotificationCenter.default.addObserver(forName: .CKAccountChanged, object: nil, queue: .main) { [weak self] _ in
      Task { @MainActor in
        guard let self else { return }
        await self.stop()
        changed()
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
    guard let configuration = Self.configuration() else { throw ProgressCloudError.unavailable }
    let container = CKContainer(identifier: configuration.container)
    let current = try await Self.identity(container, configuration)
    guard current == scope, ticket == epoch else { throw ProgressCloudError.accountChanged }
    if let transport, transport.scope == scope { return transport }
    if let transport {
      await transport.stop()
      guard ticket == epoch else { throw ProgressCloudError.accountChanged }
      let confirmed = try await Self.identity(container, configuration)
      guard confirmed == scope, ticket == epoch else { throw ProgressCloudError.accountChanged }
    }
    let cloud = CloudKitService(container: container, scope: scope) {
      try await Self.identity(container, configuration)
    }
    let root = try FileManager.default.url(for: .applicationSupportDirectory,
      in: .userDomainMask, appropriateFor: nil, create: true)
      .appendingPathComponent("ProgressCloud", isDirectory: true)
      .appendingPathComponent(ProgressStore.hash(Data(scope.utf8)), isDirectory: true)
    let next = try ProgressTransport(directory: root, scope: scope, cloud: cloud)
    transport = next
    return next
  }
  func stop() async {
    epoch = UUID()
    let old = transport
    transport = nil
    await old?.stop()
  }
  struct Configuration: Sendable { let container: String; let environment: String }
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
