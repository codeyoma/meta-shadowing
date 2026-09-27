import Foundation

public struct UnitProgress: Codable, Equatable, Sendable {
    public let confirmed: Int
    public let planned: Int
    public init(confirmed: Int, planned: Int) { self.confirmed = confirmed; self.planned = planned }
}
public struct SourceProgress: Codable, Equatable, Sendable {
    public internal(set) var confirmed: Int
    public internal(set) var planned: Int
    public internal(set) var closed: Bool
    public init(confirmed: Int, planned: Int, closed: Bool = false) {
        self.confirmed = confirmed; self.planned = planned; self.closed = closed
    }
}
public struct SourceOrdinal: Codable, Hashable, Sendable {
    public let source: Int
    public let ordinal: Int
    public init(source: Int, ordinal: Int) { self.source = source; self.ordinal = ordinal }
}
public struct RevealSpeed: Codable, Equatable, Sendable {
    public let level: Int
    public let WPM: Int
}

public struct LearningSession: Codable, Equatable, Sendable {
    public enum Phase: String, Codable, Sendable { case ready, listening, speaking, decision, complete }
    public internal(set) var plan: LearningPlan
    public internal(set) var sourceProgress: [SourceProgress]
    public internal(set) var unit: Int
    public internal(set) var phase: Phase
    public internal(set) var running: Bool
    public internal(set) var rate: Double
    public internal(set) var positionSeconds: Double
    public internal(set) var reveal: RevealSpeed?
    public var isSilent: Bool { plan.scope.stage >= 11 }
    public var unitCount: Int { (plan.sourceCount + plan.groupSize - 1) / plan.groupSize }
    public var currentSources: Range<Int> {
        let start = unit * plan.groupSize
        return start..<min(start + plan.groupSize, plan.sourceCount)
    }
    public var units: [UnitProgress] {
        stride(from: 0, to: plan.sourceCount, by: plan.groupSize).map { start in
            let members = sourceProgress[start..<min(start + plan.groupSize, plan.sourceCount)]
            let planned = members.map(\.planned).max() ?? 0
            return UnitProgress(confirmed: planned - (members.map { $0.planned - $0.confirmed }.max() ?? 0), planned: planned)
        }
    }
    public var current: UnitProgress { units[unit] }
    public var showsThirdCycleChoices: Bool {
        !isSilent && current.planned == 3 && current.confirmed == 2 && (phase == .listening || phase == .speaking)
    }
    var finalSpeakingCycle: Bool {
        phase == .speaking && (isSilent || [3, 5].contains(current.planned)) && current.confirmed + 1 == current.planned
    }
    public var canRepeat: Bool {
        !isSilent && current.planned == 3 && (phase == .decision || finalSpeakingCycle)
            && !currentSources.allSatisfy { sourceProgress[$0].closed }
    }
    public var canNext: Bool { phase == .decision || finalSpeakingCycle }

    public static func start(plan: LearningPlan, preferences: LearningPreferences) throws -> Self {
        guard LearningPreferences.validRate(preferences.rate), preferences.revealWPM.count == 4,
              preferences.revealWPM.allSatisfy({ (1...999).contains($0) }) else { throw LearningError.invalidPreferences }
        let silent = plan.scope.stage >= 11
        return Self(plan: plan, sourceProgress: Array(repeating: SourceProgress(confirmed: 0, planned: silent ? 1 : 3), count: plan.sourceCount),
                    unit: 0, phase: .ready, running: false, rate: preferences.rate, positionSeconds: 0,
                    reveal: silent ? RevealSpeed(level: 1, WPM: preferences.revealWPM[0]) : nil)
    }

    func validate() throws {
        guard sourceProgress.count == plan.sourceCount, (0..<unitCount).contains(unit),
              LearningPreferences.validRate(rate), positionSeconds.isFinite, positionSeconds >= 0,
              sourceProgress.allSatisfy({ p in
                  p.confirmed >= 0 && p.confirmed <= p.planned && p.planned <= 100000
                      && (isSilent ? p.planned >= 1 : p.planned >= 3 && p.planned % 2 == 1)
                      && (!p.closed || p.confirmed == p.planned)
              }) else { throw LearningError.invalidState }
        if isSilent {
            guard let reveal, (1...4).contains(reveal.level), (1...999).contains(reveal.WPM) else { throw LearningError.invalidState }
        } else if reveal != nil { throw LearningError.invalidState }
        guard ([Phase.decision, .complete].contains(phase)) == (current.confirmed == current.planned),
              phase != .complete || (unit == unitCount - 1 && sourceProgress.allSatisfy { $0.confirmed == $0.planned })
        else { throw LearningError.invalidState }
    }

    public func validatedForRestore(expected: LearningScope, sourceCount: Int) throws -> Self {
        try validate()
        guard plan.scope == expected, sourceCount == plan.sourceCount else { throw LearningError.incompatibleCheckpoint }
        var result = self
        result.running = false
        if isSilent {
            result.sourceProgress = sourceProgress.map { p in
                SourceProgress(confirmed: p.confirmed, planned: p.confirmed == p.planned ? p.planned : p.confirmed + 1, closed: p.closed)
            }
        }
        return result
    }

    init(plan: LearningPlan, sourceProgress: [SourceProgress], unit: Int, phase: Phase, running: Bool,
         rate: Double, positionSeconds: Double, reveal: RevealSpeed?) {
        self.plan = plan; self.sourceProgress = sourceProgress; self.unit = unit; self.phase = phase
        self.running = running; self.rate = rate; self.positionSeconds = positionSeconds; self.reveal = reveal
    }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        self.init(plan: try c.decode(LearningPlan.self, forKey: .plan), sourceProgress: try c.decode([SourceProgress].self, forKey: .sourceProgress),
                  unit: try c.decode(Int.self, forKey: .unit), phase: try c.decode(Phase.self, forKey: .phase),
                  running: try c.decode(Bool.self, forKey: .running), rate: try c.decode(Double.self, forKey: .rate),
                  positionSeconds: try c.decode(Double.self, forKey: .positionSeconds), reveal: try c.decodeIfPresent(RevealSpeed.self, forKey: .reveal))
        try validate()
    }
}
