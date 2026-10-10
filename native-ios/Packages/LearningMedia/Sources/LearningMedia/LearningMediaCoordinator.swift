import Foundation
import LearningDomain
import AppFoundation

public struct LearningMediaState: Sendable {
    public enum Phase: Sendable { case paused, preparing, playing, ended }
    public let controller: LearningControllerState
    public let position: MediaPosition?
    public let phase: Phase
    public let error: MediaFailure?
    public let busy: Bool
}

/// Serializes durable actions while stopping time-sensitive output synchronously.
@MainActor public final class LearningMediaCoordinator {
    public var onChange: (@MainActor (LearningMediaState) -> Void)?
    public var onFeedback: (@MainActor (CommittedLearningFeedback) -> Void)?
    private let controller: LearningController
    private let catalog: MediaAssetCatalog
    private let authorize: @Sendable (LearningScope) async -> Bool
    private let makeTransport: @MainActor ([MediaSource]) -> any MediaTransport
    private let audioSession: LessonAudioSession?
    private let clock: MediaClock
    private let reveal: SilentRevealClock
    private var committed: LearningControllerState
    private var position: MediaPosition?
    private var phase: LearningMediaState.Phase = .paused
    private var error: MediaFailure?
    private var context = LessonInteractionContext()
    private var driver: (any MediaTransport)?
    private var preparedDriverToken: TransportToken?
    private var token: TransportToken?
    private var generation = UUID()
    private var preparation: Task<Void, Never>?
    private var drainTask: Task<Void, Never>?
    private var pendingPosition: LearningCallback?
    private var pendingEnd: LearningCallback?
    private var pendingPause: (token: TransportToken?, position: MediaPosition?)?
    private var lastPositionSave = -Double.infinity
    private var revealing = false, busy = false, closing = false, closed = false
    private var consumedRemoteRevision: String?
    private var lastRemoteGate: LearningRemotePresentation?
    private var remoteRevision: UInt64 = 0
    private var idleWaiters: [CheckedContinuation<Void, Never>] = []

    public init(controller: LearningController, initial: LearningControllerState, catalog: MediaAssetCatalog,
                authorize: @escaping @Sendable (LearningScope) async -> Bool,
                makeTransport: @escaping @MainActor ([MediaSource]) -> any MediaTransport,
                audioSession: LessonAudioSession? = nil, clock: MediaClock = .live) {
        self.controller = controller; committed = initial; self.catalog = catalog
        self.authorize = authorize; self.makeTransport = makeTransport; self.audioSession = audioSession
        self.clock = clock; reveal = SilentRevealClock(clock: clock)
        reveal.onEvent = { [weak self] in self?.receive($0) }
    }
    public var state: LearningMediaState {
        .init(controller: committed, position: position, phase: phase, error: error, busy: busy || drainTask != nil || pendingPause != nil)
    }
    var permitsInteraction: Bool { context.actionable && !closed && !closing }
    func revision(for gate: LearningRemotePresentation) -> String {
        if lastRemoteGate != gate {
            remoteRevision += 1
            lastRemoteGate = gate
        }
        return String(remoteRevision)
    }
    public func receiveRemote(_ event: LessonRemoteEvent) async -> LearningMediaState {
        let gate = remoteState
        guard event.owner == gate.owner, event.revision == gate.revision,
              consumedRemoteRevision != event.revision else { return state }
        let action = event.action == .repeatPractice ? (gate.repeatable ? LearningEvent.repeat : nil) : gate.mainAction
        guard let action else { return state }
        consumedRemoteRevision = event.revision
        return await perform(action)
    }
    public func perform(_ event: LearningEvent) async -> LearningMediaState {
        if event == .pause, !closed, !closing {
            suspend(.userPause)
            if busy { await withCheckedContinuation { idleWaiters.append($0) } }
            scheduleDrain()
            if let drainTask { await drainTask.value }
            return state
        }
        guard !closed, !closing, !busy, drainTask == nil, pendingPause == nil, context.actionable, !committed.saveFailed else { return state }
        busy = true; error = nil
        switch event {
        case .selectSource, .regroup, .changeRate, .changeRevealSpeed, .pause: stopOutput()
        default: break
        }
        let current = generation
        publish()
        let result = await controller.send(command(event))
        accept(result, expected: current)
        becameIdle(); scheduleDrain(); publish()
        if let drainTask { await drainTask.value }
        return state
    }
    public func retrySave() async -> LearningMediaState {
        guard !closed, !closing, !busy, drainTask == nil else { return state }
        stopOutput(); busy = true; let current = generation
        accept(await controller.retrySave(), expected: current)
        becameIdle(); scheduleDrain(); publish()
        if let drainTask { await drainTask.value }
        return state
    }
    /// Explicit menu edits keep playback and remote commands gated throughout the save.
    public func editWhilePaused(_ event: LearningEvent) async -> LearningMediaState {
        switch event {
        case .changeRate, .changeRevealSpeed, .regroup, .selectSource: break
        default: return state
        }
        guard !closed, !closing, !busy, drainTask == nil, pendingPause == nil,
              context.foreground, context.access, !context.complete,
              committed.active, committed.paused, !committed.saveFailed else { return state }
        busy = true
        let current = generation
        publish()
        let result = await controller.send(command(event))
        accept(result, expected: current)
        becameIdle(); scheduleDrain(); publish()
        if let drainTask { await drainTask.value }
        return state
    }
    /// Only an explicit visible recovery action may retry a media error.
    public func retryMedia() async -> LearningMediaState {
        guard error != nil, !committed.saveFailed else { return state }
        return await perform(.resume)
    }
    public func setContext(_ context: LessonInteractionContext) {
        self.context = context
        if !context.actionable { suspend(context.menuOpen ? .menu : .inactivity) }
        else { publish() }
    }
    public func suspend(_ reason: SuspensionReason) {
        guard !closed else { return }
        let previous = token
        let sample = stopOutput()
        if pendingPause == nil { pendingPause = (previous, sample) }
        pendingPosition = nil; pendingEnd = nil
        scheduleDrain(); publish()
    }
    public func close() async {
        guard !closed else { return }
        closing = true; suspend(.inactivity)
        if busy { await withCheckedContinuation { idleWaiters.append($0) } }
        scheduleDrain()
        if let drainTask { await drainTask.value }
        closed = true; stopOutput(); driver?.dispose(); driver = nil
        reveal.onEvent = nil; await audioSession?.shutdown()
        await controller.deactivate()
        committed = await controller.state; publish(); onChange = nil; onFeedback = nil
    }

    private func command(_ event: LearningEvent) -> LearningCommand {
        .init(handle: committed.snapshot.handle, id: UUID(), expectedVersion: committed.snapshot.writerVersion, event: event)
    }
    private func publish() {
        // Retire each gate even when no remote consumer observes the disabled interval.
        _ = remoteState
        onChange?(state)
    }
    private func becameIdle() {
        busy = false
        let waiters = idleWaiters; idleWaiters.removeAll()
        for waiter in waiters { waiter.resume() }
    }
    private func accept(_ result: LearningControllerState, expected: UUID) {
        committed = result.withoutEffects
        if result.saveFailed { stopOutput(); return }
        guard !closed, !closing, expected == generation, context.actionable, pendingPause == nil else { return }
        for feedback in result.feedback { onFeedback?(feedback) }
        for request in result.requests { execute(request) }
    }
    @discardableResult private func stopOutput() -> MediaPosition? {
        generation = UUID(); preparation?.cancel(); preparation = nil
        if revealing {
            position = MediaPosition(seconds: reveal.pause(), duration: position?.duration ?? 0)
        } else if let sample = driver?.pause(), token != nil, preparedDriverToken == token {
            position = sample
        }
        revealing = false; reveal.cancel(); token = nil; phase = .paused
        preparedDriverToken = nil
        audioSession?.releasePlayback()
        return position
    }
    private func receive(_ event: MediaTransportEvent) {
        guard !closed, !closing, event.token == token else { return }
        switch event.kind {
        case let .position(sample):
            position = sample
            if clock.now() - lastPositionSave >= 1 {
                pendingPosition = .init(token: event.token, event: .position(sample.seconds))
                scheduleDrain()
            }
        case let .memberBoundary(sample):
            position = sample
            pendingPosition = .init(token: event.token, event: .position(sample.seconds))
            scheduleDrain()
        case let .ended(sample):
            position = sample; phase = .ended
            pendingPosition = .init(token: event.token, event: .position(sample.seconds))
            pendingEnd = .init(token: event.token, event: .playbackEnded)
            scheduleDrain()
        case let .failed(failure): error = failure; suspend(.failure)
        case let .interrupted(sample): position = sample; suspend(.interruption)
        }
        publish()
    }
    private func scheduleDrain() {
        guard !closed, !busy, drainTask == nil,
              pendingPause != nil || pendingPosition != nil || pendingEnd != nil else { return }
        drainTask = Task { @MainActor [weak self] in
            guard let self else { return }
            await self.drain()
            self.drainTask = nil; self.scheduleDrain(); self.publish()
        }
    }
    private func drain() async {
        while !closed {
            busy = true
            if let pause = pendingPause {
                pendingPause = nil
                let session = committed.snapshot.session
                if let token = pause.token, let position = pause.position,
                   token.planID == session.plan.runID, token.unit == session.unit,
                   token.cycle == session.current.confirmed + 1, !committed.saveFailed {
                    committed = await controller.send(command(.position(position.seconds)))
                }
                if !committed.saveFailed { committed = await controller.send(command(.pause)) }
                phase = .paused
            } else if let callback = pendingPosition {
                pendingPosition = nil; lastPositionSave = clock.now()
                let current = generation
                accept(await controller.receive(callback), expected: current)
            } else if let callback = pendingEnd {
                pendingEnd = nil; let current = generation
                accept(await controller.receive(callback), expected: current)
            } else { becameIdle(); return }
            becameIdle(); publish()
            if committed.saveFailed { pendingPosition = nil; pendingEnd = nil; pendingPause = nil; stopOutput(); return }
        }
    }
    private func execute(_ request: TransportRequest) {
        switch request.intent {
        case .stop: stopOutput()
        case let .reveal(unit, elapsed, WPM):
            stopOutput(); driver?.dispose(); driver = nil
            do {
                let session = committed.snapshot.session
                let lines = try RevealTimeline.lines(source: session.plan.sources[unit], stage: session.plan.scope.stage)
                let duration = try RevealTimeline.duration(lines: lines, WPM: WPM)
                token = request.token; revealing = true; phase = .playing
                position = .init(seconds: elapsed, duration: duration)
                try reveal.start(token: request.token, elapsedSeconds: elapsed, duration: duration, WPM: WPM)
            } catch { self.error = .invalidAsset; suspend(.failure) }
        case let .prepare(unit, seconds, rate, delay): prepare(request.token, unit: unit, seconds: seconds, rate: rate, delay: delay, frameOnly: false)
        case let .restoreFrame(unit, rate): prepare(request.token, unit: unit, seconds: 0, rate: rate, delay: 0, frameOnly: true)
        }
    }
    private func prepare(_ token: TransportToken, unit: Int, seconds: Double, rate: Double, delay: Int, frameOnly: Bool) {
        stopOutput(); self.token = token; phase = .preparing
        position = nil
        let current = generation, plan = committed.snapshot.session.plan
        preparation = Task { @MainActor [weak self] in
            guard let self else { return }
            do {
                if delay > 0 { try await self.clock.sleep(Double(delay) / 1000) }
                guard self.valid(current, token), await self.authorize(plan.scope) else { throw MediaFailure.accessDenied }
                guard self.valid(current, token) else { throw MediaFailure.cancelled }
                let sources = try self.catalog.sources(for: plan, unit: unit)
                if frameOnly, !sources.allSatisfy({ if case .video = $0 { true } else { false } }) {
                    self.stopOutput(); self.publish(); return
                }
                let driver = self.driver ?? self.makeTransport(sources); self.driver = driver
                driver.onEvent = { [weak self] in self?.receive($0) }
                let position: Double
                if frameOnly {
                    position = try VideoMediaTimeline(sources: sources).selected.duration
                } else { position = seconds }
                try await driver.prepare(.init(token: token, sources: sources, positionSeconds: position, rate: rate))
                guard self.valid(current, token), await self.authorize(plan.scope) else { throw MediaFailure.accessDenied }
                guard self.valid(current, token) else { throw MediaFailure.cancelled }
                self.preparedDriverToken = token
                if !frameOnly {
                    try await self.audioSession?.acquirePlayback()
                    guard self.valid(current, token) else { throw MediaFailure.cancelled }
                    try driver.play(token: token)
                }
                self.phase = frameOnly ? .paused : .playing
                self.preparation = nil; self.publish()
            } catch {
                guard self.valid(current, token) else { return }
                self.error = error as? MediaFailure ?? .unavailable
                self.suspend(.failure)
            }
        }
    }
    private func valid(_ generation: UUID, _ token: TransportToken) -> Bool {
        !closed && !closing && self.generation == generation && self.token == token && context.actionable && !Task.isCancelled
    }
}
