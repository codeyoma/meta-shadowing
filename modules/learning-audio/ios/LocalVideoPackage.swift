import Foundation
import CryptoKit
import Darwin

enum VideoError: Error { case unavailable, invalid, cancelled }

struct VideoManifest: Codable, Sendable {
  struct Media: Codable, Sendable { let file: String; let bytes: Int64; let sha256: String; let duration: Double }
  struct Phrase: Codable, Sendable { let id: String; let start: Double; let end: Double; let text: String; let translation: String }
  let kind: String
  let schemaVersion: Int
  let id: String
  let version: Int
  let title: String
  let media: Media
  let phrases: [Phrase]
  var key: String { "\(id)-v\(version)" }

  static func decode(_ data: Data) throws -> Self {
    guard data.count <= 2_000_000 else { throw VideoError.invalid }
    let m = try JSONDecoder().decode(Self.self, from: data)
    func text(_ s: String) -> Bool { !s.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && s.count <= 10_000 }
    guard m.kind == "video", m.schemaVersion == 1, m.version > 0, m.version <= 9_007_199_254_740_991,
      m.id.count <= 80, m.id.range(of: "^video-[a-z0-9]+(?:-[a-z0-9]+)*$", options: .regularExpression) != nil,
      text(m.title), m.media.file == "video/source.mp4", m.media.bytes > 0, m.media.bytes <= 4_000_000_000,
      m.media.sha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil,
      m.media.duration.isFinite, m.media.duration > 0, (1...1000).contains(m.phrases.count)
    else { throw VideoError.invalid }
    var ids = Set<String>(), end = 0.0
    for p in m.phrases {
      guard text(p.id), ids.insert(p.id).inserted, text(p.text), text(p.translation),
        p.start.isFinite, p.end.isFinite, p.start >= end, p.end > p.start, p.end <= m.media.duration
      else { throw VideoError.invalid }
      end = p.end
    }
    return m
  }
}

/// Actor serialization keeps verification, replacement and removal mutually exclusive.
actor LocalVideoPackage {
  struct Status: Sendable { let installed: Bool; let bytes: Int64 }
  nonisolated let manifest: VideoManifest?
  nonisolated let json: String?
  nonisolated let manifestInvalid: Bool
  private let source: URL?
  private let packages: URL
  private let fm = FileManager.default
  private let checksum: @Sendable (URL) throws -> String
  // Process-local only: a new instance must verify bytes before trusting them.
  private var verification: (url: URL, identity: FileIdentity, valid: Bool)?

  private struct FileIdentity: Equatable {
    let device: dev_t
    let inode: ino_t
    let bytes: off_t
    let modifiedSeconds: Int
    let modifiedNanoseconds: Int
    let changedSeconds: Int
    let changedNanoseconds: Int

    init?(_ url: URL) throws {
      var info = stat()
      guard lstat(url.path, &info) == 0 else {
        if errno == ENOENT { return nil }
        throw VideoError.invalid
      }
      guard info.st_mode & S_IFMT == S_IFREG else { throw VideoError.invalid }
      device = info.st_dev; inode = info.st_ino; bytes = info.st_size
      modifiedSeconds = info.st_mtimespec.tv_sec; modifiedNanoseconds = info.st_mtimespec.tv_nsec
      changedSeconds = info.st_ctimespec.tv_sec; changedNanoseconds = info.st_ctimespec.tv_nsec
    }
  }

  nonisolated static var bundledSource: URL? {
    #if DEBUG
    return Bundle.main.resourceURL?.appendingPathComponent("LocalVideo")
    #else
    return nil
    #endif
  }

  init(source: URL?, packages: URL,
       checksum: @escaping @Sendable (URL) throws -> String = LocalVideoPackage.sha256) {
    self.source = source?.standardizedFileURL
    self.packages = packages.standardizedFileURL
    self.checksum = checksum
    if let source, let data = try? Self.safeData(source.appendingPathComponent("manifest.json")),
       let decoded = try? VideoManifest.decode(data) {
      manifest = decoded; json = String(data: data, encoding: .utf8); manifestInvalid = false
    } else {
      manifest = nil; json = nil
      manifestInvalid = source.map { FileManager.default.fileExists(atPath: $0.path) } ?? false
    }
  }

  private nonisolated static func safeData(_ url: URL) throws -> Data {
    try safePath(url)
    let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
    guard values.isRegularFile == true, (values.fileSize ?? 0) <= 2_000_000 else { throw VideoError.invalid }
    return try Data(contentsOf: url)
  }
  private nonisolated static func safePath(_ url: URL) throws {
    var current = url
    // macOS /var itself is a system symlink. Canonicalize system temp parents
    // at callers, but never accept a symlink anywhere inside a package path.
    while current.path != "/" && current.path != "/var" {
      let values = try? current.resourceValues(forKeys: [.isSymbolicLinkKey])
      if values?.isSymbolicLink == true { throw VideoError.invalid }
      current.deleteLastPathComponent()
    }
  }
  private func directory() throws -> URL {
    guard let manifest else { throw VideoError.unavailable }
    let result = packages.appendingPathComponent(manifest.key)
    try Self.safePath(result)
    return result
  }
  private func verified(_ url: URL) throws -> Bool {
    guard let manifest else { return false }
    try Self.safePath(url)
    guard let identity = try FileIdentity(url), identity.bytes == manifest.media.bytes else {
      verification = nil
      return false
    }
    if let verification, verification.url == url, verification.identity == identity { return verification.valid }
    verification = nil
    let valid = try checksum(url) == manifest.media.sha256
    // Do not bless a replacement or an in-place edit that happened during hashing.
    guard try FileIdentity(url) == identity else { return false }
    verification = (url, identity, valid)
    return valid
  }
  nonisolated static func sha256(_ url: URL) throws -> String {
    let handle = try FileHandle(forReadingFrom: url)
    defer { try? handle.close() }
    var hash = SHA256()
    while let bytes = try handle.read(upToCount: 1_048_576), !bytes.isEmpty { hash.update(data: bytes) }
    return hash.finalize().map { String(format: "%02x", $0) }.joined()
  }
  func status() throws -> Status {
    guard manifest != nil else { return Status(installed: false, bytes: 0) }
    let dir = try directory(), file = dir.appendingPathComponent("video/source.mp4")
    let installed = try verified(file)
    let bytes = try? file.resourceValues(forKeys: [.fileSizeKey]).fileSize
    return Status(installed: installed, bytes: Int64(bytes ?? 0))
  }
  func mediaURL() throws -> URL {
    let file = try directory().appendingPathComponent("video/source.mp4")
    guard try verified(file) else { throw VideoError.unavailable }
    return file
  }
  func install() throws {
    guard let source, let manifest else { throw VideoError.unavailable }
    if try status().installed { return }
    verification = nil
    let original = source.appendingPathComponent(manifest.media.file)
    guard try verified(original) else { throw VideoError.invalid }
    let destination = try directory()
    try Self.safePath(packages)
    try fm.createDirectory(at: packages, withIntermediateDirectories: true)
    let staging = packages.appendingPathComponent(".video-\(UUID().uuidString)")
    try fm.createDirectory(at: staging.appendingPathComponent("video"), withIntermediateDirectories: true)
    defer { try? fm.removeItem(at: staging) }
    let copy = staging.appendingPathComponent(manifest.media.file)
    try fm.copyItem(at: original, to: copy)
    guard try verified(copy) else { throw VideoError.invalid }
    // A valid installation returned above; only an invalid directory is replaced.
    if fm.fileExists(atPath: destination.path) { try fm.removeItem(at: destination) }
    try fm.moveItem(at: staging, to: destination)
    verification = nil
  }
  func remove() throws {
    verification = nil
    let destination = try directory()
    if fm.fileExists(atPath: destination.path) { try fm.removeItem(at: destination) }
  }
}
