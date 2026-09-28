import Foundation
import LearningDomain
import Observation

/// Semantic UI state. Writer versions and time samples are intentionally absent from equality.
public struct LearningControlPresentation: Equatable, Sendable {
    public let session: LearningSession
    public let xp: Int64
    public let mainAction: LearningEvent?
    public let repeatable: Bool
    public let saveFailed: Bool
    public let error: MediaFailure?
    public let preparing: Bool
    public let active: Bool

    init(state: LearningMediaState, gate: LearningRemotePresentation) {
        session = state.controller.snapshot.session
        xp = state.controller.snapshot.progress.xp
        mainAction = gate.mainAction; repeatable = gate.repeatable
        saveFailed = state.controller.saveFailed; error = state.error
        preparing = state.phase == .preparing
        active = state.controller.active
    }
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.session.plan == rhs.session.plan && lhs.session.sourceProgress == rhs.session.sourceProgress
        && lhs.session.unit == rhs.session.unit && lhs.session.phase == rhs.session.phase
        && lhs.session.running == rhs.session.running && lhs.session.rate == rhs.session.rate
        && lhs.session.reveal == rhs.session.reveal && lhs.xp == rhs.xp
        && lhs.mainAction == rhs.mainAction && lhs.repeatable == rhs.repeatable
        && lhs.saveFailed == rhs.saveFailed && lhs.error == rhs.error
        && lhs.preparing == rhs.preparing && lhs.active == rhs.active
    }
}

@MainActor @Observable public final class LearningMotionState {
    public private(set) var position: MediaPosition?
    public private(set) var elapsedSeconds: Double = 0
    init() {}
    func update(_ state: LearningMediaState) {
        position = state.position
        elapsedSeconds = state.position?.seconds ?? state.controller.snapshot.session.positionSeconds
    }
}
