import Foundation

public enum AnalysisError: Error, Equatable, Sendable { case invalid, unavailable, denied }

public struct AnalysisToken: Equatable, Sendable {
    public let text: String
    public let offset: Int
    public let pos: String
    public let head: Int
    public let relation: String
}
public struct AnalysisSentence: Identifiable, Equatable, Sendable {
    public let id: String
    public let sourceIndex: Int
    public let text: String
    public let tokens: [AnalysisToken]
}
