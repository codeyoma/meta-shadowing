import Foundation
import CryptoKit

enum ProgressCloudError: String, Error, LocalizedError {
  case unavailable, accountChanged, offline, quota, permission, conflict, corrupt, tooLarge, storage, busy
  var errorDescription: String? { "progress-cloud-" + rawValue }
}

struct BackupReference: Codable, Equatable, Sendable {
  let id: String
  let hash: String
}

struct BackupRecord: Codable, Equatable, Sendable {
  let id: String
  let kind: String
  let writer: String
  let revision: Int
  let createdAt: String
  var hash: String = ""
  var bytes: Int = 0
  var current: BackupReference?
  var previous: BackupReference?
  var systemFields: Data?
  func hasSamePayload(as other: Self) -> Bool {
    var lhs = self, rhs = other
    lhs.systemFields = nil; rhs.systemFields = nil
    return lhs == rhs
  }
}

struct CloudBackup: Sendable {
  let id: String
  let createdAt: String
  let revision: Int
}

struct PendingBackup: Codable {
  let backup: BackupRecord
  let head: BackupRecord
  var assetAcknowledged = false
}

struct ProgressState: Codable {
  var writer = UUID().uuidString
  var pending: PendingBackup?
  var records: [String: BackupRecord] = [:]
  var cleanup: [String] = []
  var engine: Data?
}

/// Atomic metadata and owned assets. No CloudKit temporary URLs survive here.
@MainActor
final class ProgressStore {
  static let maxBytes = 16 * 1024 * 1024
  static let maxCacheBytes = 128 * 1024 * 1024
  let directory: URL
  private(set) var state: ProgressState

  init(directory: URL) throws {
    self.directory = directory
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let file = directory.appendingPathComponent("state.json")
      state = FileManager.default.fileExists(atPath: file.path)
        ? try JSONDecoder().decode(ProgressState.self, from: Data(contentsOf: file)) : ProgressState()
      try update { _ in }
    } catch { throw ProgressCloudError.storage }
  }

  func update(_ change: (inout ProgressState) throws -> Void) throws {
    var next = state
    try change(&next)
    do {
      try JSONEncoder().encode(next).write(to: directory.appendingPathComponent("state.json"), options: .atomic)
      state = next
    } catch { throw ProgressCloudError.storage }
  }

  static func hash(_ data: Data) -> String { SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined() }
  func assetURL(_ id: String) -> URL {
    directory.appendingPathComponent(Self.hash(Data(id.utf8)) + ".jsonasset")
  }
  func asset(_ record: BackupRecord) throws -> Data {
    let url = assetURL(record.id)
    guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
          size == record.bytes, size <= Self.maxBytes else { throw ProgressCloudError.corrupt }
    let data = try Data(contentsOf: url)
    guard Self.hash(data) == record.hash, String(data: data, encoding: .utf8) != nil else { throw ProgressCloudError.corrupt }
    return data
  }
  func stage(_ record: BackupRecord, asset data: Data? = nil) throws {
    guard record.id.count <= 128, record.writer.count <= 128, record.revision >= 0,
          record.createdAt.count <= 40, ["ProgressBackup", "ProgressBackupHead"].contains(record.kind)
    else { throw ProgressCloudError.corrupt }
    if record.kind == "ProgressBackup" {
      guard record.bytes > 0, record.bytes <= Self.maxBytes, record.hash.count == 64 else { throw ProgressCloudError.corrupt }
      if let data {
        guard data.count == record.bytes, Self.hash(data) == record.hash else { throw ProgressCloudError.corrupt }
        let urls = try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.fileSizeKey])
        let total = try urls.filter { $0.pathExtension == "jsonasset" && $0 != assetURL(record.id) }
          .reduce(0) { try $0 + ($1.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0) }
        guard total + data.count <= Self.maxCacheBytes else { throw ProgressCloudError.tooLarge }
        do { try data.write(to: assetURL(record.id), options: .atomic) } catch { throw ProgressCloudError.storage }
      }
    }
    guard state.records[record.id] != nil || state.records.count < 256 else { throw ProgressCloudError.tooLarge }
    try update { $0.records[record.id] = record }
  }
  func receive(_ record: BackupRecord, asset data: Data?) throws {
    // A damaged current asset must not hide the independently valid previous one.
    // Keep its metadata so explicit read reports corruption, never a false empty list.
    if let data, data.count == record.bytes, Self.hash(data) == record.hash {
      try stage(record, asset: data)
    } else { try stage(record) }
  }
  func remove(_ id: String) throws {
    try update { $0.records.removeValue(forKey: id); $0.cleanup.removeAll { $0 == id } }
    let url = assetURL(id)
    if FileManager.default.fileExists(atPath: url.path) { try FileManager.default.removeItem(at: url) }
  }
}
