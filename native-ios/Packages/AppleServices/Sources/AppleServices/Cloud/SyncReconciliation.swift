import Foundation
import LearningDomain

extension SyncCoordinator {
    /// Returns whether exact-authority cleanup remains pending after a verified publication.
    func reconcile(generation: UUID, lease: ServiceProfileLease, guest: Data?) async throws -> Bool {
        guard let scope = lease.scope else { throw ProgressCloudError.unavailable }
        for attempt in 0..<3 {
            do {
                let heads = try await transport.list(scope: scope)
                try check(generation)
                let base = try headToken(heads)
                var payloads: [Data] = []
                var totalBytes = 0
                for head in heads {
                    let payload = try await transport.read(scope: scope, id: head.id)
                    try check(generation)
                    totalBytes += payload.count
                    guard totalBytes <= 67_108_864 else { throw ProgressCloudError.tooLarge }
                    let backup = try LearningBackupCodec.decode(payload)
                    guard backup.resetGeneration == head.resetGeneration else { throw ProgressCloudError.corrupt }
                    payloads.append(try LearningBackupCodec.encode(backup))
                }
                let latest = try await transport.list(scope: scope)
                try check(generation)
                guard sameHeads(heads, latest) else { throw ProgressCloudError.conflict }
                let local = try await store.exportServiceBackup(lease)
                try check(generation)
                if local.resetGeneration != nil && heads.first?.resetGeneration == nil { throw ProgressCloudError.corrupt }
                // Validate the complete proposed import before adopting any reset boundary.
                // Ordinary guest history must never bypass a remote reset generation.
                var candidate = try LearningBackupCodec.decode(payloads.first ?? local.payload)
                for payload in payloads.dropFirst() { candidate = try candidate.merged(with: LearningBackupCodec.decode(payload)) }
                if let guest {
                    guard totalBytes + guest.count <= 67_108_864 else { throw ProgressCloudError.tooLarge }
                    _ = try candidate.merged(with: LearningBackupCodec.decode(guest))
                }
                let state = try await store.serviceState(lease)
                try check(generation)
                if let remoteGeneration = heads.first?.resetGeneration,
                   local.resetGeneration != remoteGeneration || state.resetIntent?.kind == .remoteBoundary {
                    guard heads.count == 1, let payload = payloads.first, let remoteID = UUID(uuidString: remoteGeneration) else { throw ProgressCloudError.corrupt }
                    try await prepareBoundary()
                    try check(generation)
                    await store.revoke(profileID: lease.profileID)
                    try check(generation)
                    let request = state.resetIntent?.requestID ?? remoteID
                    _ = try await store.beginHistoryReset(.remoteBoundary, requestID: request, lease: lease)
                    try check(generation)
                    try await store.acceptResetAuthority(requestID: request, generation: remoteGeneration, lease: lease)
                    try check(generation)
                    _ = try await store.adoptReset(payload, lease: lease, expectedGeneration: local.resetGeneration)
                    try check(generation)
                    try await store.finishHistoryReset(requestID: request, lease: lease)
                    try check(generation)
                }
                if let guest { payloads.append(guest) }
                _ = try await store.mergeBackups(payloads, lease: lease)
                try check(generation)
                let exported = try await store.exportServiceBackup(lease)
                try check(generation)
                if heads.count == 1, !heads[0].legacy, payloads.first == exported.payload {
                    try await store.acknowledgeService(lease, revision: exported.revision, baseToken: base)
                    try check(generation)
                    if heads[0].cleanupPending || heads[0].pendingPublication != nil {
                        let pending = heads[0].pendingPublication
                        return try await transport.cleanupAdopted(scope: scope, base: base, abandoned: pending == base ? nil : pending)
                    }
                    return false
                }
                let result = try await transport.publish(scope: scope, revision: exported.revision, payload: exported.payload, base: base)
                try check(generation)
                guard !result.token.isEmpty, result.resetGeneration == exported.resetGeneration else { throw ProgressCloudError.corrupt }
                try await store.acknowledgeService(lease, revision: exported.revision, baseToken: result.token)
                try check(generation)
                return result.cleanupPending
            } catch ProgressCloudError.conflict {
                try check(generation)
                if attempt == 2 { throw ProgressCloudError.conflict }
            }
        }
        throw ProgressCloudError.conflict
    }
    func headToken(_ heads: [CloudBackup]) throws -> String {
        guard heads.count <= 256 else { throw ProgressCloudError.tooLarge }
        guard let first = heads.first else { return "" }
        guard !first.token.isEmpty, Set(heads.map(\.id)).count == heads.count,
              heads.allSatisfy({ $0.token == first.token }),
              heads.count == 1 || heads.allSatisfy(\.legacy),
              first.resetGeneration == nil || (heads.count == 1 && !first.legacy) else { throw ProgressCloudError.corrupt }
        return first.token
    }
    func sameHeads(_ lhs: [CloudBackup], _ rhs: [CloudBackup]) -> Bool {
        lhs.sorted { $0.id < $1.id } == rhs.sorted { $0.id < $1.id }
    }
}
