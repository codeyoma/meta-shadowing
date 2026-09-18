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
  private var epoch = UUID()
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
  func savePublication(_ backup: BackupRecord, head: BackupRecord, asset: URL, store: ProgressStore) async throws -> BackupRecord {
    let ticket = epoch, identity = account
    // Suspend before the server transaction so races exercise the production
    // asset/head boundary. Validate both CAS records before mutating either one.
    for record in [backup, head] {
      if let onSave { await onSave(record) }
      guard ticket == epoch, account == identity else { throw ProgressCloudError.accountChanged }
      if let saveFailure { throw saveFailure }
    }
    if failHead { throw ProgressCloudError.offline }
    for record in [backup, head] {
      if let existing = records[record.id] {
        guard existing.hasSamePayload(as: record) || existing.changeTag == record.changeTag else { throw ProgressCloudError.conflict }
      } else if record.changeTag != nil { throw ProgressCloudError.conflict }
    }
    let bytes = try Data(contentsOf: asset)
    guard head.current == BackupReference(id: backup.id, hash: backup.hash),
      bytes.count == backup.bytes, ProgressStore.hash(bytes) == backup.hash else { throw ProgressCloudError.corrupt }
    var committedBackup = backup, committedHead = head
    committedBackup.changeTag = UUID().uuidString; committedHead.changeTag = UUID().uuidString
    records[backup.id] = committedBackup; records[head.id] = committedHead; assets[backup.id] = bytes
    guard (savedResponse?(committedBackup) ?? committedBackup).hasSamePayload(as: backup) else { throw ProgressCloudError.conflict }
    return savedResponse?(committedHead) ?? committedHead
  }
  func delete(_ id: String, store: ProgressStore) async throws {
    if let deletionFailure { throw deletionFailure }
    records.removeValue(forKey: id); assets.removeValue(forKey: id)
  }
  func suspend() -> CloudCancellation { epoch = UUID(); return { await self.onStop?() } }
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
  /// Explicit upgrade fixture: old split publication uploaded an asset but never
  /// committed its head. New atomic publications cannot create this state.
  func seedHistoricalPendingAsset(_ transport: ProgressTransport) throws {
    guard let pending = transport.store.state.pending else { throw ProgressCloudError.storage }
    var record = pending.backup; record.changeTag = UUID().uuidString
    records[record.id] = record; assets[record.id] = try transport.store.asset(pending.backup)
    try transport.store.update { $0.pending?.assetAcknowledged = true }
  }
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
