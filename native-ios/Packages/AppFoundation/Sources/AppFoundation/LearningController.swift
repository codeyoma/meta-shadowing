import Foundation
import LearningDomain

public struct LearningControllerState: Equatable, Sendable {
    public let snapshot: LearningSnapshot
    public let paused: Bool
    public let saveFailed: Bool
    public let active: Bool
    public let requests: [TransportRequest]
}

public actor LearningController {
    private let store: any LearningStore
    private var committed: LearningSnapshot
    private var pending: LearningCommand?
    private var busy = false
    private var failed = false
    private var active = true
    private var lifetime = UUID()
    private var transport: TransportToken?
    private var bufferedEnd: LearningCallback?
    public init(store: any LearningStore, snapshot: LearningSnapshot) { self.store = store; committed = snapshot }
    public var state: LearningControllerState { result() }

    private func result(_ requests: [TransportRequest] = []) -> LearningControllerState {
        LearningControllerState(snapshot: committed, paused: !active || failed || !committed.session.running,
            saveFailed: failed, active: active, requests: requests)
    }
    private func token(for snapshot: LearningSnapshot) -> TransportToken {
        TransportToken(writerID: snapshot.handle.writerID, planID: snapshot.handle.planID, unit: snapshot.session.unit,
                       cycle: snapshot.session.current.confirmed + 1, generation: UUID())
    }
    public func send(_ command: LearningCommand) async -> LearningControllerState {
        guard active, !busy, pending == nil, command.handle == committed.handle, command.expectedVersion == committed.writerVersion else { return result() }
        return await commit(command, retrying: false)
    }
    public func receive(_ callback: LearningCallback) async -> LearningControllerState {
        guard active, callback.token == transport else { return result() }
        if busy {
            // Position persistence must not discard the transport's one-shot completion.
            if callback.event == .playbackEnded { bufferedEnd = callback }
            return result()
        }
        guard pending == nil else { return result() }
        let command = LearningCommand(handle: committed.handle, id: UUID(), expectedVersion: committed.writerVersion, event: callback.event.learningEvent)
        return await commit(command, retrying: false)
    }
    public func retrySave() async -> LearningControllerState {
        guard active, !busy, let pending else { return result() }
        return await commit(pending, retrying: true)
    }
    private func commit(_ command: LearningCommand, retrying: Bool) async -> LearningControllerState {
        busy = true; pending = command
        let generation = lifetime, before = committed
        do {
            var receipt = try await store.apply(command)
            guard active, generation == lifetime else { return result() }
            if retrying && receipt.snapshot.session.running {
                let pause = LearningCommand(handle: receipt.snapshot.handle, id: UUID(), expectedVersion: receipt.snapshot.writerVersion, event: .pause)
                pending = pause
                receipt = try await store.apply(pause)
                guard active, generation == lifetime else { return result() }
            }
            committed = receipt.snapshot; pending = nil; busy = false; failed = false
            if retrying {
                bufferedEnd = nil
                let stop = transport ?? token(for: committed); transport = nil
                return result([TransportRequest(token: stop, intent: .stop)])
            }
            guard receipt.disposition == .applied else { return await drainEnd() }
            let transition = try LearningReducer.reduce(before.session, event: command.event)
            var requests: [TransportRequest] = []
            if case .position = command.event {
                // Writer versions advance on position persistence, but the playback generation does not.
            } else {
                let old = transport; transport = nil
                for intent in transition.intents {
                    if intent == .stop { requests.append(TransportRequest(token: old ?? token(for: committed), intent: .stop)) }
                    else {
                        let current = token(for: committed); transport = current
                        requests.append(TransportRequest(token: current, intent: intent))
                    }
                }
            }
            if committed.session.phase == .ready {
                let continuation: LearningEvent?
                switch command.event {
                case .confirm, .repeat: continuation = .resume
                case .next: continuation = committed.session.isSilent ? .resume : .stageEntry
                default: continuation = nil
                }
                if let continuation {
                    let next = LearningCommand(handle: committed.handle, id: UUID(), expectedVersion: committed.writerVersion, event: continuation)
                    let started = await commit(next, retrying: false)
                    return LearningControllerState(snapshot: started.snapshot, paused: started.paused,
                        saveFailed: started.saveFailed, active: started.active, requests: requests + started.requests)
                }
            }
            if bufferedEnd != nil {
                let drained = await drainEnd()
                return LearningControllerState(snapshot: drained.snapshot, paused: drained.paused,
                    saveFailed: drained.saveFailed, active: drained.active, requests: requests + drained.requests)
            }
            return result(requests)
        } catch {
            guard active, generation == lifetime else { return result() }
            busy = false; failed = true; bufferedEnd = nil
            let stop = transport ?? token(for: committed); transport = nil
            return result([TransportRequest(token: stop, intent: .stop)])
        }
    }
    private func drainEnd() async -> LearningControllerState {
        guard let callback = bufferedEnd else { return result() }
        bufferedEnd = nil
        return await receive(callback)
    }
    public func deactivate() async {
        guard active else { return }
        active = false; lifetime = UUID(); transport = nil; pending = nil; busy = false; bufferedEnd = nil
        await store.revoke(profileID: committed.handle.scope.profileID)
    }
}
