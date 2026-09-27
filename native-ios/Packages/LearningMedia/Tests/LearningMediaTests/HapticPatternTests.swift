import Testing
import LearningMedia

struct HapticPatternTests {
    @Test func cyclesAndRepeatKeepTheirRhythms() throws {
        let levels: [[Float]] = [[0.45, 0.70], [0.45, 0.45, 0.70], [0.45, 0.45, 0.70, 0.25], [0.45, 0.70], [0.45, 0.45, 0.70, 0.25]]
        for (index, expected) in levels.enumerated() {
            let pattern = try #require(HapticPattern.cycle(index + 1))
            #expect(pattern.pulses.map(\.intensity) == expected)
            #expect(pattern.pulses.map(\.time) == Array([0, 0.08, 0.16, 0.24].prefix(expected.count)))
            #expect(pattern.pulses.allSatisfy { $0.sharpness == 0.5 })
        }
        #expect(HapticPattern.repeatChoice.pulses.map(\.intensity) == [0.45])
        #expect(HapticPattern.cycle(0) == nil && HapticPattern.cycle(6) == nil)
    }
    @Test func launchUsesAlreadyDoubledMouthOpeningSchedule() {
        #expect(HapticPattern.launch.pulses.map(\.time) == [0.24, 0.66, 0.89, 1.39, 1.81])
        #expect(HapticPattern.launch.pulses.map(\.intensity) == [0.90, 0.60, 1, 0.90, 0.60])
        #expect(HapticPattern.launch.pulses.allSatisfy { $0.sharpness == 0.15 })
    }
    @Test func rejectsInvalidPulses() {
        #expect(throws: MediaFailure.self) { try HapticPulse(time: .nan, intensity: 0.5, sharpness: 0.5) }
        #expect(throws: MediaFailure.self) { try HapticPulse(time: -1, intensity: 0.5, sharpness: 0.5) }
        #expect(throws: MediaFailure.self) { try HapticPulse(time: 0, intensity: 2, sharpness: 0.5) }
        #expect(throws: MediaFailure.self) { try HapticPulse(time: 0, intensity: 0.5, sharpness: .infinity) }
    }
}
