import ExpoModulesCore
import Foundation
import BackgroundAssets

public final class PackageDeliveryModule: Module {
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
    Name("PackageDelivery")
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
      else { "failed" }
    return NSError(domain: "PackageDelivery", code: 1, userInfo: [NSLocalizedDescriptionKey: "package-delivery-\(code)"])
  }
}
