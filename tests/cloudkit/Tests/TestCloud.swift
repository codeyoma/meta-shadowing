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
  func identity() async throws -> String { account }
  func fetch(into store: ProgressStore) async throws {
    if failFetch { throw ProgressCloudError.offline }
    for record in records.values { try store.receive(record, asset: assets[record.id]) }
  }
  func save(_ record: BackupRecord, asset: URL?, store: ProgressStore) async throws -> BackupRecord {
    if let onSave { await onSave(record) }
    if let saveFailure { throw saveFailure }
    if record.kind == "ProgressBackupHead" {
      if failHead { throw ProgressCloudError.offline }
      guard let reference = record.current, records[reference.id]?.hash == reference.hash else { throw ProgressCloudError.corrupt }
    }
    records[record.id] = record
    if let asset { assets[record.id] = try Data(contentsOf: asset) }
    return savedResponse?(record) ?? record
  }
  func delete(_ id: String, store: ProgressStore) async throws {
    if let deletionFailure { throw deletionFailure }
    records.removeValue(forKey: id); assets.removeValue(forKey: id)
  }
  func suspend() -> CloudCancellation { { await self.onStop?() } }
}
