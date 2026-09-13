import ExpoModulesCore
import Foundation

public final class PackageDeliveryModule: Module {
  private static let sharedDownload: PackageDownload = {
    let info = Bundle.main.infoDictionary ?? [:]
    let packID = info["SampleAssetPackID"] as? String
    let group = info["BAAppGroupID"] as? String
    let transport: AppleAssetDelivery? = if let packID, !packID.isEmpty, let group, !group.isEmpty {
      AppleAssetDelivery(assetPackID: packID)
    } else { nil }
    return PackageDownload(installation: PackageInstallation(root: URL.documentsDirectory.appendingPathComponent("lesson-packages")), transport: transport)
  }()

  public func definition() -> ModuleDefinition {
    let download = Self.sharedDownload
    Name("PackageDelivery")
    AsyncFunction("status") { (json: String) async throws -> [String: Any] in
      do {
        let package = try JSONDecoder().decode(DeliveryPackage.self, from: Data(json.utf8))
        let value = try await download.status(package)
        return ["phase": value.phase, "progress": value.progress]
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("start") { (json: String) async throws in
      do {
        let package = try JSONDecoder().decode(DeliveryPackage.self, from: Data(json.utf8))
        try await download.start(package)
      } catch { throw Self.sanitize(error) }
    }
    AsyncFunction("cancel") { () async in await download.cancel() }
  }

  private static func sanitize(_ error: Error) -> NSError {
    let code = if error is CancellationError { "cancelled" }
      else if let known = error as? DeliveryError { known.rawValue }
      else { "failed" }
    return NSError(domain: "PackageDelivery", code: 1, userInfo: [NSLocalizedDescriptionKey: "package-delivery-\(code)"])
  }
}
