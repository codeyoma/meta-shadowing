import Foundation

@MainActor
final class TestCloud: ProgressCloudService {
  var account = "test-scope"
  var records: [String: BackupRecord] = [:]
  var assets: [String: Data] = [:]
  var failHead = false
  var failFetch = false
  var saveFailure: ProgressCloudError?
  var deletionFailure: ProgressCloudError?
  var onSave: ((BackupRecord) async -> Void)?
  var onStop: (() async -> Void)?
  var savedResponse: ((BackupRecord) -> BackupRecord)?
  var onFetch: (() async -> Void)?
  func identity() async throws -> String { account }
  func fetch(into store: ProgressStore) async throws {
    if failFetch { throw ProgressCloudError.offline }
    if let onFetch { await onFetch() }
    for id in store.state.records.keys where records[id] == nil && store.state.pending?.backup.id != id {
      try store.remove(id)
    }
    for record in records.values { try store.receive(record, asset: assets[record.id]) }
  }
  func save(_ record: BackupRecord, asset: URL?, store: ProgressStore) async throws -> BackupRecord {
    if let onSave { await onSave(record) }
    if let saveFailure { throw saveFailure }
    if let existing = records[record.id] {
      if existing.hasSamePayload(as: record) { return savedResponse?(existing) ?? existing }
      guard existing.changeTag == record.changeTag else { throw ProgressCloudError.conflict }
    } else if record.changeTag != nil { throw ProgressCloudError.conflict }
    if record.kind == "ProgressBackupHead" {
      if failHead { throw ProgressCloudError.offline }
      if record.retired != true {
        guard let reference = record.current, records[reference.id]?.hash == reference.hash else { throw ProgressCloudError.corrupt }
      }
    }
    var saved = record; saved.changeTag = UUID().uuidString
    records[record.id] = saved
    if let asset { assets[record.id] = try Data(contentsOf: asset) }
    return savedResponse?(saved) ?? saved
  }
  func delete(_ id: String, store: ProgressStore) async throws {
    if let deletionFailure { throw deletionFailure }
    records.removeValue(forKey: id); assets.removeValue(forKey: id)
  }
  func suspend() -> CloudCancellation { { await self.onStop?() } }
}

// Compatibility call sites explicitly fetch their adopted base. Conflict tests use
// the production four-argument publication API directly.
extension ProgressTransport {
  func publish(scope: String, revision: Int, json: String) async throws -> Int {
    let base = try await list(scope: scope).first?.token ?? ""
    return try await publish(scope: scope, revision: revision, json: json, base: base).revision
  }
}

extension TestCloud {
  func seedLegacy(_ transport: ProgressTransport, revision: Int, json: String) async throws {
    let data = Data(json.utf8), writer = transport.store.state.writer
    let backup = BackupRecord(id: UUID().uuidString, kind: "ProgressBackup", writer: writer,
      revision: revision, createdAt: "2026-01-02T00:00:00Z", hash: ProgressStore.hash(data), bytes: data.count)
    let existing = records["head-" + writer]
    let head = BackupRecord(id: "head-" + writer, kind: "ProgressBackupHead", writer: writer,
      revision: revision, createdAt: backup.createdAt,
      current: BackupReference(id: backup.id, hash: backup.hash), previous: existing?.current,
      changeTag: UUID().uuidString)
    records[backup.id] = backup; assets[backup.id] = data; records[head.id] = head
  }
}
