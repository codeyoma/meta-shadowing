import CloudKit
import Foundation

/// CKSyncEngine owns CloudKit operations and serialization; the app owns records/assets.
/// It is deliberately manual: only an explicit coordinator publication authorizes sends.
@MainActor
final class CloudKitService: ProgressCloudService, CKSyncEngineDelegate {
  static let zone = CKRecordZone.ID(zoneName: "LearningProgress")
  private let container: CKContainer?
  let scope: String
  let identityProvider: @MainActor () async throws -> String
  private var engine: CKSyncEngine?
  private var store: ProgressStore?
  private var epoch = UUID()
  private var authorized = false
  private var outgoing: CKRecord?
  private var deleting: CKRecord.ID?
  private var saved: BackupRecord?
  private var deleted = false
  private var failure: ProgressCloudError?

  init(container: CKContainer? = nil, scope: String, identity: @escaping @MainActor () async throws -> String) {
    self.container = container; self.scope = scope; self.identityProvider = identity
  }
  func identity() async throws -> String { try await identityProvider() }
  private func check(_ ticket: UUID) async throws {
    guard ticket == epoch else { throw ProgressCloudError.accountChanged }
    let current = try await identityProvider()
    guard ticket == epoch, current == scope else { throw ProgressCloudError.accountChanged }
  }
  private func engine(for store: ProgressStore) throws -> CKSyncEngine {
    if let engine { return engine }
    guard let container else { throw ProgressCloudError.unavailable }
    self.store = store
    let serialization = try store.state.engine.map { try JSONDecoder().decode(CKSyncEngine.State.Serialization.self, from: $0) }
    var configuration = CKSyncEngine.Configuration(database: container.privateCloudDatabase,
      stateSerialization: serialization, delegate: self)
    configuration.automaticallySync = false
    let engine = CKSyncEngine(configuration)
    // Pending logical generations live in ProgressStore. Reopening never authorizes delivery.
    engine.state.remove(pendingRecordZoneChanges: engine.state.pendingRecordZoneChanges)
    engine.state.remove(pendingDatabaseChanges: engine.state.pendingDatabaseChanges)
    self.engine = engine
    return engine
  }
  func fetch(into store: ProgressStore) async throws {
    let ticket = epoch
    try await check(ticket)
    let engine = try engine(for: store)
    failure = nil
    do { try await engine.fetchChanges() } catch {
      await stop()
      throw Self.sanitize(error)
    }
    try await check(ticket)
    if let failure {
      await stop()
      throw failure
    }
  }
  func save(_ record: BackupRecord, asset: URL?, store: ProgressStore) async throws -> BackupRecord {
    let ticket = epoch
    try await check(ticket)
    let engine = try engine(for: store)
    let ckRecord = try Self.encode(record, asset: asset)
    outgoing = ckRecord; deleting = nil; saved = nil; failure = nil; authorized = true
    defer { authorized = false; outgoing = nil }
    engine.state.add(pendingDatabaseChanges: [.saveZone(CKRecordZone(zoneID: Self.zone))])
    engine.state.add(pendingRecordZoneChanges: [.saveRecord(ckRecord.recordID)])
    do { try await engine.sendChanges() } catch { throw Self.sanitize(error) }
    try await check(ticket)
    if let failure { throw failure }
    guard let saved, saved.id == record.id else { throw ProgressCloudError.offline }
    return saved
  }
  func delete(_ id: String, store: ProgressStore) async throws {
    let ticket = epoch
    try await check(ticket)
    let engine = try engine(for: store)
    guard store.state.cleanup.contains(id), let record = store.state.records[id],
          record.writer == store.state.writer, record.kind == "ProgressBackup",
          !store.state.records.values.contains(where: { $0.current?.id == id || $0.previous?.id == id })
    else { throw ProgressCloudError.conflict }
    let recordID = CKRecord.ID(recordName: id, zoneID: Self.zone)
    outgoing = nil; deleting = recordID; deleted = false; failure = nil; authorized = true
    defer { authorized = false; deleting = nil }
    engine.state.add(pendingRecordZoneChanges: [.deleteRecord(recordID)])
    do { try await engine.sendChanges() } catch { throw Self.sanitize(error) }
    try await check(ticket)
    if let failure { throw failure }
    guard deleted else { throw ProgressCloudError.offline }
  }
  func suspend() -> CloudCancellation {
    epoch = UUID(); authorized = false; outgoing = nil; deleting = nil
    let old = engine
    engine = nil; store = nil
    return { await old?.cancelOperations() }
  }
  func stop() async {
    let cancel = suspend()
    await cancel()
  }

  nonisolated func nextRecordZoneChangeBatch(_ context: CKSyncEngine.SendChangesContext,
    syncEngine: CKSyncEngine) async -> CKSyncEngine.RecordZoneChangeBatch? {
    await batch(context, engine: syncEngine)
  }
  private func batch(_ context: CKSyncEngine.SendChangesContext,
    engine: CKSyncEngine) async -> CKSyncEngine.RecordZoneChangeBatch? {
    let ticket = epoch
    do { try await check(ticket) } catch { failure = Self.sanitize(error); return nil }
    guard engine === self.engine, authorized else { return nil }
    // No await separates identity verification from delivery of the authorized bytes.
    if let outgoing, context.options.scope.contains(outgoing.recordID) {
      return CKSyncEngine.RecordZoneChangeBatch(recordsToSave: [outgoing], atomicByZone: true)
    }
    if let deleting, context.options.scope.contains(deleting) {
      guard let store, store.state.cleanup.contains(deleting.recordName),
            store.state.records[deleting.recordName]?.writer == store.state.writer,
            !store.state.records.values.contains(where: {
              $0.current?.id == deleting.recordName || $0.previous?.id == deleting.recordName
            }) else { failure = .conflict; return nil }
      return CKSyncEngine.RecordZoneChangeBatch(recordIDsToDelete: [deleting], atomicByZone: true)
    }
    return nil
  }

  nonisolated func handleEvent(_ event: CKSyncEngine.Event, syncEngine: CKSyncEngine) async {
    await receive(event, engine: syncEngine)
  }
  private func receive(_ event: CKSyncEngine.Event, engine: CKSyncEngine) async {
    guard engine === self.engine else { return }
    if case .accountChange = event {
      epoch = UUID(); authorized = false; outgoing = nil; deleting = nil
      failure = .accountChanged
      return
    }
    let ticket = epoch
    do {
      try await check(ticket)
      guard engine === self.engine, let store else { return }
      switch event {
      case .stateUpdate(let update):
        let data = try JSONEncoder().encode(update.stateSerialization)
        try deliver(.state(data), into: store)
      case .fetchedRecordZoneChanges(let changes):
        try deliver(.records(changes.modifications.map(\.record)), into: store)
        for item in changes.deletions where item.recordID.zoneID == Self.zone {
          try store.remove(item.recordID.recordName)
        }
      case .fetchedDatabaseChanges(let changes):
        if changes.deletions.contains(where: { $0.zoneID == Self.zone }) { failure = .conflict }
      case .didFetchRecordZoneChanges(let result):
        if let error = result.error { failure = Self.sanitize(error) }
      case .sentDatabaseChanges(let result):
        if let error = result.failedZoneSaves.first?.error { failure = Self.sanitize(error) }
      case .sentRecordZoneChanges(let result):
        guard authorized else { return }
        for record in result.savedRecords {
          guard record.recordID == outgoing?.recordID else { continue }
          try stage(record, into: store)
          saved = try Self.decode(record)
          outgoing = nil
        }
        for item in result.failedRecordSaves {
          // Retry after process death can encounter an already-acknowledged generation.
          // Only identical application fields qualify; never overwrite a changed head.
          if item.error.code == .serverRecordChanged,
             let server = item.error.serverRecord, let proposed = outgoing,
             try Self.samePayload(server, proposed) {
            try stage(server, into: store); saved = try Self.decode(server); outgoing = nil
            engine.state.remove(pendingRecordZoneChanges: [.saveRecord(server.recordID)])
          } else { failure = Self.sanitize(item.error); outgoing = nil }
        }
        if let deleting, result.deletedRecordIDs.contains(deleting) { deleted = true; self.deleting = nil }
        for (id, error) in result.failedRecordDeletes {
          guard id == deleting else { continue }
          if error.code == .unknownItem {
            // A crash after server deletion but before local cleanup must be retryable.
            deleted = true
            engine.state.remove(pendingRecordZoneChanges: [.deleteRecord(id)])
          } else { failure = Self.sanitize(error) }
          deleting = nil
        }
      default: break
      }
    } catch { failure = Self.sanitize(error) }
  }

  /// Inbound CloudKit delivery boundary. The delegate verifies account/engine identity
  /// before synchronously handing records or encoded engine state to this method.
  enum Delivery { case records([CKRecord]), state(Data) }
  func deliver(_ delivery: Delivery, into store: ProgressStore) throws {
    do {
      switch delivery {
      case .records(let records):
        for record in records where record.recordID.zoneID == Self.zone {
          try stage(record, into: store)
        }
      case .state(let data):
        if let failure { throw failure }
        try store.update { $0.engine = data }
      }
    } catch {
      let error = Self.sanitize(error)
      failure = error
      throw error
    }
  }

  private func stage(_ record: CKRecord, into store: ProgressStore) throws {
    let metadata = try Self.decode(record)
    var data: Data?
    if metadata.kind == "ProgressBackup" {
      if let url = (record["asset"] as? CKAsset)?.fileURL {
        // A local delivery/read error is not evidence of damaged server bytes.
        // Fail staging so the engine's previous durable cursor can replay this record.
        do {
          guard let size = try url.resourceValues(forKeys: [.fileSizeKey]).fileSize else {
            throw ProgressCloudError.storage
          }
          if size <= ProgressStore.maxBytes, size == metadata.bytes {
            data = try Data(contentsOf: url)
          }
        } catch { throw ProgressCloudError.storage }
      }
    }
    try store.receive(metadata, asset: data)
  }
  static func encode(_ value: BackupRecord, asset: URL?) throws -> CKRecord {
    let id = CKRecord.ID(recordName: value.id, zoneID: zone)
    let record: CKRecord
    if let data = value.systemFields {
      let coder = try NSKeyedUnarchiver(forReadingFrom: data)
      coder.requiresSecureCoding = true
      defer { coder.finishDecoding() }
      guard let decoded = CKRecord(coder: coder), decoded.recordID == id else { throw ProgressCloudError.corrupt }
      record = decoded
    } else { record = CKRecord(recordType: value.kind, recordID: id) }
    record["schemaVersion"] = 1 as NSNumber
    record["writer"] = value.writer as NSString
    record["revision"] = value.revision as NSNumber
    record["createdAt"] = value.createdAt as NSString
    if value.kind == "ProgressBackup" {
      record["generation"] = value.id as NSString
      record["hash"] = value.hash as NSString
      record["bytes"] = value.bytes as NSNumber
      guard let asset else { throw ProgressCloudError.corrupt }
      record["asset"] = CKAsset(fileURL: asset)
    } else {
      record["currentID"] = value.current?.id as NSString?
      record["currentHash"] = value.current?.hash as NSString?
      record["previousID"] = value.previous?.id as NSString?
      record["previousHash"] = value.previous?.hash as NSString?
    }
    return record
  }
  static func decode(_ record: CKRecord) throws -> BackupRecord {
    guard record.recordID.zoneID == zone, record["schemaVersion"] as? Int == 1,
          let writer = record["writer"] as? String, UUID(uuidString: writer) != nil,
          let revision = record["revision"] as? Int, revision >= 0, revision <= 9_007_199_254_740_991,
          let createdAt = record["createdAt"] as? String,
          ISO8601DateFormatter().date(from: createdAt) != nil else { throw ProgressCloudError.corrupt }
    let coder = NSKeyedArchiver(requiringSecureCoding: true)
    record.encodeSystemFields(with: coder); coder.finishEncoding()
    var value = BackupRecord(id: record.recordID.recordName, kind: record.recordType, writer: writer,
      revision: revision, createdAt: createdAt, systemFields: coder.encodedData)
    if record.recordType == "ProgressBackup" {
      guard let hash = record["hash"] as? String, validHash(hash), let bytes = record["bytes"] as? Int,
            bytes > 0, bytes <= ProgressStore.maxBytes,
            UUID(uuidString: value.id) != nil, record["generation"] as? String == value.id
      else { throw ProgressCloudError.corrupt }
      value.hash = hash; value.bytes = bytes
    } else if record.recordType == "ProgressBackupHead" {
      guard value.id == "head-" + writer, let id = record["currentID"] as? String,
            UUID(uuidString: id) != nil, let hash = record["currentHash"] as? String, validHash(hash)
      else { throw ProgressCloudError.corrupt }
      value.current = BackupReference(id: id, hash: hash)
      if record["previousID"] != nil || record["previousHash"] != nil {
        guard let previous = record["previousID"] as? String, UUID(uuidString: previous) != nil,
              previous != id, let hash = record["previousHash"] as? String, validHash(hash)
        else { throw ProgressCloudError.corrupt }
        value.previous = BackupReference(id: previous, hash: hash)
      }
    } else { throw ProgressCloudError.corrupt }
    return value
  }
  private static func validHash(_ value: String) -> Bool {
    value.count == 64 && value.utf8.allSatisfy { (48...57).contains($0) || (97...102).contains($0) }
  }
  private static func samePayload(_ left: CKRecord, _ right: CKRecord) throws -> Bool {
    try decode(left).hasSamePayload(as: decode(right))
  }
  static func sanitize(_ error: Error) -> ProgressCloudError {
    if let error = error as? ProgressCloudError { return error }
    guard let error = error as? CKError else { return .storage }
    switch error.code {
    case .quotaExceeded: return .quota
    case .permissionFailure, .notAuthenticated: return .permission
    case .serverRecordChanged: return .conflict
    case .badContainer, .badDatabase, .missingEntitlement: return .unavailable
    case .invalidArguments, .assetFileNotFound, .assetFileModified: return .corrupt
    default: return .offline
    }
  }
}
