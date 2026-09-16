import CoreHaptics
import UIKit

/// A single short pattern at a time; never changes the lesson's audio session.
@MainActor final class CycleHapticPlayer {
  private var engine: CHHapticEngine?
  private var player: (any CHHapticPatternPlayer)?
  private var generation = UUID()

  func prepare() {
    guard UIApplication.shared.applicationState == .active,
          CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
    do {
      if engine == nil {
        let created = try CHHapticEngine(audioSession: nil)
        created.playsHapticsOnly = true
        created.isAutoShutdownEnabled = true
        let token = UUID()
        generation = token
        // Invalidated players are never replayed after interruption or reset.
        created.stoppedHandler = { [weak self] _ in
          Task { @MainActor in self?.invalidate(token) }
        }
        created.resetHandler = { [weak self] in
          Task { @MainActor in self?.invalidate(token) }
        }
        engine = created
      }
      try engine?.start()
    } catch { stop() }
  }

  func play(_ pulses: [HapticPulseRecord]) {
    guard (1...4).contains(pulses.count), pulses.enumerated().allSatisfy({ index, pulse in
      pulse.time.isFinite && pulse.time >= 0 && pulse.time <= 0.3
        && (index == 0 ? pulse.time == 0 : pulse.time > pulses[index - 1].time)
        && pulse.intensity.isFinite && (0...1).contains(pulse.intensity)
        && pulse.sharpness.isFinite && (0...1).contains(pulse.sharpness)
    }), UIApplication.shared.applicationState == .active else { return }
    prepare()
    guard let engine else { return }
    do {
      try? player?.stop(atTime: CHHapticTimeImmediate)
      let events = pulses.map { pulse in
        CHHapticEvent(eventType: .hapticTransient, parameters: [
          CHHapticEventParameter(parameterID: .hapticIntensity, value: pulse.intensity),
          CHHapticEventParameter(parameterID: .hapticSharpness, value: pulse.sharpness),
        ], relativeTime: pulse.time)
      }
      let pattern = try CHHapticPattern(events: events, parameters: [])
      let next = try engine.makePlayer(with: pattern)
      player = next
      try next.start(atTime: CHHapticTimeImmediate)
    } catch { stop() }
  }

  func stop() {
    generation = UUID()
    try? player?.stop(atTime: CHHapticTimeImmediate)
    player = nil
    engine?.stoppedHandler = { _ in }
    engine?.resetHandler = {}
    engine?.stop(completionHandler: nil)
    engine = nil
  }

  private func invalidate(_ token: UUID) {
    guard token == generation else { return }
    stop()
  }
}
