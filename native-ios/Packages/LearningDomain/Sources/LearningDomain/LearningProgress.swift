import Foundation

public struct StudyDay: Codable, Hashable, Comparable, Sendable {
    public let rawValue: String
    public init(_ value: String) throws {
        let pieces = value.split(separator: "-", omittingEmptySubsequences: false)
        guard value.utf8.count == 10, pieces.count == 3, pieces[0].count == 4, pieces[1].count == 2, pieces[2].count == 2,
              pieces.allSatisfy({ $0.allSatisfy({ $0.isASCII && $0.isNumber }) }),
              let year = Int(pieces[0]), (1...9999).contains(year),
              let month = Int(pieces[1]), let day = Int(pieces[2]),
              let date = Self.calendar.date(from: DateComponents(year: year, month: month, day: day)),
              Self.calendar.component(.year, from: date) == year,
              Self.calendar.component(.month, from: date) == month,
              Self.calendar.component(.day, from: date) == day else { throw LearningError.invalidState }
        rawValue = value
    }
    private static var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }
    public static func at(_ date: Date, calendar: Calendar) throws -> Self {
        guard date.timeIntervalSince1970.isFinite else { throw LearningError.invalidState }
        var gregorian = Self.calendar
        gregorian.timeZone = calendar.timeZone
        let parts = gregorian.dateComponents([.year, .month, .day], from: date)
        guard let year = parts.year, let month = parts.month, let day = parts.day else { throw LearningError.invalidState }
        return try Self(String(format: "%04d-%02d-%02d", year, month, day))
    }
    public var previous: Self? {
        let parts = rawValue.split(separator: "-").compactMap { Int($0) }
        guard let date = Self.calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2])),
              let previous = Self.calendar.date(byAdding: .day, value: -1, to: date) else { return nil }
        return try? Self.at(previous, calendar: Self.calendar)
    }
    public static func streak(days: Set<Self>, today: Self) -> Int {
        var cursor: Self? = days.contains(today) ? today : today.previous
        var count = 0
        while let day = cursor, days.contains(day) { count += 1; cursor = day.previous }
        return count
    }
    public static func < (lhs: Self, rhs: Self) -> Bool { lhs.rawValue < rhs.rawValue }
    public init(from decoder: any Decoder) throws { try self.init(decoder.singleValueContainer().decode(String.self)) }
    public func encode(to encoder: any Encoder) throws {
        var container = encoder.singleValueContainer(); try container.encode(rawValue)
    }
}

public struct LevelProgress: Codable, Equatable, Sendable {
    public let level: Int
    public let current: Int64
    public let required: Int64
    public let maxLevel: Bool
    public static let maximumXP: Int64 = 2_147_483_647
    public static let thresholds: [Int64] = {
        var sum: Int64 = 0
        return (0..<998).map { exponent in
            sum += Int64((10 * pow(1.0053, Double(exponent))).rounded()) * 10
            return sum
        }
    }()
    public static func forXP(_ value: Int64) throws -> Self {
        guard value >= 0 else { throw LearningError.invalidState }
        let xp = min(value, maximumXP)
        guard let index = thresholds.firstIndex(where: { xp < $0 }) else {
            return Self(level: 999, current: 1, required: 1, maxLevel: true)
        }
        let start = index == 0 ? 0 : thresholds[index - 1]
        return Self(level: index + 1, current: xp - start, required: thresholds[index] - start, maxLevel: false)
    }
}

public enum StageProgress {
    public static func canOpen(stage: Int, completedRuns: [Int: Int], verifiedTestAccess: Bool) -> Bool {
        (1...16).contains(stage) && (stage == 1 || verifiedTestAccess || completedRuns[stage - 1, default: 0] >= 3)
    }
}

public struct LearningSelection: Codable, Equatable, Sendable {
    public let packageKey: String
    public let language: String
    public let book: String
    public let stage: Int
    public let stamp: String
    public init(scope: LearningScope, stamp: String) throws {
        try LearningBackupCodec.validateStamp(stamp)
        packageKey = scope.packageKey; language = scope.language; book = scope.book; stage = scope.stage; self.stamp = stamp
    }
}

public struct LearningProgress: Codable, Equatable, Sendable {
    public let xp: Int64
    public let level: LevelProgress
    public let streak: Int
    public let completedRuns: [Int: Int]
    public let latestLearning: LearningSelection?
    public init(xp: Int64, streak: Int, completedRuns: [Int: Int], latestLearning: LearningSelection? = nil) throws {
        guard xp >= 0, xp <= LevelProgress.maximumXP, streak >= 0,
              completedRuns.allSatisfy({ (1...16).contains($0.key) && $0.value >= 0 }) else { throw LearningError.invalidState }
        self.xp = xp; level = try .forXP(xp); self.streak = streak; self.completedRuns = completedRuns
        self.latestLearning = latestLearning
    }
}
