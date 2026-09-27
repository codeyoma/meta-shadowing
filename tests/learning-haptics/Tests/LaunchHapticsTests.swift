import CoreHaptics
import Foundation
import Testing

struct LaunchHapticsTests {
  @Test func mouthOpeningsProduceFiveDoubledIntensityTransientsCappedAtOneWithoutAudio() throws {
    let pattern = try LaunchHapticPattern.make()
    let exported = try pattern.exportDictionary()
    let entries = try #require(exported[.pattern] as? [[String: Any]])
    #expect(entries.count == 5)
    let times = [0.24, 0.66, 0.89, 1.39, 1.81]
    let intensities = [0.90, 0.60, 1.00, 0.90, 0.60]
    for (index, entry) in entries.enumerated() {
      let event = try #require(entry[CHHapticPattern.Key.event.rawValue] as? [String: Any])
      #expect(event[CHHapticPattern.Key.eventType.rawValue] as? String == CHHapticEvent.EventType.hapticTransient.rawValue)
      let time = try #require(event[CHHapticPattern.Key.time.rawValue] as? Double)
      #expect(abs(time - times[index]) < 0.0001)
      let parameters = try #require(event[CHHapticPattern.Key.eventParameters.rawValue] as? [[String: Any]])
      func value(_ id: CHHapticEvent.ParameterID) throws -> Double {
        let parameter = try #require(parameters.first { $0[CHHapticPattern.Key.parameterID.rawValue] as? String == id.rawValue })
        return try #require(parameter[CHHapticPattern.Key.parameterValue.rawValue] as? Double)
      }
      #expect(abs(try value(.hapticIntensity) - intensities[index]) < 0.0001)
      #expect(abs(try value(.hapticSharpness) - 0.15) < 0.0001)
    }
    #expect(abs(pattern.duration - 1.81) < 0.0001, "The final closed-mouth hold is silent")
  }

}
