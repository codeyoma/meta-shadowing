import Foundation
import LearningDomain

extension SyncCoordinator {
    public func removeLocal(generation: UUID) async throws {
        try check(generation)
        guard !snapshot.busy else { throw ProgressCloudError.busy }
        snapshot.busy = true
        defer { finishOperation(generation) }
        do {
            try await prepareBoundary()
            try check(generation)
            if lease?.profileID != snapshot.profileID {
                let profileID = snapshot.profileID
                let scope = profileID == "local" ? nil : try await store.selectedServiceScope()
                try check(generation)
                guard profileID == "local" || scope != nil else { throw ProgressCloudError.accountChanged }
                let next = try await store.activateService(scope: scope)
                try check(generation)
                guard next.profileID == profileID else { throw ProgressCloudError.accountChanged }
                lease = next
            }
            guard let lease else { throw ProgressCloudError.unavailable }
            await store.revoke(profileID: lease.profileID)
            try check(generation)
            let state = try await store.serviceState(lease)
            try check(generation)
            let request = state.resetIntent?.requestID ?? UUID()
            _ = try await store.beginHistoryReset(.local, requestID: request, lease: lease)
            try check(generation)
            snapshot.enabled = false; snapshot.resetPending = true
            if let scope = lease.scope {
                try await transport.discardLocal(scope: scope)
                try check(generation)
            }
            _ = try await store.removeLocalHistory(requestID: request, lease: lease)
            try check(generation)
            snapshot.resetPending = false; snapshot.error = nil
        } catch {
            if snapshot.generation == generation { snapshot.error = serviceError(error) }
            throw error
        }
    }
    public func deleteCloud(generation: UUID) async throws {
        try check(generation)
        guard !snapshot.busy, let scope = snapshot.account.scope else { throw ProgressCloudError.unavailable }
        snapshot.busy = true
        defer { finishOperation(generation) }
        do {
            if lease?.scope != scope {
                let next = try await store.activateService(scope: scope)
                try check(generation)
                lease = next
            }
            guard let lease, lease.scope == scope else { throw ProgressCloudError.accountChanged }
            try await prepareBoundary()
            try check(generation)
            await store.revoke(profileID: lease.profileID)
            try check(generation)
            let state = try await store.serviceState(lease)
            try check(generation)
            let request = state.resetIntent?.requestID ?? UUID()
            _ = try await store.beginHistoryReset(.cloud, requestID: request, lease: lease)
            try check(generation)
            snapshot.enabled = false
            snapshot.resetPending = true
            try await finishCloudReset(lease: lease, generation: generation)
            snapshot.error = nil
        } catch {
            if snapshot.generation == generation { snapshot.error = serviceError(error) }
            throw error
        }
    }
    func finishCloudReset(lease: ServiceProfileLease, generation: UUID) async throws {
        guard let scope = lease.scope else { throw ProgressCloudError.unavailable }
        let state = try await store.serviceState(lease)
        try check(generation)
        guard let intent = state.resetIntent, intent.kind == .cloud else { throw ProgressCloudError.conflict }
        let localGeneration = try await store.exportServiceBackup(lease).resetGeneration
        try check(generation)
        let result = try await transport.reset(scope: scope, requestID: intent.requestID, expectedGeneration: intent.expectedGeneration,
                                               payload: resetPayload(intent.requestID))
        try check(generation)
        guard let accepted = result.resetGeneration, !result.token.isEmpty else { throw ProgressCloudError.corrupt }
        let payload = try await transport.read(scope: scope, id: result.id)
        try check(generation)
        guard try LearningBackupCodec.decode(payload).resetGeneration == accepted else { throw ProgressCloudError.corrupt }
        let heads = try await transport.list(scope: scope)
        try check(generation)
        guard heads.count == 1, !heads[0].legacy, heads[0].id == result.id,
              try headToken(heads) == result.token, heads[0].resetGeneration == accepted else { throw ProgressCloudError.conflict }
        try await store.acceptResetAuthority(requestID: intent.requestID, generation: accepted, lease: lease)
        try check(generation)
        let adopted = try await store.adoptReset(payload, lease: lease, expectedGeneration: localGeneration)
        try check(generation)
        let canonical = try LearningBackupCodec.encode(LearningBackupCodec.decode(payload))
        if adopted.payload == canonical {
            try await store.acknowledgeService(lease, revision: adopted.revision, baseToken: result.token)
            try check(generation)
        }
        snapshot.cleanupPending = result.cleanupPending || heads[0].cleanupPending
        if !snapshot.cleanupPending {
            try await store.finishHistoryReset(requestID: intent.requestID, lease: lease)
            try check(generation)
            snapshot.resetPending = false
        }
    }
    func resetPayload(_ request: UUID) throws -> Data {
        let raw = try JSONSerialization.data(withJSONObject: ["version": 5, "generation": request.uuidString.lowercased(),
            "progress": JSONSerialization.jsonObject(with: LearningBackupCodec.encode(.empty))])
        return try LearningBackupCodec.encode(LearningBackupCodec.decode(raw))
    }
}
