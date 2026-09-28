import LearningDomain

public struct LearningRemotePresentation: Equatable, Sendable {
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
        let gate = LearningRemotePresentation(owner: state.controller.snapshot.handle.writerID.uuidString,
            revision: "\(state.controller.snapshot.writerVersion):\(enabled)", mainAction: action,
            repeatable: enabled && session.canRepeat && action == .next,
            playing: session.running && session.phase == .listening && state.phase == .playing)
        return .init(owner: gate.owner, revision: revision(for: gate), mainAction: gate.mainAction,
            repeatable: gate.repeatable, playing: gate.playing)
    }
}
