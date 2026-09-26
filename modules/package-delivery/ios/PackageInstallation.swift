import CryptoKit
import Foundation

struct DeliveryPackage: Codable, Sendable, Equatable {
  struct Entry: Codable, Sendable, Equatable {
    let file: String
    let bytes: Int
    let sha256: String
  }
  let key: String
  let files: [Entry]
}

enum DeliveryError: String, Error { case invalidPackage, damagedFiles, unavailable, busy, unauthorized, incompatibleVersion }

typealias PackagePublication = @Sendable (() throws -> Void) throws -> Void

/// Publishes an immutable version only after every pinned entry survives a disk read.
/// This directory is independent of Background Assets' managed cache and of checkpoints.
struct PackageInstallation: Sendable {
  let root: URL

  func isInstalled(_ package: DeliveryPackage) throws -> Bool {
    try validate(package)
    try validateOwnedTree(package.key)
    do { try checkIdentity(package) }
    catch DeliveryError.incompatibleVersion { return false }
    let directory = root.appendingPathComponent(package.key)
    guard FileManager.default.fileExists(atPath: directory.appendingPathComponent("ready").path) else { return false }
    let verified = package.files.allSatisfy { entry in
      guard let data = try? Data(contentsOf: directory.appendingPathComponent(entry.file)) else { return false }
      return matches(data, entry)
    }
    // Adopt a legacy installation only after every current pinned file matches.
    if verified { try pinIdentity(package) }
    return verified
  }

  func install(_ package: DeliveryPackage, publication: PackagePublication = { try $0() }, source: (String) throws -> Data) throws {
    try validate(package)
    try Task.checkCancellation()
    if try isInstalled(package) { return }
    try checkIdentity(package)
    let fs = FileManager.default
    try fs.createDirectory(at: root, withIntermediateDirectories: true)
    // The download owner serializes installs. This exact per-version path also
    // lets a new process recover a staging directory left by a terminated app.
    let staging = root.appendingPathComponent(".install-\(package.key)")
    try validateOwnedTree(".install-\(package.key)")
    if fs.fileExists(atPath: staging.path) { try fs.removeItem(at: staging) }
    try fs.createDirectory(at: staging, withIntermediateDirectories: false)
    defer { try? fs.removeItem(at: staging) }
    for entry in package.files {
      try Task.checkCancellation()
      let data = try source(entry.file)
      guard matches(data, entry) else { throw DeliveryError.damagedFiles }
      let file = staging.appendingPathComponent(entry.file)
      try fs.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
      try data.write(to: file, options: .atomic)
      guard matches(try Data(contentsOf: file), entry) else { throw DeliveryError.damagedFiles }
    }
    try Task.checkCancellation()
    try Data("1".utf8).write(to: staging.appendingPathComponent("ready"), options: .atomic)
    let destination = root.appendingPathComponent(package.key)
    // An existing verified version is never replaced. A damaged version isn't playable.
    if try isInstalled(package) { return }
    try publication {
      try Task.checkCancellation()
      try pinIdentity(package)
      if fs.fileExists(atPath: destination.path) { try fs.removeItem(at: destination) }
      try fs.moveItem(at: staging, to: destination)
    }
  }

  private func matches(_ data: Data, _ entry: DeliveryPackage.Entry) -> Bool {
    data.count == entry.bytes && SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() == entry.sha256
  }

  func syntax(_ package: DeliveryPackage) throws -> String? {
    guard try isInstalled(package) else { throw DeliveryError.unavailable }
    guard let entry = package.files.first(where: { $0.file == "syntax.json" }) else { return nil }
    guard entry.bytes <= 20_000_000 else { throw DeliveryError.invalidPackage }
    let data = try Data(contentsOf: root.appendingPathComponent(package.key).appendingPathComponent(entry.file))
    guard matches(data, entry), let text = String(data: data, encoding: .utf8) else { throw DeliveryError.damagedFiles }
    return text
  }

  private func validate(_ package: DeliveryPackage) throws {
    guard package.key.range(of: "^[a-z0-9]+(?:-[a-z0-9]+)*-v[1-9][0-9]*$", options: .regularExpression) != nil,
      package.files.count > 1, package.files.count <= 1001,
      Set(package.files.map(\.file)).count == package.files.count,
      package.files.contains(where: { $0.file == "manifest.json" }),
      package.files.allSatisfy({ entry in
        (entry.file == "manifest.json" || (package.key == LibraryMaterial.freeDuo && entry.file == "syntax.json" && entry.bytes <= 20_000_000) || (package.key == LibraryMaterial.paidDuo && ["cover.jpg", "info.json", "text.txt", "syntax.json"].contains(entry.file)) || entry.file.range(of: "^audio/[a-z0-9-]+\\.m4a$", options: .regularExpression) != nil)
          && entry.bytes > 0 && entry.bytes <= 50_000_000
          && entry.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil
      }) else { throw DeliveryError.invalidPackage }
    guard package.files.reduce(0, { $0 + $1.bytes }) <= 1_000_000_000 else { throw DeliveryError.invalidPackage }
    if package.key == LibraryMaterial.paidDuo {
      let expected = Set(["manifest.json", "cover.jpg", "info.json", "text.txt", "syntax.json"] + (1...560).map { String(format: "audio/phrase-%03d.m4a", $0) })
      guard Set(package.files.map(\.file)) == expected,
        package.files.filter({ !$0.file.hasPrefix("audio/") }).allSatisfy({ $0.bytes <= 20_000_000 })
      else { throw DeliveryError.invalidPackage }
    }
  }
}
