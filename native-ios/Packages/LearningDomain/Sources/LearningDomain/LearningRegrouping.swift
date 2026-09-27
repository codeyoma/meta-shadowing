import Foundation

public enum LearningRegrouping {
    public static func apply(_ state: LearningSession, size: Int, newPlanID: String) throws -> LearningSession {
        try state.validate()
        guard (7...10).contains(state.plan.scope.stage), !state.running, state.phase != .complete,
              (2...4).contains(size) else { throw LearningError.invalidEvent }
        if size == state.plan.groupSize { return state }
        guard newPlanID != state.plan.runID else { throw LearningError.invalidIdentity }
        var next = state
        next.plan = try LearningPlan(scope: state.plan.scope, runID: newPlanID, lineage: state.plan.rootRunID,
                                     sources: state.plan.sources, groupSize: size)
        next.sourceProgress = state.sourceProgress.map {
            SourceProgress(confirmed: $0.confirmed, planned: $0.planned, closed: $0.confirmed == $0.planned || $0.closed)
        }
        var unit = state.unit * state.plan.groupSize / size
        let progress = next.units
        if progress[unit].confirmed == progress[unit].planned {
            unit = progress.indices.first { $0 >= unit && progress[$0].confirmed < progress[$0].planned }
                ?? progress.firstIndex { $0.confirmed < $0.planned } ?? (progress.count - 1)
        }
        next = LearningNavigation.select(next, unit: unit)
        try next.validate()
        return next
    }
}
