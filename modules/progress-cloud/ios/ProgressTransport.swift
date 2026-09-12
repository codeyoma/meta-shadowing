import Foundation

/// Only the external CloudKit seam is replaced by native tests.
@MainActor
protocol ProgressCloudService: AnyObject {
  func identity() async throws -> String
  func fetch(into store: ProgressStore) async throws
  func save(_ record: BackupRecord, asset: URL?, store: ProgressStore) async throws -> BackupRecord
  func delete(_ id: String, store: ProgressStore) async throws
  func stop() async
}

@MainActor
final class ProgressTransport {
  let store: ProgressStore
  let scope: String
  private let cloud: any ProgressCloudService
  private var epoch = UUID()
  private var publishing = false
  private var fetching = false

  init(directory: URL, scope: String, cloud: any ProgressCloudService) throws {
    self.store = try ProgressStore(directory: directory)
    self.scope = scope
    self.cloud = cloud
  }
  var pendingRevision: Int? { store.state.pending?.backup.revision }
  private func verify(_ scope: String, _ ticket: UUID) async throws {
    guard scope == self.scope, ticket == epoch else { throw ProgressCloudError.accountChanged }
    let identity = try await cloud.identity()
    guard scope == identity, ticket == epoch else { throw ProgressCloudError.accountChanged }
  }
  func stop() async {
    epoch = UUID()
    await cloud.stop()
  }
  func list(scope: String) async throws -> [CloudBackup] {
    guard !publishing, !fetching else { throw ProgressCloudError.busy }
    fetching = true
    defer { fetching = false }
    let ticket = epoch
    try await verify(scope, ticket)
    try await cloud.fetch(into: store)
    try await verify(scope, ticket)
    return try candidates()
  }
  private func candidates() throws -> [CloudBackup] {
    try store.state.records.values.filter { $0.kind == "ProgressBackupHead" }
      .flatMap { head in
        guard head.current != nil else { throw ProgressCloudError.corrupt }
        return try [head.current, head.previous].compactMap { reference -> CloudBackup? in
        guard let reference else { return nil }
        guard let backup = store.state.records[reference.id],
              backup.kind == "ProgressBackup", backup.writer == head.writer,
              backup.hash == reference.hash else { throw ProgressCloudError.corrupt }
        if reference == head.current {
          guard backup.revision == head.revision, backup.createdAt == head.createdAt else { throw ProgressCloudError.corrupt }
        }
        return CloudBackup(id: backup.id, createdAt: backup.createdAt, revision: backup.revision)
      } }.sorted { $0.createdAt > $1.createdAt }
  }
  func read(scope: String, id: String) async throws -> String {
    let candidates = try await list(scope: scope)
    guard candidates.contains(where: { $0.id == id }), let record = store.state.records[id]
    else { throw ProgressCloudError.corrupt }
    return String(decoding: try store.asset(record), as: UTF8.self)
  }
  func publish(scope: String, revision: Int, json: String) async throws -> Int {
    guard !publishing, !fetching else { throw ProgressCloudError.busy }
    publishing = true
    defer { publishing = false }
    let ticket = epoch
    let data = Data(json.utf8)
    guard revision >= 0, revision <= 9_007_199_254_740_991, !data.isEmpty,
          data.count <= ProgressStore.maxBytes else { throw ProgressCloudError.tooLarge }
    guard (try? JSONSerialization.jsonObject(with: data)) != nil else { throw ProgressCloudError.corrupt }
    try await verify(scope, ticket)
    // A successful initial fetch is mandatory even when this installation has no head.
    try await cloud.fetch(into: store)
    try await verify(scope, ticket)
    _ = try candidates()
    let hash = ProgressStore.hash(data)
    if let pending = store.state.pending {
      // Explicit activation of this same scope may finish older durable work first.
      // Its acknowledgement never acknowledges the newly submitted payload.
      let pendingData = try store.asset(pending.backup)
      let same = pending.backup.revision == revision && pending.backup.hash == hash && pendingData == data
      try await finishPending(scope: scope, ticket: ticket)
      if same { return revision }
    }
    do {
      let writer = store.state.writer
      let existing = store.state.records["head-" + writer]
      if let reference = existing?.current, let backup = store.state.records[reference.id],
         backup.revision == revision, backup.hash == hash, reference.hash == hash,
         (try? store.asset(backup)) == data {
        try await cleanup(scope: scope, ticket: ticket)
        return revision
      }
      let backup = BackupRecord(id: UUID().uuidString, kind: "ProgressBackup", writer: writer,
        revision: revision, createdAt: ISO8601DateFormatter().string(from: Date()), hash: hash, bytes: data.count)
      let head = BackupRecord(id: "head-" + writer, kind: "ProgressBackupHead", writer: writer,
        revision: revision, createdAt: backup.createdAt, current: BackupReference(id: backup.id, hash: hash),
        previous: existing?.current, systemFields: existing?.systemFields)
      try store.stage(backup, asset: data)
      try store.update { $0.pending = PendingBackup(backup: backup, head: head) }
    }
    try await finishPending(scope: scope, ticket: ticket)
    return revision
  }
  private func finishPending(scope: String, ticket: UUID) async throws {
    let pending = try requirePending()
    _ = try store.asset(pending.backup)
    if !pending.assetAcknowledged {
      let saved = try await cloud.save(pending.backup, asset: store.assetURL(pending.backup.id), store: store)
      try await verify(scope, ticket)
      guard saved.hasSamePayload(as: pending.backup) else { throw ProgressCloudError.conflict }
      try store.stage(saved)
      try store.update { $0.pending?.assetAcknowledged = true }
    }
    let savedHead = try await cloud.save(pending.head, asset: nil, store: store)
    try await verify(scope, ticket)
    guard savedHead.hasSamePayload(as: pending.head) else { throw ProgressCloudError.conflict }
    // Head acknowledgement and cleanup eligibility become durable together.
    try store.update { state in
      state.records[savedHead.id] = savedHead
      state.pending = nil
      let protected = Set(state.records.values.filter { $0.kind == "ProgressBackupHead" }
        .flatMap { [$0.current?.id, $0.previous?.id].compactMap { $0 } })
      state.cleanup = state.records.values.filter {
        $0.kind == "ProgressBackup" && $0.writer == state.writer && !protected.contains($0.id)
      }.map(\.id)
    }
    try await cleanup(scope: scope, ticket: ticket)
  }
  private func cleanup(scope: String, ticket: UUID) async throws {
    for id in store.state.cleanup.prefix(16) {
      try await verify(scope, ticket)
      try await cloud.delete(id, store: store)
      try await verify(scope, ticket)
      try store.remove(id)
    }
  }
  private func requirePending() throws -> PendingBackup {
    guard let pending = store.state.pending else { throw ProgressCloudError.storage }
    return pending
  }
}
