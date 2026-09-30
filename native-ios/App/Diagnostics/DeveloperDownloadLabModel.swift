#if DEBUG
import AppleServices
import Foundation
import LearningDomain
import LearningPersistence
import Observation

/// Owns one isolated diagnostic session. It never constructs live Apple service adapters.
@MainActor @Observable final class DeveloperDownloadLabModel {
    enum Result: Equatable {
        case none, cancelVerified, installVerified, failureVerified, historyPrepared, resetVerified, restoreVerified, reopenVerified, failed
        var label: String {
            switch self {
            case .none: "아직 검증하지 않음"
            case .cancelVerified: "취소 검증 통과"
            case .installVerified: "설치 검증 통과"
            case .failureVerified: "실패 검증 통과"
            case .historyPrepared: "합성 기록·백업 준비됨"
            case .resetVerified: "초기화 검증 통과"
            case .restoreVerified: "복원 검증 통과"
            case .reopenVerified: "저장소 재열기 검증 통과"
            case .failed: "검증 실패 — 다시 시도하세요"
            }
        }
    }

    private(set) var ready = false
    private(set) var downloading = false
    private(set) var historyBusy = false
    private(set) var paused = false
    private(set) var installed = false
    private(set) var xp: Int64 = 0
    private(set) var hasCheckpoint = false
    private(set) var hasBackup = false
    private(set) var status = DeliveryStatus(phase: "idle", progress: 0)
    private(set) var result = Result.none
    @ObservationIgnored private let root: URL
    @ObservationIgnored private let sourceRoot: URL
    @ObservationIgnored private let transport: DeveloperDownloadLabTransport
    @ObservationIgnored private let store: SQLiteLearningStore
    @ObservationIgnored private let drainDelivery: @Sendable (ContentDelivery) async -> Void
    @ObservationIgnored private var delivery: ContentDelivery?
    @ObservationIgnored private var key = ""
    @ObservationIgnored private var lifetime = UUID()
    @ObservationIgnored private var opening = false
    @ObservationIgnored private var operation: Task<Void, Never>?
    @ObservationIgnored private var historyOperation: Task<Void, Error>?
    @ObservationIgnored private var observer: Task<Void, Never>?
    @ObservationIgnored private var closing: (id: UUID, task: Task<Void, Never>)?
    @ObservationIgnored private var cancellation: (id: UUID, task: Task<Void, Never>)?
    @ObservationIgnored private var failureRequested = false

    init(root: URL, stepDuration: Duration = .milliseconds(250),
         drainDelivery: @escaping @Sendable (ContentDelivery) async -> Void = { await $0.cancelAll() }) {
        self.root = root
        sourceRoot = Bundle.main.bundleURL.appending(path: "sample")
        transport = DeveloperDownloadLabTransport(root: sourceRoot, stepDuration: stepDuration)
        store = SQLiteLearningStore(root: root.appending(path: "learning"))
        self.drainDelivery = drainDelivery
    }

    func open() async {
        if closing != nil { await close() }
        guard !Task.isCancelled else { return }
        guard !ready, !opening else { return }
        opening = true
        let ticket = lifetime
        defer { if lifetime == ticket { opening = false } }
        do {
            let (prepared, key) = try await DeveloperDownloadLabFiles.delivery(root: root, sourceRoot: sourceRoot, transport: transport)
            guard lifetime == ticket, !Task.isCancelled else { return }
            delivery = prepared; self.key = key
            status = try await prepared.state(packageKey: key)
            try await refreshFacts()
            guard lifetime == ticket, !Task.isCancelled else { return }
            ready = true
            observer = Task { [weak self] in
                do {
                    for await state in try await prepared.statuses(packageKey: key) {
                        guard let self, self.lifetime == ticket, !Task.isCancelled else { return }
                        self.status = state
                    }
                } catch { if self?.lifetime == ticket { self?.result = .failed } }
            }
        } catch { if lifetime == ticket { result = .failed } }
    }

    func startDownload() {
        guard ready, !downloading, cancellation == nil, !historyBusy, !installed, let delivery else { return }
        let ticket = lifetime, key = key
        downloading = true; paused = false; result = .none; failureRequested = false
        operation = Task { [weak self] in
            do {
                try Task.checkCancellation()
                try await delivery.download(packageKey: key)
                guard let self, self.lifetime == ticket, !Task.isCancelled else { return }
                try await self.refreshFacts()
                guard self.lifetime == ticket else { return }
                self.result = self.installed ? .installVerified : .failed
            } catch {
                guard let self, self.lifetime == ticket else { return }
                // Explicit cancellation is verified by its owner after the transfer drains.
                guard !Task.isCancelled else { return }
                do {
                    try await self.refreshFacts()
                    guard self.lifetime == ticket else { return }
                    let state = try await delivery.state(packageKey: key)
                    self.status = state
                    let injected = self.failureRequested && (error as? URLError)?.code == .networkConnectionLost
                    self.result = injected && !self.installed && state.phase == "failed" ? .failureVerified : .failed
                } catch { if self.lifetime == ticket { self.result = .failed } }
            }
            guard let self, self.lifetime == ticket, self.cancellation == nil else { return }
            self.downloading = false; self.paused = false; self.operation = nil
        }
    }

    func cancelDownload() async {
        if let cancellation { await cancellation.task.value; finishCancellation(id: cancellation.id); return }
        guard ready, closing == nil, downloading, let delivery else { return }
        let ticket = lifetime, pending = operation, key = key, id = UUID()
        pending?.cancel()
        let task = Task { [weak self] in
            await delivery.cancel(packageKey: key)
            await pending?.value
            guard let self, self.lifetime == ticket else { return }
            do {
                try await self.refreshFacts()
                let state = try await delivery.state(packageKey: key)
                guard self.lifetime == ticket else { return }
                self.status = state
                self.result = !self.installed && ["idle", "cancelled"].contains(state.phase) ? .cancelVerified : .failed
            } catch { if self.lifetime == ticket { self.result = .failed } }
        }
        cancellation = (id, task)
        await task.value
        finishCancellation(id: id)
    }

    private func finishCancellation(id: UUID) {
        guard cancellation?.id == id, closing == nil else { return }
        downloading = false; paused = false; operation = nil; cancellation = nil
    }
    func pauseTransfer() async { guard downloading else { return }; await transport.setPaused(true); paused = downloading }
    func resumeTransfer() async { await transport.setPaused(false); paused = false }
    func failTransfer() async { guard downloading else { return }; failureRequested = true; await transport.fail(); paused = false }

    func removeDownload() async {
        guard ready, !downloading, !historyBusy, let delivery else { return }
        await historyAction {
            let before = try await self.store.exportBackup(profileID: "local").payload
            try await delivery.remove(packageKey: self.key)
            try await self.refreshFacts()
            guard !self.installed, try await self.store.exportBackup(profileID: "local").payload == before else { throw DeliveryError.damagedFiles }
            self.result = .none
        }
    }

    func prepareHistory() async {
        await historyAction {
            guard self.xp == 0 else { throw LearningError.invalidState }
            let plan = try Self.plan()
            var state = try await self.store.open(plan: plan, preferences: .fresh, writerID: UUID())
            // This is explicitly synthetic reveal, not a native playback completion or real practice pass.
            for event in [LearningEvent.resume, .playbackEnded, .confirm] {
                try Task.checkCancellation()
                state = try await self.store.apply(.init(handle: state.handle, id: UUID(), expectedVersion: state.writerVersion, event: event)).snapshot
            }
            await self.store.revoke(profileID: "local")
            let backup = try await self.store.exportBackup(profileID: "local").payload
            try await DeveloperDownloadLabFiles.saveBackup(backup, root: self.root)
            try await self.refreshFacts()
            guard self.xp == 3, self.hasCheckpoint, self.hasBackup else { throw LearningError.invalidState }
            self.result = .historyPrepared
        }
    }

    func resetHistory() async {
        await historyAction {
            let coordinator = SyncCoordinator(store: self.store, transport: ServiceTestCloud(available: false))
            await coordinator.refreshAccount()
            do {
                try Task.checkCancellation()
                try await coordinator.removeLocal(generation: coordinator.snapshot.generation)
            }
            catch { await coordinator.stop(); throw error }
            await coordinator.stop()
            try await self.refreshFacts()
            guard self.xp == 0, !self.hasCheckpoint else { throw LearningError.invalidState }
            self.result = .resetVerified
        }
    }

    func restoreHistory() async {
        await historyAction {
            guard let backup = try await DeveloperDownloadLabFiles.backup(root: self.root) else { throw LearningError.invalidState }
            _ = try await self.store.mergeBackup(backup, profileID: "local")
            try await self.refreshFacts()
            guard self.xp == 3, self.hasCheckpoint else { throw LearningError.invalidState }
            self.result = .restoreVerified
        }
    }

    func reopenHistory() async {
        await historyAction {
            let reopened = SQLiteLearningStore(root: self.root.appending(path: "learning"))
            let current = try await reopened.readLanguageProgress(profileID: "local", language: "english", today: StudyDay.at(Date(), calendar: .current))
            let checkpoint = try await reopened.readCheckpoint(plan: Self.plan())
            guard current.xp == self.xp, (checkpoint != nil) == self.hasCheckpoint else { throw LearningError.invalidState }
            self.result = .reopenVerified
        }
    }

    func close() async {
        if let closing {
            await closing.task.value
            finishClosing(id: closing.id)
            return
        }
        lifetime = UUID(); ready = false; opening = false
        observer?.cancel(); observer = nil
        let pending = operation; pending?.cancel()
        let history = historyOperation; history?.cancel()
        let cancelled = cancellation?.task
        let delivery = delivery, drain = drainDelivery, id = UUID()
        let task = Task {
            if let delivery { await drain(delivery) }
            await pending?.value
            await cancelled?.value
            _ = try? await history?.value
        }
        closing = (id, task)
        await task.value
        finishClosing(id: id)
    }

    private func finishClosing(id: UUID) {
        guard closing?.id == id else { return }
        operation = nil; historyOperation = nil; historyBusy = false; downloading = false; paused = false
        cancellation = nil; closing = nil
    }

    private func historyAction(_ action: @escaping @MainActor () async throws -> Void) async {
        guard ready, !historyBusy, !downloading, cancellation == nil else { return }
        let ticket = lifetime
        historyBusy = true; result = .none
        let pending = Task { try Task.checkCancellation(); try await action() }
        historyOperation = pending
        defer { if lifetime == ticket { historyBusy = false; historyOperation = nil } }
        do { try await pending.value }
        catch { if lifetime == ticket { result = .failed } }
    }

    private func refreshFacts() async throws {
        guard let delivery else { throw DeliveryError.unavailable }
        let ticket = lifetime
        let state = try await delivery.state(packageKey: key)
        if state.phase == "ready" { _ = try await delivery.installation(packageKey: key) }
        let earned = try await store.readLanguageProgress(profileID: "local", language: "english", today: StudyDay.at(Date(), calendar: .current)).xp
        let checkpoint = try await store.readCheckpoint(plan: Self.plan()) != nil
        let backup = try await DeveloperDownloadLabFiles.backup(root: root) != nil
        try Task.checkCancellation()
        guard lifetime == ticket else { throw CancellationError() }
        installed = state.phase == "ready"; xp = earned; hasCheckpoint = checkpoint; hasBackup = backup
    }

    private static func plan() throws -> LearningPlan {
        try LearningPlan.make(scope: .init(profileID: "local", packageKey: "diagnostic-v1", language: "english", book: "diagnostic", stage: 11),
            runID: "diagnostic-recovery", sources: [.init(index: 0, text: "Hello", translation: "안녕")], groupSize: 2)
    }
}
#endif
