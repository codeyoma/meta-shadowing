import Foundation

public struct HapticPulse: Equatable, Sendable {
    public let time: Double
    public let intensity: Float
    public let sharpness: Float
    public init(time: Double, intensity: Float, sharpness: Float) throws {
        guard time.isFinite, time >= 0, intensity.isFinite, (0...1).contains(intensity),
              sharpness.isFinite, (0...1).contains(sharpness) else { throw MediaFailure.invalidAsset }
        self.time = time; self.intensity = intensity; self.sharpness = sharpness
    }
}

/// Fixed product rhythms adapted from src/core/cycle-haptics.ts and LaunchHaptics.swift.
public struct HapticPattern: Equatable, Sendable {
    public let pulses: [HapticPulse]
    public static func cycle(_ ordinal: Int) -> Self? {
        switch ordinal {
        case 1, 4: rhythm([0.45, 0.70])
        case 2: rhythm([0.45, 0.45, 0.70])
        case 3, 5: rhythm([0.45, 0.45, 0.70, 0.25])
        default: nil
        }
    }
    public static let repeatChoice = rhythm([0.45])
    public static let launch = Self(pulses: zip([0.24, 0.66, 0.89, 1.39, 1.81], [Float(0.90), 0.60, 1, 0.90, 0.60]).map {
        // These literals are validated by the schedule tests and are not external input.
        try! HapticPulse(time: $0.0, intensity: $0.1, sharpness: 0.15)
    })
    private static func rhythm(_ levels: [Float]) -> Self {
        Self(pulses: levels.enumerated().map { try! HapticPulse(time: Double($0.offset) * 0.08, intensity: $0.element, sharpness: 0.5) })
    }
}
