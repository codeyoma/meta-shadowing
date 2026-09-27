import LearningDomain

public struct LearningRemotePresentation: Sendable {
    public let owner: String
    public let revision: String
    public let mainAction: LearningEvent?
    public let repeatable: Bool
    public let playing: Bool
    public var actionable: Bool { mainAction != nil }
}

extension LearningMediaCoordinator {
    public var remoteState: LearningRemotePresentation {
        let state = state, session = state.controller.snapshot.session
        let enabled = permitsInteraction && !state.busy && state.error == nil && !state.controller.saveFailed && state.controller.active
        let action: LearningEvent?
        if !enabled || session.phase == .complete { action = nil }
        else if session.canNext { action = .next }
        else if !session.running { action = .resume }
        else if session.phase == .speaking { action = .confirm }
        else { action = nil }
        return .init(owner: state.controller.snapshot.handle.writerID.uuidString,
            revision: "\(state.controller.snapshot.writerVersion):\(enabled)", mainAction: action,
            repeatable: enabled && session.canRepeat && action == .next,
            playing: session.running && session.phase == .listening && state.phase == .playing)
    }
}
