import Foundation

public struct LanguageStudyProgress: Equatable, Sendable {
    public let xp: Int64
    public let level: LevelProgress
    public let streak: Int
    public init(xp: Int64, streak: Int) throws {
        guard (0...LevelProgress.maximumXP).contains(xp), streak >= 0 else { throw LearningError.invalidState }
        self.xp = xp; self.streak = streak; level = try .forXP(xp)
    }
}
