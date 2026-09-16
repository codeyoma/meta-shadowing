import ExpoModulesCore
import Foundation

private let preferenceKey = "learning.haptics.enabled"

struct HapticPulseRecord: Record {
  @Field var time: Double = 0
  @Field var intensity: Float = 0
  @Field var sharpness: Float = 0.5
}

public final class LearningHapticsModule: Module {
  @MainActor private var feedback: CycleHapticPlayer?

  public func definition() -> ModuleDefinition {
    Name("LearningHaptics")
    Function("isEnabled") { Self.enabled }
    AsyncFunction("setEnabled") { (enabled: Bool) in
      MainActor.assumeIsolated {
        UserDefaults.standard.set(enabled, forKey: preferenceKey)
        if !enabled { self.feedback?.stop() }
      }
    }.runOnQueue(.main)
    AsyncFunction("prepare") {
      MainActor.assumeIsolated {
        guard Self.enabled else { return }
        self.player().prepare()
      }
    }.runOnQueue(.main)
    AsyncFunction("play") { (pulses: [HapticPulseRecord]) in
      MainActor.assumeIsolated {
        guard Self.enabled else { return }
        self.player().play(pulses)
      }
    }.runOnQueue(.main)
    AsyncFunction("stop") {
      MainActor.assumeIsolated { self.feedback?.stop() }
    }.runOnQueue(.main)
    OnAppEntersBackground {
      Task { @MainActor in self.feedback?.stop() }
    }
    OnDestroy {
      Task { @MainActor in self.feedback?.stop() }
    }
  }

  private static var enabled: Bool {
    UserDefaults.standard.object(forKey: preferenceKey) as? Bool ?? true
  }

  @MainActor private func player() -> CycleHapticPlayer {
    if let feedback { return feedback }
    let created = CycleHapticPlayer()
    feedback = created
    return created
  }
}
