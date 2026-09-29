import CryptoKit
import Foundation

extension PackageInstallation {
  /// This small fingerprint outlives material removal: checkpoints still refer
  /// to this immutable identity even when the downloaded files are absent.
  func checkIdentity(_ package: DeliveryPackage) throws {
    let url = identityURL(package)
    let attributes: [FileAttributeKey: Any]
    do { attributes = try FileManager.default.attributesOfItem(atPath: url.path) }
    catch let error as CocoaError where error.code == .fileReadNoSuchFile { return }
    guard attributes[.type] as? FileAttributeType == .typeRegular,
      (attributes[.size] as? NSNumber)?.intValue == 64 else { throw DeliveryError.incompatibleVersion }
    guard try Data(contentsOf: url) == identityData(package) else { throw DeliveryError.incompatibleVersion }
  }

  func pinIdentity(_ package: DeliveryPackage) throws {
    try checkIdentity(package)
    let url = identityURL(package)
    if !FileManager.default.fileExists(atPath: url.path) {
      try identityData(package).write(to: url, options: .atomic)
    }
  }

  private func identityURL(_ package: DeliveryPackage) -> URL {
    root.appendingPathComponent(".identity-\(package.key)")
  }

  private func identityData(_ package: DeliveryPackage) throws -> Data {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys]
    let canonical = DeliveryPackage(key: package.key, files: package.files.sorted { $0.file < $1.file })
    let hash = SHA256.hash(data: try encoder.encode(canonical)).map { String(format: "%02x", $0) }.joined()
    return Data(hash.utf8)
  }
}
