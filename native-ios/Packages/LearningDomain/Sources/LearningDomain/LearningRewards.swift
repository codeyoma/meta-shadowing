import Foundation

public struct CreditCandidate: Codable, Hashable, Sendable {
    public var credited: Int64
    public var counts: [Int]
    public init(credited: Int64, counts: [Int]) { self.credited = credited; self.counts = counts }
}
public struct ConfirmationReceipt: Codable, Hashable, Sendable {
    public var unit: Int
    public var ordinal: Int
    public var day: StudyDay
    public var multiplier: Int?
    public var weight: Int?
    public var sources: [SourceOrdinal]?
}
public struct RewardRun: Codable, Equatable, Sendable {
    public var scope: LearningScope
    public var runID: String
    public var lineage: String?
    public var sourceCount: Int
    public var groupSize: Int
    public var observed: [Int]
    public var candidates: [CreditCandidate]
    public var events: [ConfirmationReceipt]
    var key: RunKey { RunKey(profile: scope.profileID, package: scope.packageKey, stage: scope.stage, run: runID) }
    var rootKey: RunKey { RunKey(profile: scope.profileID, package: scope.packageKey, stage: scope.stage, run: lineage ?? runID) }

    func validate() throws {
        guard validIdentity(runID, limit: 100), lineage.map({ validIdentity($0, limit: 100) && $0 != runID }) ?? true,
              (0...100_000).contains(sourceCount), !observed.isEmpty, observed.count <= 100_000,
              observed.allSatisfy({ (0...100_000).contains($0) }), !candidates.isEmpty, candidates.count <= 100_000,
              (sourceCount == 0 && groupSize == 0 || sourceCount > 0 && (1...4).contains(groupSize)
               && observed.count == (sourceCount + groupSize - 1) / groupSize),
              candidates.allSatisfy({ (0...LevelProgress.maximumXP).contains($0.credited)
                  && $0.counts.count == observed.count && zip($0.counts, observed).allSatisfy({ $0 >= 0 && $0 <= $1 }) }),
              events.count <= 100_000 else { throw LearningError.invalidState }
        var keys: Set<String> = []
        for event in events {
            guard sourceCount > 0, observed.indices.contains(event.unit), event.ordinal >= 1, event.ordinal <= observed[event.unit],
                  event.multiplier == nil || event.multiplier == 3,
                  event.weight.map({ (1...groupSize).contains($0) }) ?? true,
                  keys.insert("\(event.unit):\(event.ordinal)").inserted else { throw LearningError.invalidState }
            if let sources = event.sources {
                guard !sources.isEmpty, sources.count == (event.weight ?? min(groupSize, sourceCount - event.unit * groupSize)),
                      Set(sources.map(\.source)).count == sources.count,
                      sources.allSatisfy({ (event.unit * groupSize..<min(sourceCount, (event.unit + 1) * groupSize)).contains($0.source)
                          && (1...100_000).contains($0.ordinal) }) else { throw LearningError.invalidState }
            }
        }
        if lineage != nil {
            guard (7...10).contains(scope.stage), sourceCount > 0, candidates.count == 1,
                  candidates[0].credited == 0 else { throw LearningError.invalidState }
        }
    }
    func credit(_ candidate: CreditCandidate) throws -> Int64 {
        var value = candidate.credited
        for event in events where event.ordinal > candidate.counts[event.unit] {
            let weight = event.weight ?? min(groupSize, sourceCount - event.unit * groupSize)
            value = try checkedAdd(value, Int64(weight * (event.multiplier ?? 1)))
        }
        return min(LevelProgress.maximumXP, value)
    }
    public func totalXP() throws -> Int64 { try validate(); return try candidates.map(credit).max() ?? 0 }
    func merged(with other: Self) throws -> Self {
        guard key == other.key, scope == other.scope, lineage == other.lineage, observed.count == other.observed.count,
              sourceCount == 0 || other.sourceCount == 0 || (sourceCount == other.sourceCount && groupSize == other.groupSize)
        else { throw LearningError.invalidState }
        var result = self
        result.sourceCount = sourceCount == 0 ? other.sourceCount : sourceCount
        result.groupSize = groupSize == 0 ? other.groupSize : groupSize
        result.observed = zip(observed, other.observed).map(max)
        result.candidates = canonical(Array(Set(candidates + other.candidates)))
        var byOrdinal: [String: ConfirmationReceipt] = [:]
        for var event in events + other.events {
            let key = "\(event.unit):\(event.ordinal)"
            if let old = byOrdinal[key] {
                guard old.weight == event.weight, old.sources == nil || event.sources == nil || old.sources == event.sources else {
                    throw LearningError.invalidState
                }
                event.day = min(old.day, event.day)
                event.sources = old.sources ?? event.sources
                if old.multiplier == 3 { event.multiplier = 3 }
            }
            byOrdinal[key] = event
        }
        result.events = canonical(Array(byOrdinal.values))
        try result.validate()
        return result
    }
}
extension RewardRun {
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        scope = try c.decode(LearningScope.self, forKey: .scope)
        runID = try c.decode(String.self, forKey: .runID)
        lineage = try c.decodeIfPresent(String.self, forKey: .lineage)
        sourceCount = try c.decode(Int.self, forKey: .sourceCount)
        groupSize = try c.decode(Int.self, forKey: .groupSize)
        observed = try c.decode([Int].self, forKey: .observed)
        candidates = try c.decode([CreditCandidate].self, forKey: .candidates)
        events = try c.decode([ConfirmationReceipt].self, forKey: .events)
        try validate()
    }
}
struct RunKey: Codable, Hashable, Sendable { let profile: String; let package: String; let stage: Int; let run: String }
public struct CompletionReceipt: Codable, Hashable, Sendable {
    public let scope: LearningScope
    public let rootRunID: String
    public let runID: String
    public let day: StudyDay
    public init(scope: LearningScope, rootRunID: String, runID: String? = nil, day: StudyDay) {
        self.scope = scope; self.rootRunID = rootRunID; self.runID = runID ?? rootRunID; self.day = day
    }
    var key: RunKey { RunKey(profile: scope.profileID, package: scope.packageKey, stage: scope.stage, run: rootRunID) }
}
public struct PracticeDay: Codable, Hashable, Sendable {
    public let profileID: String
    public let language: String
    public let day: StudyDay
}
public struct HistoricalAward: Codable, Hashable, Sendable {
    public let profileID: String
    public let language: String
    public let book: String
    public let runID: String
    public let stage: Int
    public let day: StudyDay
    public let xp: Int64
    var key: [String] { [profileID, language, book, runID] }
}

public struct RewardLedger: Codable, Equatable, Sendable {
    public private(set) var runs: [RewardRun]
    public private(set) var completions: [CompletionReceipt]
    public private(set) var studyDays: [PracticeDay]
    public private(set) var historicalAwards: [HistoricalAward]
    public init() { runs = []; completions = []; studyDays = []; historicalAwards = [] }
    public init(runs: [RewardRun], completions: [CompletionReceipt] = [], studyDays: [PracticeDay] = [], historicalAwards: [HistoricalAward] = []) throws {
        self.runs = canonical(runs); self.completions = canonical(completions); self.studyDays = canonical(Array(Set(studyDays)))
        self.historicalAwards = canonical(historicalAwards)
        try validate()
    }
    func validate() throws {
        guard runs.count <= 100_000, completions.count <= 100_000, studyDays.count <= 100_000,
              historicalAwards.count <= 100_000, Set(historicalAwards.map(\.key)).count == historicalAwards.count,
              historicalAwards.allSatisfy({ [0, 10].contains($0.xp) && (1...16).contains($0.stage)
                  && [$0.profileID, $0.language, $0.book, $0.runID].allSatisfy({ validIdentity($0) }) }),
              Set(runs.map(\.key)).count == runs.count, Set(completions.map(\.key)).count == completions.count else {
            throw LearningError.invalidState
        }
        let roots = Dictionary(uniqueKeysWithValues: runs.map { ($0.key, $0) })
        var packageBindings: [[String]: String] = [:]
        for run in runs {
            try run.validate()
            let binding = [run.scope.profileID, run.scope.packageKey]
            guard packageBindings[binding] == nil || packageBindings[binding] == run.scope.language else { throw LearningError.invalidIdentity }
            packageBindings[binding] = run.scope.language
            if run.lineage != nil {
                guard let root = roots[run.rootKey], root.lineage == nil, root.scope == run.scope,
                      root.sourceCount == run.sourceCount else { throw LearningError.invalidState }
            }
        }
        guard completions.allSatisfy({ validIdentity($0.rootRunID, limit: 100) }),
              studyDays.allSatisfy({ validIdentity($0.profileID) && validIdentity($0.language) }) else { throw LearningError.invalidState }
    }
    public func record(transition: SessionTransition, day: StudyDay) throws -> Self {
        var next = self
        try next.bind(transition.previous)
        try next.bind(transition.session)
        let state = transition.previous
        if !transition.confirmedSources.isEmpty {
            let key = RunKey(profile: state.plan.scope.profileID, package: state.plan.scope.packageKey, stage: state.plan.scope.stage, run: state.plan.runID)
            guard let index = next.runs.firstIndex(where: { $0.key == key }) else { throw LearningError.invalidState }
            var delta = next.runs[index]
            delta.events = [ConfirmationReceipt(unit: state.unit, ordinal: state.current.confirmed + 1, day: day,
                multiplier: state.isSilent ? 3 : nil,
                weight: state.plan.lineage != nil ? transition.confirmedSources.count : nil,
                sources: state.plan.groupSize > 1 ? transition.confirmedSources : nil)]
            next.runs[index] = try next.runs[index].merged(with: delta)
        }
        if transition.completed {
            let receipt = CompletionReceipt(scope: state.plan.scope, rootRunID: state.plan.rootRunID, runID: state.plan.runID, day: day)
            if !next.completions.contains(where: { $0.key == receipt.key }) { next.completions.append(receipt) }
        }
        if transition.completed || !transition.confirmedSources.isEmpty {
            next.studyDays.append(PracticeDay(profileID: state.plan.scope.profileID, language: state.plan.scope.language, day: day))
        }
        return try Self(runs: next.runs, completions: next.completions, studyDays: next.studyDays, historicalAwards: next.historicalAwards)
    }
    private mutating func bind(_ state: LearningSession) throws {
        let plan = state.plan
        let key = RunKey(profile: plan.scope.profileID, package: plan.scope.packageKey, stage: plan.scope.stage, run: plan.runID)
        if let index = runs.firstIndex(where: { $0.key == key }) {
            guard runs[index].scope == plan.scope, runs[index].sourceCount == plan.sourceCount,
                  runs[index].groupSize == plan.groupSize, runs[index].lineage == plan.lineage else { throw LearningError.invalidState }
            runs[index].observed = zip(runs[index].observed, state.units.map(\.confirmed)).map(max)
        } else {
            let counts = state.units.map(\.confirmed)
            runs.append(RewardRun(scope: plan.scope, runID: plan.runID, lineage: plan.lineage, sourceCount: plan.sourceCount,
                groupSize: plan.groupSize, observed: counts, candidates: [CreditCandidate(credited: 0, counts: counts)], events: []))
        }
    }
    public func merged(with other: Self) throws -> Self {
        try validate(); try other.validate()
        var merged = Dictionary(uniqueKeysWithValues: runs.map { ($0.key, $0) })
        for run in other.runs { merged[run.key] = try merged[run.key].map { try $0.merged(with: run) } ?? run }
        var completed = Dictionary(uniqueKeysWithValues: completions.map { ($0.key, $0) })
        for receipt in other.completions {
            if let old = completed[receipt.key] {
                guard old.scope == receipt.scope else { throw LearningError.invalidState }
                if receipt.day < old.day || receipt.day == old.day && receipt.runID < old.runID { completed[receipt.key] = receipt }
            } else { completed[receipt.key] = receipt }
        }
        var awards = Dictionary(uniqueKeysWithValues: historicalAwards.map { ($0.key, $0) })
        for award in other.historicalAwards {
            if let old = awards[award.key] {
                guard old.stage == award.stage else { throw LearningError.invalidState }
                if award.xp > old.xp || award.xp == old.xp && award.day < old.day { awards[award.key] = award }
            } else { awards[award.key] = award }
        }
        return try Self(runs: Array(merged.values), completions: Array(completed.values), studyDays: studyDays + other.studyDays, historicalAwards: Array(awards.values))
    }
    public func totalXP(language: String) throws -> Int64 {
        try validate()
        let selected = runs.filter { $0.scope.language == language }
        var total: Int64 = 0
        for group in Dictionary(grouping: selected, by: \.rootKey).values {
            if group.count == 1 { total = try checkedAdd(total, group[0].totalXP()); continue }
            guard let root = group.first(where: { $0.lineage == nil }) else { throw LearningError.invalidState }
            var best: Int64 = 0
            for candidate in root.candidates {
                var value = try root.credit(candidate)
                var seen: Set<SourceOrdinal> = []
                for run in [root] + group.filter({ $0.key != root.key }) {
                    let baseline = run.key == root.key ? candidate : run.candidates[0]
                    for event in run.events where event.ordinal > baseline.counts[event.unit] {
                        let sources = event.sources ?? (event.weight == nil ? (0..<min(run.groupSize, run.sourceCount - event.unit * run.groupSize)).map {
                            SourceOrdinal(source: event.unit * run.groupSize + $0, ordinal: event.ordinal)
                        } : [])
                        for source in sources where source.ordinal > candidate.counts[source.source / root.groupSize] {
                            if seen.insert(source).inserted && run.key != root.key { value = try checkedAdd(value, 1) }
                        }
                    }
                }
                best = max(best, value)
            }
            total = try checkedAdd(total, best)
        }
        for award in historicalAwards where award.language == language { total = try checkedAdd(total, award.xp) }
        return min(LevelProgress.maximumXP, total)
    }
    public func progress(scope: LearningScope, today: StudyDay) throws -> LearningProgress {
        let own = try Self(runs: runs.filter { $0.scope.profileID == scope.profileID },
            completions: completions.filter { $0.scope.profileID == scope.profileID }, studyDays: studyDays.filter { $0.profileID == scope.profileID },
            historicalAwards: historicalAwards.filter { $0.profileID == scope.profileID })
        let counts = Dictionary(grouping: own.completions.filter { $0.scope.packageKey == scope.packageKey && $0.scope.book == scope.book && $0.scope.language == scope.language }, by: { $0.scope.stage }).mapValues(\.count)
        return try LearningProgress(xp: own.totalXP(language: scope.language),
            streak: StudyDay.streak(days: Set(own.studyDays.filter { $0.language == scope.language }.map(\.day)), today: today), completedRuns: counts)
    }
    private enum CodingKeys: String, CodingKey { case runs, completions, studyDays, historicalAwards }
    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(runs: container.decode([RewardRun].self, forKey: .runs),
                      completions: container.decode([CompletionReceipt].self, forKey: .completions),
                      studyDays: container.decode([PracticeDay].self, forKey: .studyDays),
                      historicalAwards: container.decodeIfPresent([HistoricalAward].self, forKey: .historicalAwards) ?? [])
    }
}

func checkedAdd(_ lhs: Int64, _ rhs: Int64) throws -> Int64 {
    let result = lhs.addingReportingOverflow(rhs)
    guard !result.overflow else { throw LearningError.invalidState }
    return result.partialValue
}
private func canonical<T: Encodable>(_ values: [T]) -> [T] {
    let encoder = JSONEncoder(); encoder.outputFormatting = [.sortedKeys]
    return values.map { ($0, (try? encoder.encode($0)) ?? Data()) }.sorted { $0.1.lexicographicallyPrecedes($1.1) }.map(\.0)
}
