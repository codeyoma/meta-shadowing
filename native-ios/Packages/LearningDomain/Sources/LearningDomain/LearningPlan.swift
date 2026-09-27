import Foundation

public struct StagePolicy: Equatable, Sendable {
    public enum RevealOrder: String, Codable, Sendable { case targetFirst, translationFirst, translationOnly }
    public let isGrouped: Bool
    public let firstWordHints: Bool
    public let revealOrder: RevealOrder?
    public var isSilent: Bool { revealOrder != nil }
    public var defaultCycles: Int { isSilent ? 1 : 3 }

    public static func forStage(_ stage: Int) throws -> Self {
        guard (1...16).contains(stage) else { throw LearningError.invalidPlan }
        return Self(isGrouped: (7...10).contains(stage), firstWordHints: [5, 6, 9, 10].contains(stage),
                    revealOrder: stage < 11 ? nil : stage < 13 ? .targetFirst : stage < 15 ? .translationFirst : .translationOnly)
    }
}

public struct LearningSource: Codable, Equatable, Sendable {
    public let index: Int
    public let text: String
    public let translation: String
    public init(index: Int, text: String, translation: String) {
        self.index = index; self.text = text; self.translation = translation
    }
}

public struct LearningPlan: Codable, Equatable, Sendable {
    public let scope: LearningScope
    public let runID: String
    public let lineage: String?
    public let sources: [LearningSource]
    public let groupSize: Int
    public var sourceCount: Int { sources.count }
    public var rootRunID: String { lineage ?? runID }
    public var units: [[Int]] {
        stride(from: 0, to: sourceCount, by: groupSize).map { Array($0..<min($0 + groupSize, sourceCount)) }
    }

    public static func make(scope: LearningScope, runID: String, sources: [LearningSource], groupSize: Int) throws -> Self {
        guard (2...4).contains(groupSize) else { throw LearningError.invalidPlan }
        let policy = try StagePolicy.forStage(scope.stage)
        return try Self(scope: scope, runID: runID, lineage: nil, sources: sources, groupSize: policy.isGrouped ? groupSize : 1)
    }

    init(scope: LearningScope, runID: String, lineage: String?, sources: [LearningSource], groupSize: Int) throws {
        let policy = try StagePolicy.forStage(scope.stage)
        guard validIdentity(runID, limit: 100), (1...100000).contains(sources.count),
              sources.enumerated().allSatisfy({ $0.offset == $0.element.index }),
              policy.isGrouped ? (2...4).contains(groupSize) : groupSize == 1,
              lineage.map({ policy.isGrouped && validIdentity($0, limit: 100) && $0 != runID }) ?? true
        else { throw LearningError.invalidPlan }
        self.scope = scope; self.runID = runID; self.lineage = lineage
        self.sources = sources; self.groupSize = groupSize
    }

    public init(from decoder: any Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        try self.init(scope: values.decode(LearningScope.self, forKey: .scope),
                      runID: values.decode(String.self, forKey: .runID),
                      lineage: values.decodeIfPresent(String.self, forKey: .lineage),
                      sources: values.decode([LearningSource].self, forKey: .sources),
                      groupSize: values.decode(Int.self, forKey: .groupSize))
    }
}
