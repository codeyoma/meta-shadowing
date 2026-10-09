import CryptoKit
import Foundation

extension PackageInstallation {
  func hasPinnedIdentity(_ package: DeliveryPackage) throws -> Bool {
    try checkIdentity(package)
  }

  /// This small fingerprint outlives material removal: checkpoints still refer
  /// to this immutable identity even when the downloaded files are absent.
  @discardableResult
  func checkIdentity(_ package: DeliveryPackage) throws -> Bool {
    let url = identityURL(package)
    let attributes: [FileAttributeKey: Any]
    do { attributes = try FileManager.default.attributesOfItem(atPath: url.path) }
    catch let error as CocoaError where error.code == .fileReadNoSuchFile { return false }
    guard attributes[.type] as? FileAttributeType == .typeRegular,
      (attributes[.size] as? NSNumber)?.intValue == 64 else { throw DeliveryError.incompatibleVersion }
    guard try Data(contentsOf: url) == identityData(package) else { throw DeliveryError.incompatibleVersion }
    return true
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
