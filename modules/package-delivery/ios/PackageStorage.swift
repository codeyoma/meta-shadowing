import Foundation

/// Only these immutable catalog installations belong to the library material controls.
/// The caller never supplies a filesystem path or a Background Assets identifier.
enum LibraryMaterial {
  static let bundled = "morning-notes-v1"
  static let hosted = "hosted-morning-notes-v1"
  static let freeDuoVersions = ["duo-33-free-test-v1", "duo-33-free-test-v2"]
  static let freeDuo: String = {
    let configured = Bundle.main.object(forInfoDictionaryKey: "FreeDuoAssetPackID") as? String
    return freeDuoVersions.first(where: { $0 == configured }) ?? freeDuoVersions[0]
  }()
  static let paidDuo = "duo-33-v1"
  static func validate(_ key: String) throws {
    guard ([bundled, hosted, paidDuo] + freeDuoVersions).contains(key) else { throw DeliveryError.invalidPackage }
  }
}

struct MaterialStorage: Sendable {
  let bytes: Int
  let installed: Bool
  let busy: Bool
}

extension PackageInstallation {
  func materialBytes(_ key: String) throws -> Int {
    try LibraryMaterial.validate(key)
    try validateMaterialPaths(key)
    return try inspectTree(root.appendingPathComponent(key))
  }

  func removeMaterials(_ key: String) throws {
    try LibraryMaterial.validate(key)
    // Preflight BOTH trees before the first mutation, including a dangling link.
    try validateMaterialPaths(key)
    for name in [key, ".install-\(key)"] {
      let url = root.appendingPathComponent(name)
      if try itemType(url) != nil { try FileManager.default.removeItem(at: url) }
    }
  }

  private func validateMaterialPaths(_ key: String) throws {
    try validateOwnedTree(key)
    try validateOwnedTree(".install-\(key)")
  }

  /// Documents is trusted (including Apple's /var alias). Never resolve away a
  /// link at the owned lesson-packages root or anywhere beneath a selected tree.
  func validateOwnedTree(_ key: String) throws {
    if let type = try itemType(root), type != .typeDirectory { throw DeliveryError.invalidPackage }
    let directory = root.appendingPathComponent(key)
    if let type = try itemType(directory), type != .typeDirectory { throw DeliveryError.invalidPackage }
    _ = try inspectTree(directory)
  }

  private func itemType(_ url: URL) throws -> FileAttributeType? {
    do { return try FileManager.default.attributesOfItem(atPath: url.path)[.type] as? FileAttributeType }
    catch let error as CocoaError where error.code == .fileReadNoSuchFile { return nil }
  }

  private func inspectTree(_ url: URL) throws -> Int {
    guard let type = try itemType(url) else { return 0 }
    switch type {
    case .typeRegular:
      let attributes = try FileManager.default.attributesOfItem(atPath: url.path)
      guard let bytes = attributes[.size] as? NSNumber else { throw DeliveryError.damagedFiles }
      return bytes.intValue
    case .typeDirectory:
      return try FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)
        .reduce(0) { try $0 + inspectTree($1) }
    default: throw DeliveryError.invalidPackage
    }
  }
}
