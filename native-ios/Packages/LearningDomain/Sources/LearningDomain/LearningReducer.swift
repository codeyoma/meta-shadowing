import Foundation

public enum LearningEvent: Codable, Equatable, Sendable {
    case resume, pause, playbackEnded, confirm, `repeat`, next, stageEntry
    case position(Double), selectSource(Int), changeRate(Double)
    case changeRevealSpeed(level: Int, presets: [Int]), regroup(size: Int, newPlanID: String)
}
public enum TransportIntent: Equatable, Sendable {
    case stop
    case prepare(unit: Int, position: Double, rate: Double, delayMilliseconds: Int)
    case restoreFrame(unit: Int, rate: Double)
    case reveal(unit: Int, elapsedSeconds: Double, WPM: Int)
    public var delayMilliseconds: Int? {
        if case let .prepare(_, _, _, delay) = self { delay } else { nil }
    }
}
public struct SessionTransition: Equatable, Sendable {
    public let previous: LearningSession
    public let session: LearningSession
    public let confirmedSources: [SourceOrdinal]
    public let completed: Bool
    public let intents: [TransportIntent]
}

public enum LearningReducer {
    public static func reduce(_ state: LearningSession, event: LearningEvent) throws -> SessionTransition {
        try state.validate()
        var next = state
        var receipts: [SourceOrdinal] = []
        var intents: [TransportIntent] = []
        func confirm() {
            for index in next.currentSources where next.sourceProgress[index].confirmed < next.sourceProgress[index].planned {
                next.sourceProgress[index].confirmed += 1
                receipts.append(SourceOrdinal(source: index, ordinal: next.sourceProgress[index].confirmed))
            }
            next.phase = next.current.confirmed == next.current.planned ? .decision : .ready
            next.running = false; next.positionSeconds = 0
        }
        func resume(delay: Int) {
            guard next.phase != .complete, next.phase != .decision, !next.running else { return }
            if next.phase == .ready { next.phase = .listening }
            next.running = true
            if next.phase == .listening {
                if let reveal = next.reveal {
                    intents.append(.reveal(unit: next.unit, elapsedSeconds: next.positionSeconds, WPM: reveal.WPM))
                } else { intents.append(.prepare(unit: next.unit, position: next.positionSeconds, rate: next.rate, delayMilliseconds: delay)) }
            }
        }
        switch event {
        case .resume: resume(delay: 0)
        case .stageEntry:
            if !next.running {
                if next.phase == .speaking && !next.isSilent { next.phase = .ready; next.positionSeconds = 0 }
                resume(delay: 1000)
            }
        case .pause: next.running = false; intents = [.stop]
        case let .position(seconds):
            guard seconds.isFinite, seconds >= 0 else { throw LearningError.invalidEvent }
            if next.phase == .listening && next.running { next.positionSeconds = seconds }
        case .playbackEnded:
            if next.phase == .listening && next.running { next.phase = .speaking; next.positionSeconds = 0; intents = [.stop] }
        case .confirm:
            if next.phase == .speaking && next.running {
                confirm()
                if next.isSilent { next = LearningNavigation.advance(next) }
            }
        case .repeat:
            if next.canRepeat {
                if next.finalSpeakingCycle { confirm() }
                for index in next.currentSources where !next.sourceProgress[index].closed {
                    next.sourceProgress[index].planned += 2
                }
                next.phase = .ready; next.running = false
            }
        case .next:
            if next.canNext {
                if next.finalSpeakingCycle { confirm() }
                next = LearningNavigation.advance(next)
            }
        case let .selectSource(index):
            guard (0..<next.plan.sourceCount).contains(index) else { throw LearningError.invalidEvent }
            if next.phase != .complete { next = LearningNavigation.select(next, unit: index / next.plan.groupSize); intents = [.stop] }
        case let .changeRate(rate):
            guard !next.running, LearningPreferences.validRate(rate) else { throw LearningError.invalidEvent }
            next.rate = rate
        case let .changeRevealSpeed(level, presets):
            guard !next.running, let previous = next.reveal, (1...4).contains(level),
                  presets.count == 4, presets.allSatisfy({ (1...999).contains($0) }) else { throw LearningError.invalidEvent }
            let WPM = presets[level - 1]
            next.positionSeconds *= Double(previous.WPM) / Double(WPM)
            next.reveal = RevealSpeed(level: level, WPM: WPM)
        case let .regroup(size, newPlanID):
            next = try LearningRegrouping.apply(next, size: size, newPlanID: newPlanID)
            if next != state { intents = [.stop] }
        }
        try next.validate()
        return SessionTransition(previous: state, session: next, confirmedSources: receipts,
                                 completed: next.phase == .complete && state.phase != .complete, intents: intents)
    }
}
