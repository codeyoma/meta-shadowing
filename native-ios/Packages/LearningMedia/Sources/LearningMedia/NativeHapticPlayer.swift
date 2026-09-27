#if os(iOS)
import CoreHaptics
import UIKit

/// Adapted from the reviewed native CycleHapticPlayer; no Expo or shared audio session.
@MainActor public final class NativeHapticPlayer: NSObject {
    private var engine: CHHapticEngine?
    private var player: (any CHHapticPatternPlayer)?
    private var generation = UUID()
    private let honorsLearningPreference: Bool
    private let defaults: UserDefaults

    public init(honorsLearningPreference: Bool = true, defaults: UserDefaults = .standard) {
        self.honorsLearningPreference = honorsLearningPreference; self.defaults = defaults
        super.init()
        NotificationCenter.default.addObserver(self, selector: #selector(stop), name: UIApplication.willResignActiveNotification, object: nil)
    }
    private var enabled: Bool {
        !honorsLearningPreference || defaults.object(forKey: "learning.haptics.enabled") == nil || defaults.bool(forKey: "learning.haptics.enabled")
    }
    public func prepare() {
        guard enabled, UIApplication.shared.applicationState == .active,
              CHHapticEngine.capabilitiesForHardware().supportsHaptics else { return }
        do {
            if engine == nil {
                let created = try CHHapticEngine(audioSession: nil)
                created.playsHapticsOnly = true; created.isAutoShutdownEnabled = true
                let token = UUID(); generation = token
                created.stoppedHandler = { [weak self] _ in Task { @MainActor in self?.invalidate(token) } }
                created.resetHandler = { [weak self] in Task { @MainActor in self?.invalidate(token) } }
                engine = created
            }
            try engine?.start()
        } catch { stop() }
    }
    public func play(_ pattern: HapticPattern) {
        guard enabled, UIApplication.shared.applicationState == .active else { stop(); return }
        prepare()
        guard let engine else { return }
        do {
            try? player?.stop(atTime: CHHapticTimeImmediate)
            let next = try engine.makePlayer(with: Self.nativePattern(pattern))
            player = next; try next.start(atTime: CHHapticTimeImmediate)
        } catch { stop() }
    }
    public static func nativePattern(_ pattern: HapticPattern) throws -> CHHapticPattern {
        try CHHapticPattern(events: pattern.pulses.map {
            CHHapticEvent(eventType: .hapticTransient, parameters: [
                .init(parameterID: .hapticIntensity, value: $0.intensity),
                .init(parameterID: .hapticSharpness, value: $0.sharpness)
            ], relativeTime: $0.time)
        }, parameters: [])
    }
    @objc public func stop() {
        generation = UUID(); try? player?.stop(atTime: CHHapticTimeImmediate); player = nil
        engine?.stoppedHandler = { _ in }; engine?.resetHandler = {}
        engine?.stop(completionHandler: nil); engine = nil
    }
    private func invalidate(_ token: UUID) { if token == generation { stop() } }
}
#endif
