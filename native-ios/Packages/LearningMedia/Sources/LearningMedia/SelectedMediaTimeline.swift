import Foundation

/// Checkpoint time counts selected material, never an excluded source gap.
public struct SelectedMediaTimeline: Sendable, Equatable {
    public struct Location: Sendable, Equatable {
        public let member: Int
        public let localSeconds: Double
    }
    public let durations: [Double]
    public let duration: Double

    public init(durations: [Double]) throws {
        guard (1...4).contains(durations.count), durations.allSatisfy({ $0.isFinite && $0 > 0 }),
              durations.reduce(0, +).isFinite else { throw MediaFailure.invalidAsset }
        self.durations = durations
        duration = durations.reduce(0, +)
    }

    public func locate(_ seconds: Double) throws -> Location {
        guard seconds.isFinite, seconds >= 0, seconds <= duration else { throw MediaFailure.invalidAsset }
        var prefix = 0.0
        for (index, length) in durations.enumerated() {
            if seconds < prefix + length || index == durations.count - 1 {
                return Location(member: index, localSeconds: seconds - prefix)
            }
            prefix += length
        }
        throw MediaFailure.invalidAsset
    }

    public func position(member: Int, localSeconds: Double) throws -> Double {
        guard durations.indices.contains(member), localSeconds.isFinite else { throw MediaFailure.invalidAsset }
        return durations.prefix(member).reduce(0, +) + min(durations[member], max(0, localSeconds))
    }
}
