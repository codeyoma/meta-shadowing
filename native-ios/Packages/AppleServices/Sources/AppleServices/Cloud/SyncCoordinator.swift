import Foundation
import LearningDomain

public struct SyncSnapshot: Sendable {
    public init() {}
    public internal(set) var account: CloudAccount = .unknown
    public internal(set) var generation = UUID()
    public internal(set) var enabled = false
    public internal(set) var busy = false
    public internal(set) var profileID: String = "local"
    public internal(set) var error: ProgressCloudError?
    public internal(set) var cleanupPending = false
    public internal(set) var resetPending = false
}

public actor SyncCoordinator {
    let store: any ServiceProfileStore
    let transport: any CloudTransport
    var lease: ServiceProfileLease?
    let prepareBoundary: @Sendable () async throws -> Void
    var active = true
    var retryTask: Task<Void, Never>?
    var revisionTask: Task<Void, Never>?
    var dirty = false
    var retryCount = 0
    private var listeners: [UUID: AsyncStream<SyncSnapshot>.Continuation] = [:]
    public internal(set) var snapshot = SyncSnapshot() {
        didSet { for listener in listeners.values { listener.yield(snapshot) } }
    }

    public init(store: any ServiceProfileStore, transport: any CloudTransport, prepareBoundary: @escaping @Sendable () async throws -> Void = {}) {
        self.store = store; self.transport = transport
        self.prepareBoundary = prepareBoundary
    }
    public func refreshAccount() async {
        let generation = UUID()
        retryTask?.cancel(); retryTask = nil
        revisionTask?.cancel(); revisionTask = nil
        dirty = false; retryCount = 0
        snapshot.generation = generation
        snapshot.busy = true
        let previous = lease
        lease = nil
        if let previous { try? await store.invalidateService(previous) }
        guard snapshot.generation == generation else { return }
        await transport.stop()
        guard snapshot.generation == generation else { return }
        let account = await transport.account()
        guard snapshot.generation == generation else { return }
        snapshot.account = account
        snapshot.enabled = false
        snapshot.error = nil
        do {
            let guest = try await store.activateService(scope: nil)
            try check(generation)
            let guestState = try await store.serviceState(guest)
            try check(generation)
            if guestState.resetIntent?.kind == .local {
                lease = guest
                snapshot.profileID = guest.profileID
                snapshot.resetPending = true
                snapshot.busy = false
                try await removeLocal(generation: generation)
                return
            }
            // A failed account lookup is not a sign-out. Keep the last local profile
            // usable offline, but grant no cloud authority from remembered identity.
            if account == .unknown || account == .unavailable,
               let remembered = try await store.selectedServiceScope() {
                try check(generation)
                let next = try await store.activateService(scope: remembered)
                try check(generation)
                if snapshot.profileID != next.profileID {
                    try await prepareBoundary()
                    try check(generation)
                    await store.revoke(profileID: snapshot.profileID)
                    try check(generation)
                }
                lease = next
                snapshot.profileID = next.profileID
                let rememberedState = try await store.serviceState(next)
                try check(generation)
                snapshot.resetPending = rememberedState.resetIntent != nil
                snapshot.enabled = rememberedState.enabled
                snapshot.busy = false
                return
            }
            if let scope = account.scope {
                let next = try await store.activateService(scope: scope)
                try check(generation)
                let state = try await store.serviceState(next)
                try check(generation)
                let profileID = state.activated == true || state.resetIntent != nil ? next.profileID : "local"
                if profileID != snapshot.profileID {
                    try await prepareBoundary()
                    try check(generation)
                    await store.revoke(profileID: snapshot.profileID)
                    try check(generation)
                }
                lease = next
                snapshot.profileID = profileID
                snapshot.enabled = state.enabled
                snapshot.resetPending = state.resetIntent != nil
                try await store.selectServiceScope(profileID == "local" ? nil : scope)
                try check(generation)
            } else {
                if snapshot.profileID != "local" {
                    try await prepareBoundary()
                    try check(generation)
                    await store.revoke(profileID: snapshot.profileID)
                    try check(generation)
                }
                snapshot.profileID = "local"
                snapshot.resetPending = false
                if account == .noAccount { try await store.selectServiceScope(nil); try check(generation) }
            }
            snapshot.busy = false
            if snapshot.enabled || snapshot.resetPending { await retry() }
        } catch {
            if snapshot.generation == generation { snapshot.error = serviceError(error); snapshot.busy = false }
        }
    }
    public func stop() async {
        let generation = UUID()
        snapshot.generation = generation
        retryTask?.cancel(); retryTask = nil
        revisionTask?.cancel(); revisionTask = nil
        dirty = false; retryCount = 0
        snapshot.busy = false
        let previous = lease
        lease = nil
        if let previous { try? await store.invalidateService(previous) }
        guard snapshot.generation == generation else { return }
        await transport.stop()
    }
    public func enable(importGuest: Bool, generation: UUID) async throws {
        try await synchronize(importGuest: importGuest, generation: generation, enable: true)
    }
    public func refresh(importGuest: Bool? = nil, generation: UUID) async throws {
        try await synchronize(importGuest: importGuest, generation: generation, enable: false)
    }
    private func synchronize(importGuest: Bool?, generation: UUID, enable: Bool) async throws {
        try check(generation)
        guard !snapshot.busy else { throw ProgressCloudError.busy }
        guard let scope = snapshot.account.scope else { throw ProgressCloudError.unavailable }
        snapshot.busy = true
        defer { finishOperation(generation) }
        do {
            if lease?.scope != scope {
                try await prepareBoundary()
                try check(generation)
                let next = try await store.activateService(scope: scope)
                do { try check(generation) } catch { try? await store.invalidateService(next); throw error }
                lease = next
                snapshot.profileID = next.profileID
            }
            guard let lease else { throw ProgressCloudError.accountChanged }
            if snapshot.profileID != lease.profileID {
                try await prepareBoundary()
                try check(generation)
                await store.revoke(profileID: snapshot.profileID)
                try check(generation)
                snapshot.profileID = lease.profileID
            }
            let existing = try await store.serviceState(lease)
            try check(generation)
            if let importGuest, existing.resetIntent == nil {
                try await store.setGuestImportPending(importGuest, lease: lease)
                try check(generation)
            }
            if existing.resetIntent == nil { try await store.setServiceConsent(enable || existing.enabled, lease: lease) }
            else if enable || existing.resetIntent?.kind != .remoteBoundary { throw ProgressCloudError.busy }
            try check(generation)
            try await store.selectServiceScope(scope)
            try check(generation)
            let selectedState = try await store.serviceState(lease)
            try check(generation)
            snapshot.enabled = selectedState.enabled
            try await observeRevisions(lease, generation: generation)
            dirty = false
            let guest = selectedState.guestImportPending == true ? try await store.exportBackup(profileID: "local").payload : nil
            try check(generation)
            let result = try await reconcile(generation: generation, lease: lease, guest: guest)
            try check(generation)
            if guest != nil {
                try await store.setGuestImportPending(false, lease: lease)
                try check(generation)
            }
            snapshot.cleanupPending = result
            let currentState = try await store.serviceState(lease)
            try check(generation)
            snapshot.resetPending = currentState.resetIntent != nil
            snapshot.error = nil
            if !result { retryCount = 0 }
        } catch {
            if snapshot.generation == generation { snapshot.error = serviceError(error) }
            throw error
        }
    }
    func check(_ generation: UUID) throws {
        try Task.checkCancellation()
        guard snapshot.generation == generation else { throw ProgressCloudError.accountChanged }
    }
    public func snapshots() -> AsyncStream<SyncSnapshot> {
        let id = UUID()
        let (stream, continuation) = AsyncStream<SyncSnapshot>.makeStream(bufferingPolicy: .bufferingNewest(1))
        listeners[id] = continuation
        continuation.yield(snapshot)
        continuation.onTermination = { [weak self] _ in Task { await self?.removeListener(id) } }
        return stream
    }
    private func removeListener(_ id: UUID) { listeners[id] = nil }
    public func disable(generation: UUID) async throws {
        try check(generation)
        if let lease { try await store.setServiceConsent(false, lease: lease) }
        try check(generation)
        snapshot.enabled = false
        await stop()
    }
    public func setActive(_ value: Bool) async {
        active = value
        if value { await refreshAccount() }
        else { await stop() }
    }
    public func retry() async {
        guard active, !snapshot.busy else { return }
        let generation = snapshot.generation
        do {
            if let lease, let intent = try await store.serviceState(lease).resetIntent {
                try check(generation)
                if intent.kind == .local { try await removeLocal(generation: generation) }
                else if snapshot.account.scope != nil {
                    if intent.kind == .cloud { try await deleteCloud(generation: generation) }
                    else { try await refresh(generation: generation) }
                }
            } else if snapshot.enabled, snapshot.account.scope != nil { try await refresh(generation: generation) }
        } catch {
            if snapshot.generation == generation { snapshot.error = serviceError(error) }
        }
    }
    public func localDidCommit() {
        guard active, snapshot.enabled else { return }
        dirty = true
        scheduleIfNeeded()
    }
    func finishOperation(_ generation: UUID) {
        guard snapshot.generation == generation else { return }
        snapshot.busy = false
        scheduleIfNeeded()
    }
    func scheduleIfNeeded() {
        guard active, !snapshot.busy, retryTask == nil, snapshot.account.scope != nil else { return }
        let retryable = snapshot.error == .offline || snapshot.error == .conflict || snapshot.cleanupPending
        guard (snapshot.enabled && dirty) || (retryable && retryCount < 3 && (snapshot.enabled || snapshot.resetPending)) else { return }
        let delay: Duration = retryable ? .seconds(5 * (1 << retryCount)) : .seconds(2)
        if retryable { retryCount += 1 }
        let generation = snapshot.generation
        retryTask = Task { [weak self] in
            do { try await Task.sleep(for: delay) } catch { return }
            await self?.scheduledSync(generation: generation)
        }
    }
    private func scheduledSync(generation: UUID) async {
        guard snapshot.generation == generation, active else { return }
        retryTask = nil
        if snapshot.busy { return }
        dirty = false
        await retry()
    }
    func observeRevisions(_ lease: ServiceProfileLease, generation: UUID) async throws {
        guard revisionTask == nil, snapshot.enabled else { return }
        let stream = try await store.backupChanges(profileID: lease.profileID)
        try check(generation)
        revisionTask = Task { [weak self] in
            for await revision in stream {
                guard !Task.isCancelled else { return }
                await self?.revisionChanged(revision, lease: lease, generation: generation)
            }
        }
    }
    func revisionChanged(_ revision: Int64, lease: ServiceProfileLease, generation: UUID) async {
        guard snapshot.generation == generation, snapshot.enabled,
              let backup = try? await store.exportServiceBackup(lease),
              snapshot.generation == generation, revision > backup.acknowledgedRevision else { return }
        localDidCommit()
    }
    public func networkAvailable() async {
        guard active else { return }
        retryCount = 0
        await retry()
    }
    func serviceError(_ error: any Error) -> ProgressCloudError {
        if let error = error as? ProgressCloudError { return error }
        if error is LearningError { return .corrupt }
        if error as? LearningStoreError == .staleWriter { return .accountChanged }
        return .storage
    }
}
