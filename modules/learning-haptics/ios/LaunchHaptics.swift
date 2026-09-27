import CoreHaptics
import Foundation

enum LaunchHapticPattern {
  static func make() throws -> CHHapticPattern {
    // Mouth-opening frames in talking-pup-512.webp's single 2.4-second cycle.
    // Intensity and sharpness are design tuning values, not Apple-prescribed values.
    let openings: [(time: Double, intensity: Float)] = [
      (0.24, 0.90), (0.66, 0.60), (0.89, 1.00), (1.39, 0.90), (1.81, 0.60),
    ]
    let events = openings.map { opening in
      CHHapticEvent(eventType: .hapticTransient, parameters: [
        CHHapticEventParameter(parameterID: .hapticIntensity, value: opening.intensity),
        CHHapticEventParameter(parameterID: .hapticSharpness, value: 0.15),
      ], relativeTime: opening.time)
    }
    return try CHHapticPattern(events: events, parameters: [])
  }
}
