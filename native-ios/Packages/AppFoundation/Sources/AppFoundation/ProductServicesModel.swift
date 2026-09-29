import AppleServices
import Foundation
import LearningDomain
import Observation

public enum ServiceAction: Equatable, Sendable {
    case enable(importGuest: Bool), refresh(importGuest: Bool), disable, removeLocal, deleteCloud, removeDownload(String)
}
public struct ServiceConfirmation: Identifiable, Sendable {
    public let id = UUID()
    public let action: ServiceAction
    public let profileID: String
    let generation: UUID
    let lifetime: UUID
    let account: CloudAccount
}

@MainActor @Observable public final class DownloadModel {
    public let key: String
    public let paid: Bool
    public internal(set) var status = DeliveryStatus(phase: "idle", progress: 0)
    public internal(set) var busy = false
    public internal(set) var failed = false
    init(key: String, paid: Bool) { self.key = key; self.paid = paid }
}

/// One root-owned service lifetime. View dismissal does not own purchase or download work.
@MainActor @Observable public final class ProductServicesModel {
    public let profiles: ProductProfileOwner
    public private(set) var ownershipState: OwnershipSnapshot
    public private(set) var syncState = SyncSnapshot()
    public private(set) var actionBusy = false
    public private(set) var error: String?
    public var retryConfirmation: ServiceConfirmation?
    public let downloads: [String: DownloadModel]
    private let ownership: OwnershipService
    private let access: PackageAccess
    private let delivery: ContentDelivery
    private let transport: any CloudTransport
    private let sync: SyncCoordinator
    @ObservationIgnored private var active = false
    @ObservationIgnored private var lifetime = UUID()
    @ObservationIgnored private var tasks: [Task<Void, Never>] = []
    @ObservationIgnored private var downloadTasks: [String: Task<Void, Never>] = [:]
    @ObservationIgnored private var transition: Task<Void, Never>?
    @ObservationIgnored private var accessToken: UUID?
    @ObservationIgnored private var authorityTask: Task<Void, Never>?
    @ObservationIgnored private var network: ProgressNetworkAvailability?
    @ObservationIgnored private var networkTask: Task<Void, Never>?
    @ObservationIgnored private var failedAction: ServiceConfirmation?

    public init(profiles: ProductProfileOwner, store: any ServiceProfileStore, ownership: OwnershipService,
                access: PackageAccess, delivery: ContentDelivery, transport: any CloudTransport, packages: [HostedPackage]) {
        self.profiles = profiles; self.ownership = ownership; self.access = access
        self.delivery = delivery; self.transport = transport
        ownershipState = ownership.snapshot
        downloads = Dictionary(uniqueKeysWithValues: packages.map { ($0.descriptor.key, DownloadModel(key: $0.descriptor.key, paid: $0.paid)) })
        sync = SyncCoordinator(store: store, transport: transport, prepareBoundary: { try await profiles.prepareBoundary() })
    }
    public func confirmation(_ action: ServiceAction) -> ServiceConfirmation {
        ServiceConfirmation(action: action, profileID: syncState.profileID, generation: syncState.generation, lifetime: lifetime, account: syncState.account)
    }
    public func setActive(_ value: Bool) async {
        guard active != value else { return }
        active = value; lifetime = UUID()
        let ticket = lifetime
        transition?.cancel()
        retryConfirmation = nil
        cancelObservers()
        let operation = Task { [weak self] in
            guard let self else { return }
            await self.sync.setActive(false)
            await self.delivery.cancelAll()
            guard self.lifetime == ticket, value else { return }
            self.observe(ticket)
            await self.sync.setActive(true)
            guard self.lifetime == ticket else { return }
            await self.consume(self.sync.snapshot, ticket: ticket)
        }
        transition = operation
        await operation.value
    }
    private func cancelObservers() {
        tasks.forEach { $0.cancel() }; tasks = []
        downloadTasks.values.forEach { $0.cancel() }; downloadTasks = [:]
        for model in downloads.values { model.busy = false }
        authorityTask?.cancel(); authorityTask = nil
        networkTask?.cancel(); networkTask = nil
        network?.stop(); network = nil
        if let accessToken { access.unsubscribe(accessToken) }
        accessToken = nil
        ownership.stopObserving()
        actionBusy = false
    }
    private func observe(_ ticket: UUID) {
        ownership.startObserving()
        tasks.append(Task { [weak self, ownership] in
            for await value in await ownership.snapshots() {
                guard let self, !Task.isCancelled, self.lifetime == ticket else { return }
                self.ownershipState = value
            }
        })
        tasks.append(Task { [weak self, sync] in
            for await value in await sync.snapshots() {
                guard let self, !Task.isCancelled, self.lifetime == ticket else { return }
                await self.consume(value, ticket: ticket)
            }
        })
        tasks.append(Task { [weak self, transport] in
            for await _ in await transport.accountChanges() {
                guard let self, !Task.isCancelled, self.lifetime == ticket else { return }
                await self.refreshAccount()
            }
        })
        tasks.append(Task { [weak self, delivery] in
            for await _ in await delivery.changes() {
                guard let self, !Task.isCancelled, self.lifetime == ticket else { return }
                await self.profiles.model.activate()
            }
        })
        for (key, model) in downloads {
            tasks.append(Task { [weak self, delivery] in
                do {
                    let stream = try await delivery.statuses(packageKey: key)
                    for await value in stream {
                        guard let self, !Task.isCancelled, self.lifetime == ticket else { return }
                        model.status = value
                    }
                } catch { if self?.lifetime == ticket { model.failed = true } }
            })
        }
        accessToken = access.subscribe { [weak self, delivery] _ in
            guard let self, self.lifetime == ticket else { return }
            self.authorityTask?.cancel()
            self.authorityTask = Task { await delivery.authorityChanged() }
        }
        let network = ProgressNetworkAvailability()
        network.observe { [weak self, sync] in
            guard let self, self.lifetime == ticket else { return }
            self.networkTask?.cancel()
            self.networkTask = Task { await sync.networkAvailable() }
        }
        self.network = network
        tasks.append(Task { [ownership] in await ownership.refresh() })
    }
    private func consume(_ value: SyncSnapshot, ticket: UUID) async {
        guard lifetime == ticket, value.generation == (await sync.snapshot.generation) else { return }
        syncState = value
        guard !value.busy else { return }
        do {
            if profiles.profileID != value.profileID { try await profiles.selectProfile(value.profileID) }
            guard lifetime == ticket else { return }
            try await profiles.settleBoundary(resetPending: value.resetPending)
        } catch { if lifetime == ticket { self.error = "profile-boundary" } }
    }
    public func refreshAccount() async {
        guard active else { return }
        let ticket = lifetime
        await sync.refreshAccount()
        await consume(sync.snapshot, ticket: ticket)
    }
    public func purchase() async { guard active else { return }; await ownership.purchase() }
    public func retrySync() async {
        guard active, !actionBusy else { return }
        if let request = failedAction, !syncState.resetPending {
            guard request.account == syncState.account else {
                failedAction = nil; error = "account-changed"
                return
            }
            switch request.action {
            case .enable, .refresh, .disable:
                // Retry is a new explicit action against the same account, not reuse of
                // an expired confirmation. First recovery may have selected its profile.
                _ = await perform(confirmation(request.action))
            case .removeLocal, .deleteCloud, .removeDownload:
                guard request.profileID == syncState.profileID else {
                    failedAction = nil; error = "account-changed"
                    return
                }
                retryConfirmation = confirmation(request.action)
            }
            return
        }
        let ticket = lifetime
        failedAction = nil
        error = nil
        await sync.retry()
        await consume(sync.snapshot, ticket: ticket)
    }
    public func restore() async { guard active else { return }; await ownership.restore() }
    public func refreshOwnership() async { guard active else { return }; await ownership.refresh() }
    public func download(_ key: String) {
        guard active, let model = downloads[key], !model.busy else { return }
        let ticket = lifetime
        model.busy = true; model.failed = false
        downloadTasks[key] = Task { [weak self, delivery] in
            do { try await delivery.download(packageKey: key) }
            catch { if self?.lifetime == ticket, !(error is CancellationError) { model.failed = true } }
            guard let self, self.lifetime == ticket else { return }
            model.busy = false; self.downloadTasks[key] = nil
            await self.profiles.model.activate()
        }
    }
    public func cancelDownload(_ key: String) async { await delivery.cancel(packageKey: key) }
    @discardableResult public func perform(_ request: ServiceConfirmation) async -> Bool {
        guard active, !actionBusy, request.lifetime == lifetime, request.profileID == syncState.profileID,
              request.generation == syncState.generation else { return false }
        let ticket = lifetime
        actionBusy = true; error = nil
        defer { if lifetime == ticket { actionBusy = false } }
        do {
            switch request.action {
            case .enable(let guest): try await sync.enable(importGuest: guest, generation: request.generation)
            case .refresh(let guest): try await sync.refresh(importGuest: guest, generation: request.generation)
            case .disable: try await sync.disable(generation: request.generation)
            case .removeLocal: try await sync.removeLocal(generation: request.generation)
            case .deleteCloud: try await sync.deleteCloud(generation: request.generation)
            case .removeDownload(let key):
                try await profiles.prepareBoundary()
                guard lifetime == ticket else { throw CancellationError() }
                try await delivery.remove(packageKey: key)
            }
            guard lifetime == ticket else { return false }
            await consume(sync.snapshot, ticket: ticket)
            await profiles.model.activate()
            failedAction = nil
            return true
        } catch {
            if lifetime == ticket {
                self.error = (error as? ProgressCloudError)?.rawValue ?? "service-operation"
                failedAction = request
                await consume(sync.snapshot, ticket: ticket)
            }
            return false
        }
    }
}
