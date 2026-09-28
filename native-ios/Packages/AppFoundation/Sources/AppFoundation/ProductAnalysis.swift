import Foundation
import LearningDomain

public struct AnalysisRequest: Equatable, Sendable {
    public let plan: LearningPlan
    public let writerID: UUID
    public let unit: Int
    public var scope: LearningScope { plan.scope }
    public var runID: String { plan.runID }
    public var sourceIndices: [Int] { plan.units[unit] }
    public init(state: LearningControllerState) {
        plan = state.snapshot.session.plan; writerID = state.snapshot.handle.writerID
        unit = state.snapshot.session.unit
    }
    public func matches(_ state: LearningControllerState) -> Bool {
        state.active && state.paused && !state.saveFailed && state.snapshot.handle.writerID == writerID
            && state.snapshot.session.plan == plan && state.snapshot.session.unit == unit
    }
}
