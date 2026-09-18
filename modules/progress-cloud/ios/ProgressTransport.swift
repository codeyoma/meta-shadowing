import Foundation

typealias CloudCancellation = @MainActor @Sendable () async -> Void

/// Only the external CloudKit seam is replaced by native tests.
@MainActor
protocol ProgressCloudService: AnyObject {
  func identity() async throws -> String
  func fetch(into store: ProgressStore) async throws
  func save(_ record: BackupRecord, asset: URL?, store: ProgressStore) async throws -> BackupRecord
  func savePublication(_ backup: BackupRecord, head: BackupRecord, asset: URL, store: ProgressStore) async throws -> BackupRecord
  func delete(_ id: String, store: ProgressStore) async throws
  func suspend() -> CloudCancellation
}

@MainActor
final class ProgressTransport {
  static let sharedHead = "head-account-v1"
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
  func reset(scope: String, requestId: String, expectedGeneration: String, json: String) async throws -> CloudPublication {
    guard !publishing, !fetching else { throw ProgressCloudError.busy }
    guard scope == self.scope else { throw ProgressCloudError.accountChanged }
    guard expectedGeneration.isEmpty || UUID(uuidString: expectedGeneration) != nil,
          requestId != expectedGeneration else { throw ProgressCloudError.corrupt }
    let data = Data(json.utf8)
    try ProgressEnvelope.validateReset(data, requestId: requestId)
    if let intent = store.state.resetIntent, intent.requestId == requestId {
      guard intent.expectedGeneration == expectedGeneration else { throw ProgressCloudError.conflict }
    } else {
      guard store.state.resetIntent?.completed != false else { throw ProgressCloudError.busy }
      // No await precedes the durable destructive identity. Retry never creates
      // a fresh request or silently changes the expected generation.
      try store.update { $0.resetIntent = ResetIntent(requestId: requestId, expectedGeneration: expectedGeneration) }
    }
    publishing = true; defer { publishing = false }
    let ticket = epoch
    try await verify(scope, ticket)
    try await cloud.fetch(into: store)
    try await verify(scope, ticket)
    _ = try candidates()
    try importCleanupAuthority()
    let generation = store.state.records[Self.sharedHead]?.resetGeneration ?? ""
    if generation != expectedGeneration {
      guard !generation.isEmpty else { throw ProgressCloudError.corrupt }
      // A retry (even after later learning) or a concurrent winning reset adopts
      // the current boundary. It never republishes this request's empty payload.
      try await adoptResetCleanup(scope: scope, ticket: ticket, generation: generation)
      guard let ref = store.state.records[Self.sharedHead]?.current,
            let backup = store.state.records[ref.id] else { throw ProgressCloudError.corrupt }
      return try await finishReset(backup, scope: scope, ticket: ticket)
    }
    guard store.state.resetIntent?.acceptedGeneration == nil else { throw ProgressCloudError.conflict }
    let committed = try await publishFetched(scope: scope, revision: 0, data: data,
      base: currentToken(), ticket: ticket, resetRequestId: requestId)
    let result = try currentResetPublication(cleanupPending: committed.cleanupPending)
    try store.update {
      $0.resetIntent?.acceptedGeneration = result.resetGeneration
      $0.resetIntent?.completed = !result.cleanupPending
      $0.observedResetGeneration = result.resetGeneration
    }
    return result
  }

  private func finishReset(_ backup: BackupRecord, scope: String, ticket: UUID) async throws -> CloudPublication {
    let cleaned = try await publication(backup, scope: scope, ticket: ticket)
    let result = try currentResetPublication(cleanupPending: cleaned.cleanupPending)
    try store.update {
      $0.resetIntent?.acceptedGeneration = result.resetGeneration
      $0.resetIntent?.completed = !result.cleanupPending
    }
    return result
  }

  private func currentResetPublication(cleanupPending: Bool) throws -> CloudPublication {
    // Cleanup awaits may observe legitimate learning or a later reset. Return
    // that verified current snapshot, never the now-superseded empty reset asset.
    guard let current = try candidates().first, current.resetGeneration != nil else { throw ProgressCloudError.corrupt }
    return CloudPublication(id: current.id, createdAt: current.createdAt, revision: current.revision,
      token: current.token, cleanupPending: cleanupPending, resetGeneration: current.resetGeneration)
  }

  private func adoptResetCleanup(scope: String, ticket: UUID, generation: String) async throws {
    guard var head = store.state.records[Self.sharedHead], let ref = head.current else { throw ProgressCloudError.corrupt }
    let pending = store.state.pending
    let abandon = pending.flatMap { value -> String? in
      guard value.backup.id != ref.id,
        value.backup.resetGeneration != generation || value.resetRequestId == store.state.resetIntent?.requestId else { return nil }
      return value.backup.id
    }
    var manifest = try head.cleanupManifest.map(CleanupManifest.decode) ?? CleanupManifest(heads: [], assets: [])
    // Reset authority includes exact fetched old-generation immutable assets,
    // including orphaned uploads whose old-generation head can no longer commit.
    let old = store.state.records.values.filter { $0.kind == "ProgressBackup" && ($0.resetGeneration ?? "") != generation }.map(\.id)
    let assets = Array(Set(manifest.assets.filter { store.state.records[$0] != nil } + old + [abandon].compactMap { $0 })).sorted()
    manifest.assets = assets
    let json = try manifest.encoded()
    if json != head.cleanupManifest {
      head.cleanupManifest = json
      let saved = try await cloud.save(head, asset: nil, store: store)
      try await verify(scope, ticket)
      guard saved.hasSamePayload(as: head) else { throw ProgressCloudError.conflict }
      head = saved
    }
    try store.update {
      $0.records[head.id] = head
      $0.cleanup = Array(Set($0.cleanup + assets)).sorted()
      if let pending, pending.backup.id == ref.id || pending.backup.id == abandon { $0.pending = nil }
      $0.resetIntent?.acceptedGeneration = generation
    }
  }
  private func verify(_ scope: String, _ ticket: UUID) async throws {
    guard scope == self.scope, ticket == epoch else { throw ProgressCloudError.accountChanged }
    let identity = try await cloud.identity()
    guard scope == identity, ticket == epoch else { throw ProgressCloudError.accountChanged }
  }
  func suspend() -> CloudCancellation { epoch = UUID(); return cloud.suspend() }
  func stop() async { let cancel = suspend(); await cancel() }
  private var heads: [BackupRecord] {
    store.state.records.values.filter { $0.kind == "ProgressBackupHead" && $0.retired != true }
  }
  private func currentToken() throws -> String {
    if let head = store.state.records[Self.sharedHead] {
      guard head.retired != true, head.previous == nil, let current = head.current else { throw ProgressCloudError.corrupt }
      return current.id
    }
    guard !heads.isEmpty else { return "" }
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    let snapshot = heads.sorted { $0.id < $1.id }.map { head in
      var value = head; value.systemFields = nil; return value
    }
    return "legacy-" + ProgressStore.hash(try encoder.encode(snapshot))
  }
  private func importCleanupAuthority() throws {
    guard let head = store.state.records[Self.sharedHead], let json = head.cleanupManifest else { return }
    let manifest = try CleanupManifest.decode(json)
    try store.update { state in
      var legacy = state.retirementHeads ?? [:]
      for original in manifest.heads where state.records[original.id]?.retired != true {
        if legacy[original.id] == nil { legacy[original.id] = original }
      }
      state.retirementHeads = legacy
      state.cleanup = Array(Set(state.cleanup + manifest.assets.filter { state.records[$0] != nil })).sorted()
    }
  }
  func list(scope: String) async throws -> [CloudBackup] {
    guard !publishing, !fetching else { throw ProgressCloudError.busy }
    fetching = true; defer { fetching = false }
    let ticket = epoch
    try await verify(scope, ticket)
    try await cloud.fetch(into: store)
    try await verify(scope, ticket)
    try importCleanupAuthority()
    return try candidates()
  }
  private func candidates() throws -> [CloudBackup] {
    let singleton = store.state.records[Self.sharedHead]
    if store.state.observedResetGeneration != nil, singleton?.resetGeneration == nil { throw ProgressCloudError.corrupt }
    let selected = singleton.map { [$0] } ?? heads
    let token = try currentToken()
    var corrupt = false
    let backups = selected.flatMap { head -> [CloudBackup] in
      if head.current == nil || head.retired == true || (singleton != nil && head.previous != nil) { corrupt = true }
      return [head.current, head.previous].compactMap { reference in
        guard let reference else { return nil }
        guard let backup = store.state.records[reference.id], backup.kind == "ProgressBackup",
              backup.writer == head.writer, backup.hash == reference.hash,
              backup.resetGeneration == head.resetGeneration else { corrupt = true; return nil }
        if reference == head.current && (backup.revision != head.revision || backup.createdAt != head.createdAt) {
          corrupt = true; return nil
        }
        do {
          if head.resetGeneration != nil {
            guard try ProgressEnvelope.generation(store.asset(backup)) == head.resetGeneration else { corrupt = true; return nil }
          } else if let data = try? store.asset(backup), try !ProgressEnvelope.generation(data).isEmpty {
            corrupt = true; return nil
          }
        } catch { corrupt = true; return nil }
        return CloudBackup(id: backup.id, createdAt: backup.createdAt, revision: backup.revision,
          token: token, legacy: singleton == nil, cleanupPending: singleton != nil && cleanupPending,
          pendingPublication: store.state.pending?.backup.id, resetGeneration: backup.resetGeneration)
      }
    }.sorted { $0.id < $1.id }
    if corrupt { throw ProgressCloudError.corrupt }
    if let generation = singleton?.resetGeneration, store.state.observedResetGeneration != generation {
      try store.update { $0.observedResetGeneration = generation }
    }
    return backups
  }
  func read(scope: String, id: String) async throws -> String {
    let choices = try await list(scope: scope)
    // Another device may replace a valid candidate between list and read. The
    // coordinator must refetch/merge that new head, not report damaged data.
    guard choices.contains(where: { $0.id == id }) else { throw ProgressCloudError.conflict }
    guard let record = store.state.records[id] else { throw ProgressCloudError.corrupt }
    return String(decoding: try store.asset(record), as: UTF8.self)
  }
  func publish(scope: String, revision: Int, json: String, base: String) async throws -> CloudPublication {
    guard !publishing, !fetching else { throw ProgressCloudError.busy }
    publishing = true; defer { publishing = false }
    let ticket = epoch, data = Data(json.utf8)
    guard revision >= 0, revision <= 9_007_199_254_740_991, !data.isEmpty,
          data.count <= ProgressStore.maxBytes else { throw ProgressCloudError.tooLarge }
    guard (try? JSONSerialization.jsonObject(with: data)) != nil else { throw ProgressCloudError.corrupt }
    guard store.state.resetIntent?.completed != false else { throw ProgressCloudError.busy }
    try await verify(scope, ticket)
    try await cloud.fetch(into: store)
    try await verify(scope, ticket)
    _ = try candidates()
    try importCleanupAuthority()
    let generation = try ProgressEnvelope.generation(data)
    guard generation == (store.state.records[Self.sharedHead]?.resetGeneration ?? "") else { throw ProgressCloudError.conflict }
    return try await publishFetched(scope: scope, revision: revision, data: data, base: base, ticket: ticket)
  }
  private func publishFetched(scope: String, revision: Int, data: Data, base: String,
    ticket: UUID, resetRequestId: String? = nil) async throws -> CloudPublication {
    let generation = try ProgressEnvelope.generation(data)
    let token = try currentToken(), hash = ProgressStore.hash(data)
    func matches(_ pending: PendingBackup) -> Bool {
      pending.backup.revision == revision && pending.backup.hash == hash && pending.expectedBase == base
        && pending.resetRequestId == resetRequestId
        && (try? store.asset(pending.backup)) == data
    }
    // A lost bridge reply or a crash after server acknowledgement is idempotent.
    if let ack = store.state.acknowledged, matches(ack), token == ack.backup.id {
      return try await publication(ack.backup, scope: scope, ticket: ticket)
    }
    if let pending = store.state.pending, matches(pending), token == pending.backup.id,
       let head = store.state.records[Self.sharedHead] {
      // Cleanup metadata may change after this publication committed. Compare
      // progress only, but retain the freshly fetched head and cleanup authority.
      var progress = head
      progress.cleanupManifest = pending.head.cleanupManifest
      if progress.hasSamePayload(as: pending.head) {
        try acknowledge(pending, head: head)
        return try await publication(pending.backup, scope: scope, ticket: ticket)
      }
    }
    guard base == token else { throw ProgressCloudError.conflict }
    if let pending = store.state.pending, matches(pending) {
      try refreshPendingMetadata(pending)
      return try await finishPending(scope: scope, ticket: ticket)
    }
    // Only a caller with a freshly confirmed base may replace stale pending intent.
    let abandoned = store.state.pending?.backup.id
    let existing = store.state.records[Self.sharedHead], writer = store.state.writer
    // Retry acknowledged current bytes using the adopted current base: cleanup only.
    if let existing, let ref = existing.current, let backup = store.state.records[ref.id],
       backup.writer == writer, backup.revision == revision, backup.hash == hash,
       (try? store.asset(backup)) == data {
      return try await publication(backup, scope: scope, ticket: ticket)
    }
    let backup = BackupRecord(id: UUID().uuidString, kind: "ProgressBackup", writer: writer,
      revision: revision, createdAt: ISO8601DateFormatter().string(from: Date()), hash: hash, bytes: data.count,
      resetGeneration: generation.isEmpty ? nil : generation)
    var head = BackupRecord(id: Self.sharedHead, kind: "ProgressBackupHead", writer: writer,
      revision: revision, createdAt: backup.createdAt, current: BackupReference(id: backup.id, hash: hash),
      systemFields: existing?.systemFields, changeTag: existing?.changeTag,
      resetGeneration: backup.resetGeneration)
    let legacy = existing == nil ? heads : []
    let superseded = [existing?.current?.id, abandoned].compactMap { $0 }
      + legacy.flatMap { [$0.current?.id, $0.previous?.id].compactMap { $0 } }
    let retirements = Array((store.state.retirementHeads ?? [:]).values) + legacy
    let resetAssets = resetRequestId == nil ? [] : store.state.records.values.filter { $0.kind == "ProgressBackup" }.map(\.id)
    let assets = Array(Set(store.state.cleanup + superseded + resetAssets)).sorted()
    head.cleanupManifest = try CleanupManifest(heads: retirements.sorted { $0.id < $1.id }, assets: assets).encoded()
    try store.stage(backup, asset: data)
    try store.update {
      $0.pending = PendingBackup(backup: backup, head: head, expectedBase: base,
        retirements: retirements, superseded: assets, resetRequestId: resetRequestId)
    }
    return try await finishPending(scope: scope, ticket: ticket)
  }
  /// Called only after a verified fetch and expected-progress-base equality.
  /// Cleanup can change the head's CAS metadata without changing its progress.
  private func refreshPendingMetadata(_ pending: PendingBackup) throws {
    guard let current = store.state.records[Self.sharedHead],
          pending.expectedBase == current.current?.id else { return }
    var head = pending.head
    head.systemFields = current.systemFields
    head.changeTag = current.changeTag
    var retirements: [String: BackupRecord] = [:]
    for original in pending.retirements ?? [] { retirements[original.id] = original }
    for (id, original) in store.state.retirementHeads ?? [:] where retirements[id] == nil {
      retirements[id] = original
    }
    let heads = retirements.values.sorted { $0.id < $1.id }
    let assets = Array(Set((pending.superseded ?? []) + store.state.cleanup)).sorted()
    head.cleanupManifest = try CleanupManifest(heads: heads, assets: assets).encoded()
    // Persist fresh conditional metadata and its exact cleanup authority together;
    // a later CAS race still conflicts and the next explicit retry fetches again.
    try store.update {
      $0.pending = PendingBackup(backup: pending.backup, head: head,
        assetAcknowledged: pending.assetAcknowledged, expectedBase: pending.expectedBase,
        retirements: heads, superseded: assets, resetRequestId: pending.resetRequestId)
    }
  }
  private func finishPending(scope: String, ticket: UUID) async throws -> CloudPublication {
    guard let pending = store.state.pending else { throw ProgressCloudError.storage }
    guard pending.expectedBase == (try currentToken()) else { throw ProgressCloudError.conflict }
    _ = try store.asset(pending.backup)
    // Asset creation and head CAS are one server transaction. A stale publisher
    // cannot create an orphan after a reset has completed its deletion sweep.
    // Old split-publication caches may already contain this immutable asset;
    // reuse fetched system fields without changing the original logical intent.
    var backup = pending.backup
    if let fetched = store.state.records[backup.id], fetched.hasSamePayload(as: backup) { backup = fetched }
    let head = try await cloud.savePublication(backup, head: pending.head,
      asset: store.assetURL(backup.id), store: store)
    try await verify(scope, ticket)
    guard head.hasSamePayload(as: pending.head) else { throw ProgressCloudError.conflict }
    try acknowledge(pending, head: head)
    return try await publication(pending.backup, scope: scope, ticket: ticket)
  }
  private func acknowledge(_ pending: PendingBackup, head: BackupRecord) throws {
    // Commit acknowledgement and exact cleanup authority persist atomically.
    try store.update { state in
      state.records[head.id] = head; state.acknowledged = pending; state.pending = nil
      state.cleanup = Array(Set(state.cleanup + (pending.superseded ?? []))).sorted()
      var retirementHeads = state.retirementHeads ?? [:]
      for head in pending.retirements ?? [] { retirementHeads[head.id] = head }
      state.retirementHeads = retirementHeads
    }
  }
  private func publication(_ backup: BackupRecord, scope: String, ticket: UUID) async throws -> CloudPublication {
    var incomplete = false
    do { incomplete = try await cleanup(scope: scope, ticket: ticket) }
    catch {
      // Cleanup failure cannot undo a commit. Account replacement still invalidates it.
      try await verify(scope, ticket)
      incomplete = true
    }
    try await verify(scope, ticket)
    return CloudPublication(id: backup.id, createdAt: backup.createdAt, revision: backup.revision,
      token: backup.id, cleanupPending: incomplete, resetGeneration: backup.resetGeneration)
  }
  /// The caller durably adopted `base` and captured this exact native pending ID
  /// before activation. Retire its intent, never rebase or republish its progress.
  func cleanupAdopted(scope: String, base: String, abandoned: String?) async throws -> Bool {
    guard !publishing, !fetching else { throw ProgressCloudError.busy }
    publishing = true; defer { publishing = false }
    let ticket = epoch
    try await verify(scope, ticket)
    try await cloud.fetch(into: store)
    try await verify(scope, ticket)
    _ = try candidates()
    guard base == (try currentToken()), var head = store.state.records[Self.sharedHead],
          let ref = head.current, let current = store.state.records[ref.id] else { throw ProgressCloudError.conflict }
    _ = try store.asset(current)
    try importCleanupAuthority()
    if let abandoned, let pending = store.state.pending, pending.backup.id == abandoned {
      // A committed pending asset is current, not abandoned. Lost publication
      // acknowledgements must continue through the existing acknowledgement path.
      guard abandoned != ref.id, !heads.contains(where: { $0.current?.id == abandoned || $0.previous?.id == abandoned })
      else { throw ProgressCloudError.conflict }
      var manifest = try head.cleanupManifest.map(CleanupManifest.decode) ?? CleanupManifest(heads: [], assets: [])
      // Drop already-confirmed deletions so repeated metadata-only adoptions do
      // not exhaust the bounded manifest without a new progress publication.
      manifest.assets = Array(Set(manifest.assets.filter { store.state.records[$0] != nil } + [abandoned])).sorted()
      head.cleanupManifest = try manifest.encoded()
      // Metadata-only CAS carries the existing progress reference/revision/date.
      // If it races or crashes, original expectedBase and pending remain intact.
      let saved = try await cloud.save(head, asset: nil, store: store)
      try await verify(scope, ticket)
      guard saved.hasSamePayload(as: head) else { throw ProgressCloudError.conflict }
      try store.update { state in
        state.records[head.id] = saved
        state.cleanup = Array(Set(state.cleanup + [abandoned])).sorted()
        state.pending = nil
      }
    } else if let abandoned {
      let manifest = try head.cleanupManifest.map(CleanupManifest.decode)
      // A replay may find a completed retirement. Never grant fresh authority
      // from an arbitrary caller ID or from an unrelated active pending intent.
      guard manifest?.assets.contains(abandoned) == true || store.state.records[abandoned] == nil
      else { throw ProgressCloudError.conflict }
    }
    do { return try await cleanup(scope: scope, ticket: ticket) }
    catch { try await verify(scope, ticket); return true }
  }
  private func cleanup(scope: String, ticket: UUID) async throws -> Bool {
    try await cloud.fetch(into: store)
    try await verify(scope, ticket)
    _ = try candidates()
    try importCleanupAuthority()
    guard let shared = store.state.records[Self.sharedHead], let ref = shared.current,
          let current = store.state.records[ref.id] else { throw ProgressCloudError.corrupt }
    _ = try store.asset(current)
    // Legacy mutable heads are CAS-tombstoned, never deleted by an unguarded ID.
    for (id, original) in store.state.retirementHeads ?? [:] {
      if let live = store.state.records[id], live.retired != true {
        guard live.hasSamePayload(as: original), live.changeTag == original.changeTag else { continue }
        var tombstone = original
        tombstone.current = nil; tombstone.previous = nil; tombstone.retired = true
        let saved = try await cloud.save(tombstone, asset: nil, store: store)
        try await verify(scope, ticket)
        guard saved.hasSamePayload(as: tombstone) else { throw ProgressCloudError.conflict }
        try store.stage(saved)
      }
      try store.update { $0.retirementHeads?.removeValue(forKey: id) }
    }
    for id in store.state.cleanup {
      try await cloud.fetch(into: store)
      try await verify(scope, ticket)
      guard store.state.pending?.backup.id != id,
            !heads.contains(where: { $0.current?.id == id || $0.previous?.id == id }) else { continue }
      if let record = store.state.records[id] {
        guard record.kind == "ProgressBackup" else { throw ProgressCloudError.conflict }
        try await cloud.delete(id, store: store)
        try await verify(scope, ticket)
      }
      try store.remove(id)
    }
    return cleanupPending
  }
  private var cleanupPending: Bool {
    !store.state.cleanup.isEmpty || !(store.state.retirementHeads ?? [:]).isEmpty
      || heads.contains(where: { $0.id != Self.sharedHead })
      || (store.state.pending.map { $0.backup.id != store.state.records[Self.sharedHead]?.current?.id
        && $0.expectedBase != store.state.records[Self.sharedHead]?.current?.id } ?? false)
  }
}
