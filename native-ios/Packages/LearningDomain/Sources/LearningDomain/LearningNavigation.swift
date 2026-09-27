import Foundation

enum LearningNavigation {
    static func select(_ state: LearningSession, unit: Int) -> LearningSession {
        var next = state
        next.unit = unit
        next.phase = next.current.confirmed == next.current.planned ? .decision : .ready
        next.running = false; next.positionSeconds = 0
        return next
    }
    static func advance(_ state: LearningSession) -> LearningSession {
        let progress = state.units
        guard let gap = progress.firstIndex(where: { $0.confirmed < $0.planned }) else {
            var done = select(state, unit: state.unitCount - 1); done.phase = .complete
            return done
        }
        if state.isSilent {
            let forward = progress.indices.first { $0 > state.unit && progress[$0].confirmed < progress[$0].planned }
            return select(state, unit: forward ?? gap)
        }
        return select(state, unit: state.unit + 1 < state.unitCount ? state.unit + 1 : gap)
    }
}
