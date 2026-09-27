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
  @MainActor private var launchFeedback: CycleHapticPlayer?

  public func definition() -> ModuleDefinition {
    Name("LearningHaptics")
    Function("isEnabled") { Self.enabled }
    AsyncFunction("setEnabled") { (enabled: Bool) in
      MainActor.assumeIsolated {
        UserDefaults.standard.set(enabled, forKey: preferenceKey)
        if !enabled {
          self.feedback?.stop()
        }
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
    AsyncFunction("prepareLaunch") {
      MainActor.assumeIsolated {
        self.launchPlayer().prepare()
      }
    }.runOnQueue(.main)
    AsyncFunction("playLaunch") {
      MainActor.assumeIsolated {
        self.launchPlayer().playLaunch()
      }
    }.runOnQueue(.main)
    AsyncFunction("stopLaunch") {
      MainActor.assumeIsolated { self.launchFeedback?.stop() }
    }.runOnQueue(.main)
    OnAppEntersBackground {
      Task { @MainActor in
        self.feedback?.stop()
        self.launchFeedback?.stop()
      }
    }
    OnDestroy {
      Task { @MainActor in
        self.feedback?.stop()
        self.launchFeedback?.stop()
      }
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

  @MainActor private func launchPlayer() -> CycleHapticPlayer {
    if let launchFeedback { return launchFeedback }
    let created = CycleHapticPlayer()
    launchFeedback = created
    return created
  }
}
