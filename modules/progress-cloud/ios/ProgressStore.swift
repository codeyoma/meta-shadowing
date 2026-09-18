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
  var changeTag: String?
  var retired: Bool?
  var cleanupManifest: String?
  var resetGeneration: String?
  func hasSamePayload(as other: Self) -> Bool {
    var lhs = self, rhs = other
    lhs.systemFields = nil; rhs.systemFields = nil
    lhs.changeTag = nil; rhs.changeTag = nil
    return lhs == rhs
  }
}

struct CloudBackup: Sendable {
  let id: String
  let createdAt: String
  let revision: Int
  let token: String
  let legacy: Bool
  var cleanupPending = false
  var pendingPublication: String?
  var resetGeneration: String?
}

/// Exact retirement authority travels with the committed head so reinstall or
/// another installation can finish it. Changed legacy heads are never recaptured.
struct CleanupManifest: Codable {
  var heads: [BackupRecord]
  var assets: [String]
  private func validate() throws {
    guard heads.count <= 256, assets.count <= 256 else { throw ProgressCloudError.tooLarge }
    guard assets.allSatisfy({ UUID(uuidString: $0) != nil }),
          heads.allSatisfy({
            $0.kind == "ProgressBackupHead" && UUID(uuidString: $0.writer) != nil
              && $0.id == "head-" + $0.writer && $0.retired != true
              && $0.current != nil && $0.cleanupManifest == nil
          }) else { throw ProgressCloudError.corrupt }
  }
  func encoded() throws -> String {
    // A manifest must be readable before any conditional head publication.
    try validate()
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    let bytes = try encoder.encode(self)
    guard bytes.count <= 262_144 else { throw ProgressCloudError.tooLarge }
    return String(decoding: bytes, as: UTF8.self)
  }
  static func decode(_ value: String) throws -> Self {
    guard value.utf8.count <= 262_144,
          let manifest = try? JSONDecoder().decode(Self.self, from: Data(value.utf8)),
          (try? manifest.validate()) != nil else { throw ProgressCloudError.corrupt }
    return manifest
  }
}

struct CloudPublication: Sendable {
  let id: String
  let createdAt: String
  let revision: Int
  let token: String
  let legacy = false
  let cleanupPending: Bool
  var resetGeneration: String?
}

struct ResetIntent: Codable {
  let requestId: String
  let expectedGeneration: String
  var acceptedGeneration: String?
  var completed = false
}

struct PendingBackup: Codable {
  let backup: BackupRecord
  let head: BackupRecord
  var assetAcknowledged = false
  var expectedBase: String?
  var retirements: [BackupRecord]?
  var superseded: [String]?
  var resetRequestId: String?
}

struct ProgressState: Codable {
  var writer = UUID().uuidString
  var pending: PendingBackup?
  var records: [String: BackupRecord] = [:]
  var cleanup: [String] = []
  var engine: Data?
  var retirementHeads: [String: BackupRecord]?
  var acknowledged: PendingBackup?
  var resetIntent: ResetIntent?
  var observedResetGeneration: String?
  var discardPending: Bool?
}

/// Native validates protocol identity and the destructive empty shape. TypeScript
/// remains responsible for validating ordinary learning rows and sync semantics.
@MainActor
enum ProgressEnvelope {
  static func generation(_ data: Data) throws -> String {
    guard !data.isEmpty, data.count <= ProgressStore.maxBytes else { throw ProgressCloudError.tooLarge }
    guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw ProgressCloudError.corrupt }
    guard let version = root["version"] as? Int, version >= 5 else { return "" }
    guard version == 5, Set(root.keys) == ["version", "generation", "progress"],
          let generation = root["generation"] as? String, UUID(uuidString: generation) != nil,
          let progress = root["progress"] as? [String: Any], progress["version"] as? Int == 4,
          Set(progress.keys) == ["version", "tables", "sync"],
          progress["tables"] is [String: Any], progress["sync"] is [String: Any]
    else { throw ProgressCloudError.corrupt }
    return generation
  }
  static func validateReset(_ data: Data, requestId: String) throws {
    guard UUID(uuidString: requestId) != nil, try generation(data) == requestId,
          let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
          let progress = root["progress"] as? [String: Any],
          let tables = progress["tables"] as? [String: Any],
          Set(tables.keys) == ["checkpoints", "completions", "daily_stages", "stage_awards", "study_days", "preferences", "cycle_credits", "unit_credits"],
          tables.values.allSatisfy({ ($0 as? [Any])?.isEmpty == true }),
          let sync = progress["sync"] as? [String: Any], Set(sync.keys) == ["clocks", "runs"],
          (sync["clocks"] as? [String: Any])?.isEmpty == true,
          (sync["runs"] as? [Any])?.isEmpty == true else { throw ProgressCloudError.corrupt }
  }
}

/// Atomic metadata and owned assets. No CloudKit temporary URLs survive here.
@MainActor
final class ProgressStore {
  private final class Reference {
    weak var store: ProgressStore?
    init(_ store: ProgressStore) { self.store = store }
  }
  private static var liveStores: [String: [Reference]] = [:]
  static let maxBytes = 16 * 1024 * 1024
  static let maxCacheBytes = 128 * 1024 * 1024
  let directory: URL
  private(set) var state: ProgressState
  private var retired = false

  init(directory: URL) throws {
    self.directory = directory
    do {
      try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
      let file = directory.appendingPathComponent("state.json")
      state = FileManager.default.fileExists(atPath: file.path)
        ? try JSONDecoder().decode(ProgressState.self, from: Data(contentsOf: file)) : ProgressState()
      if state.discardPending == true { try finishDiscard() }
      try update { _ in }
      let key = directory.standardizedFileURL.path
      Self.liveStores[key] = (Self.liveStores[key] ?? []).filter { $0.store != nil } + [Reference(self)]
    } catch { throw ProgressCloudError.storage }
  }

  func update(_ change: (inout ProgressState) throws -> Void) throws {
    guard !retired else { throw ProgressCloudError.accountChanged }
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
    guard !retired else { throw ProgressCloudError.accountChanged }
    let url = assetURL(record.id)
    guard let size = try? url.resourceValues(forKeys: [.fileSizeKey]).fileSize,
          size == record.bytes, size <= Self.maxBytes else { throw ProgressCloudError.corrupt }
    let data = try Data(contentsOf: url)
    guard Self.hash(data) == record.hash, String(data: data, encoding: .utf8) != nil else { throw ProgressCloudError.corrupt }
    return data
  }
  func stage(_ record: BackupRecord, asset data: Data? = nil) throws {
    guard !retired else { throw ProgressCloudError.accountChanged }
    if let generation = record.resetGeneration, UUID(uuidString: generation) == nil { throw ProgressCloudError.corrupt }
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

  /// Retire the actual store object before touching disk; captured delegate/store
  /// references cannot recreate files after the owner's transport is detached.
  func discardLocal() throws {
    let key = directory.standardizedFileURL.path
    for reference in Self.liveStores.removeValue(forKey: key) ?? [] { reference.store?.retired = true }
    retired = true
    var minimal = ProgressState()
    minimal.writer = state.writer
    minimal.resetIntent = state.resetIntent
    minimal.observedResetGeneration = state.observedResetGeneration
    minimal.discardPending = true
    do {
      try JSONEncoder().encode(minimal).write(to: directory.appendingPathComponent("state.json"), options: .atomic)
      state = minimal
      try finishDiscard()
    } catch { throw ProgressCloudError.storage }
  }
  private func finishDiscard() throws {
    // Only files with the owned hashed-asset naming contract are removed. A
    // durable marker makes an interrupted filesystem sweep finish on reopen.
    for url in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
      if url.lastPathComponent.range(of: #"^[0-9a-f]{64}\.jsonasset$"#, options: .regularExpression) != nil {
        try FileManager.default.removeItem(at: url)
      }
    }
    var finished = state; finished.discardPending = nil
    try JSONEncoder().encode(finished).write(to: directory.appendingPathComponent("state.json"), options: .atomic)
    state = finished
  }
}
