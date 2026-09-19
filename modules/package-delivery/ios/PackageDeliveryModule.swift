import ExpoModulesCore
import Foundation
import BackgroundAssets
import PackageStore

public final class PackageDeliveryModule: Module {
  private let accessObserver = PaidAccessObserver()
  private static let paidDownload = PackageDownload(installation: installation,
    transport: paidAssetID().map { AppleAssetDelivery(assetPackID: $0) }, purgeCache: {
      guard let id = paidAssetID() else { throw DeliveryError.unavailable }
      try await AssetPackManager.shared.remove(assetPackWithID: id)
    })

  private static func paidAssetID() -> String? {
    let info = Bundle.main.infoDictionary ?? [:]
    guard let id = info["PaidDuoAssetPackID"] as? String,
      id.range(of: "^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$", options: .regularExpression) != nil,
      ![LibraryMaterial.freeDuo, "delivery-diagnostic-v1", info["SampleAssetPackID"] as? String ?? ""].contains(id),
      let group = info["BAAppGroupID"] as? String, !group.isEmpty else { return nil }
    return id
  }
  private static func paidDescriptor() throws -> DeliveryPackage {
    guard paidAssetID() != nil,
      let json = Bundle.main.object(forInfoDictionaryKey: "PaidDuoDescriptor") as? String,
      let package = try? JSONDecoder().decode(DeliveryPackage.self, from: Data(json.utf8)),
      package.key == LibraryMaterial.paidDuo else { throw DeliveryError.unavailable }
    return package
  }
  private static func paidCoordinator() async -> PaidPackageDownload {
    let lease = await PackageAccess.shared.lease
    return PaidPackageDownload(download: paidDownload,
      authorize: {
        let snapshot = await PackageAccess.shared.refresh()
        return (snapshot.revision, snapshot.allowed)
      }, publish: { revision, operation in try lease.withAuthorization(revision: revision, operation) })
  }
  private static let diagnostics: DeliveryDiagnostics? = {
    let info = Bundle.main.infoDictionary ?? [:]
    guard info["DeliveryDiagnosticsEnabled"] as? Bool == true,
      info["DiagnosticAssetPackID"] as? String == "delivery-diagnostic-v1",
      let group = info["BAAppGroupID"] as? String, !group.isEmpty,
      let json = info["DiagnosticDescriptor"] as? String,
      let package = try? JSONDecoder().decode(DeliveryPackage.self, from: Data(json.utf8)) else { return nil }
    // No caller-supplied path or pack ID can reach destructive diagnostics.
    return DeliveryDiagnostics(enabled: true,
      root: URL.documentsDirectory.appendingPathComponent("delivery-diagnostics"), package: package,
      transport: AppleAssetDelivery(assetPackID: "delivery-diagnostic-v1"),
      cacheAvailable: {
        if #available(iOS 26.4, *) {
          let state = await AssetPackManager.shared.localStatus(ofAssetPackWithID: "delivery-diagnostic-v1")
          return state.contains(.downloaded) || state.contains(.downloading)
        }
        return true // Older OS cannot prove this trial; never report a cancellation pass.
      },
      purgeCache: {
        try await AssetPackManager.shared.remove(assetPackWithID: "delivery-diagnostic-v1")
      })
  }()

  private static let sharedDownload: PackageDownload = {
    let info = Bundle.main.infoDictionary ?? [:]
    let packID = info["SampleAssetPackID"] as? String
    let group = info["BAAppGroupID"] as? String
    let transport: AppleAssetDelivery? = if let packID, !packID.isEmpty,
      packID != "delivery-diagnostic-v1", let group, !group.isEmpty {
      AppleAssetDelivery(assetPackID: packID)
    } else { nil }
    return PackageDownload(installation: PackageDeliveryModule.installation, transport: transport, purgeCache: {
      guard let packID, !packID.isEmpty, packID != "delivery-diagnostic-v1",
        let group, !group.isEmpty else { throw DeliveryError.unavailable }
      try await AssetPackManager.shared.remove(assetPackWithID: packID)
    })
  }()

  private static let installation = PackageInstallation(root: URL.documentsDirectory.appendingPathComponent("lesson-packages"))

  private static let freeDuoDownload = PackageDownload(installation: installation,
    transport: AppleAssetDelivery(assetPackID: LibraryMaterial.freeDuo), purgeCache: {
      try await AssetPackManager.shared.remove(assetPackWithID: LibraryMaterial.freeDuo)
    })

  private static func freeDuoDescriptor() throws -> DeliveryPackage {
    let info = Bundle.main.infoDictionary ?? [:]
    guard FreeDuoPolicy.current,
      info["FreeDuoAssetPackID"] as? String == LibraryMaterial.freeDuo,
      let group = info["BAAppGroupID"] as? String, !group.isEmpty,
      let json = info["FreeDuoDescriptor"] as? String,
      let package = try? JSONDecoder().decode(DeliveryPackage.self, from: Data(json.utf8)),
      package.key == LibraryMaterial.freeDuo else { throw DeliveryError.unavailable }
    return package
  }

  private static func sampleDescriptor(_ json: String) throws -> DeliveryPackage {
    let package = try JSONDecoder().decode(DeliveryPackage.self, from: Data(json.utf8))
    guard package.key == LibraryMaterial.hosted,
      let pinned = Bundle.main.infoDictionary?["SampleDescriptor"] as? String,
      package == (try JSONDecoder().decode(DeliveryPackage.self, from: Data(pinned.utf8)))
    else { throw DeliveryError.invalidPackage }
    return package
  }

  public func definition() -> ModuleDefinition {
    let download = Self.sharedDownload
    let accessObserver = accessObserver
    // Expo's event emitter crosses to JavaScriptActor internally. Only this weak
    // identity crosses isolation; all observer lifetime state belongs to its actor.
    nonisolated(unsafe) weak let emitter = self
    Name("PackageDelivery")
    Events("onPaidDuoAccess")
    OnCreate { Task { @MainActor in
      accessObserver.start { snapshot in
        emitter?.sendEvent("onPaidDuoAccess", ["revision": snapshot.revision, "allowed": snapshot.allowed])
        if !snapshot.allowed { Task { await Self.paidDownload.cancel() } }
      }
    } }
    OnDestroy { Task { @MainActor in accessObserver.stop() } }
    Constant("paidDuoManifest") { () -> String? in
      guard (try? Self.paidDescriptor()) != nil else { return nil }
      return Bundle.main.object(forInfoDictionaryKey: "PaidDuoManifest") as? String
    }
    AsyncFunction("paidDuoAccess") { () async -> [String: Any] in
      let value = await PackageAccess.shared.refresh()
      return ["revision": value.revision, "allowed": value.allowed]
    }
    AsyncFunction("paidDuoStatus") { () async throws -> [String: Any] in
      do {
        let value = try await Self.paidCoordinator().status(Self.paidDescriptor())
        return ["phase": value.phase, "progress": value.progress]
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("paidDuoStart") { () async throws in
      do { try await Self.paidCoordinator().start(Self.paidDescriptor()) }
      catch { throw Self.sanitize(error) }
    }
    AsyncFunction("paidDuoCancel") { () async in await Self.paidDownload.cancel() }
    AsyncFunction("paidDuoStorage") { () async throws -> [String: Any] in
      do {
        let value = try await Self.paidDownload.storage(Self.paidDescriptor())
        return ["bytes": value.bytes, "installed": value.installed, "busy": value.busy]
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("paidDuoRemove") { () async throws -> [String: Bool] in
      do { return ["cacheCleared": try await Self.paidDownload.remove(Self.paidDescriptor())] }
      catch { throw Self.sanitize(error) }
    }
    Constant("freeDuoManifest") { () -> String? in
      guard (try? Self.freeDuoDescriptor()) != nil else { return nil }
      return Bundle.main.object(forInfoDictionaryKey: "FreeDuoManifest") as? String
    }
    AsyncFunction("freeDuoStatus") { () async throws -> [String: Any] in
      do {
        let value = try await Self.freeDuoDownload.status(Self.freeDuoDescriptor())
        return ["phase": value.phase, "progress": value.progress]
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("freeDuoStart") { () async throws in
      do { try await Self.freeDuoDownload.start(Self.freeDuoDescriptor()) }
      catch { throw Self.sanitize(error) }
    }
    AsyncFunction("freeDuoCancel") { () async throws in
      do { _ = try Self.freeDuoDescriptor(); await Self.freeDuoDownload.cancel() }
      catch { throw Self.sanitize(error) }
    }
    AsyncFunction("freeDuoStorage") { () async throws -> [String: Any] in
      do {
        let value = try await Self.freeDuoDownload.storage(Self.freeDuoDescriptor())
        return ["bytes": value.bytes, "installed": value.installed, "busy": value.busy]
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("freeDuoRemove") { () async throws -> [String: Bool] in
      do { return ["cacheCleared": try await Self.freeDuoDownload.remove(Self.freeDuoDescriptor())] }
      catch { throw Self.sanitize(error) }
    }
    Constant("animationPreviewEnabled") {
      #if DEBUG || targetEnvironment(simulator)
      return true
      #else
      return false
      #endif
    }
    Constant("diagnosticsEnabled") { Self.diagnostics != nil }
    AsyncFunction("diagnosticStatus") { () async throws -> [String: Any] in
      do {
        guard let diagnostics = Self.diagnostics else { throw DeliveryError.unavailable }
        let value = try await diagnostics.status()
        return ["phase": value.phase, "progress": value.progress, "outcome": value.outcome, "observedProgress": value.observedProgress]
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("diagnosticStart") { (autoCancel: Bool) async throws in
      do {
        guard let diagnostics = Self.diagnostics else { throw DeliveryError.unavailable }
        try await diagnostics.start(autoCancel: autoCancel)
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("diagnosticCancel") { () async throws in
      do {
        guard let diagnostics = Self.diagnostics else { throw DeliveryError.unavailable }
        try await diagnostics.cancel()
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("diagnosticDamage") { (fault: String) async throws in
      do {
        guard let diagnostics = Self.diagnostics else { throw DeliveryError.unavailable }
        try await diagnostics.damage(fault)
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("diagnosticReset") { () async throws in
      do {
        guard let diagnostics = Self.diagnostics else { throw DeliveryError.unavailable }
        try await diagnostics.reset()
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("status") { (json: String) async throws -> [String: Any] in
      do {
        let package = try Self.sampleDescriptor(json)
        let value = try await download.status(package)
        return ["phase": value.phase, "progress": value.progress]
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("start") { (json: String) async throws in
      do {
        let package = try Self.sampleDescriptor(json)
        try await download.start(package)
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("cancel") { () async in await download.cancel() }
    AsyncFunction("storage") { (json: String) async throws -> [String: Any] in
      do {
        let value = try await download.storage(Self.sampleDescriptor(json))
        return ["bytes": value.bytes, "installed": value.installed, "busy": value.busy]
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("removeMaterials") { (json: String) async throws -> [String: Bool] in
      do { return ["cacheCleared": try await download.remove(Self.sampleDescriptor(json))] }
      catch { throw Self.sanitize(error) }
    }
    // Bundled operations share the JS install/verification lock. These functions
    // accept no descriptor or path, and cannot reach diagnostic storage.
    AsyncFunction("bundledBytes") { () throws -> Int in
      do { return try Self.installation.materialBytes(LibraryMaterial.bundled) }
      catch { throw Self.sanitize(error) }
    }
    AsyncFunction("removeBundledMaterials") { () throws in
      do { try Self.installation.removeMaterials(LibraryMaterial.bundled) }
      catch { throw Self.sanitize(error) }
    }
  }

  private static func sanitize(_ error: Error) -> NSError {
    let code = if error is CancellationError { "cancelled" }
      else if let known = error as? DeliveryError { known.rawValue }
      else if (error as? CocoaError)?.code == .fileWriteOutOfSpace { "storageFull" }
      else if (error as? CocoaError)?.code == .fileWriteNoPermission { "writeDenied" }
      else { "failed" }
    return NSError(domain: "PackageDelivery", code: 1, userInfo: [NSLocalizedDescriptionKey: "package-delivery-\(code)"])
  }
}

@MainActor private final class PaidAccessObserver {
  private var subscription: UUID?
  private var destroyed = false
  nonisolated init() {}
  func start(_ changed: @escaping @MainActor (PackageAccessSnapshot) -> Void) {
    guard !destroyed, subscription == nil else { return }
    subscription = PackageAccess.shared.subscribe(changed)
  }
  func stop() {
    destroyed = true
    if let subscription { PackageAccess.shared.unsubscribe(subscription) }
    subscription = nil
  }
}
