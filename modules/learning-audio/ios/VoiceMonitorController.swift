import Foundation

/// Control stays serialized; microphone samples never leave the native audio graph.
@MainActor
final class VoiceMonitorController {
  enum State: String { case off, requesting, monitoring, blocked, denied, failed }
  static let gainKey = "voice-monitor.local-gain.v1"
  private let hardware: any VoiceMonitorHardware
  private let allowed: Bool
  private let defaults: UserDefaults?
  private let lifetime: MonitorLifetime
  private var generation = 0
  private(set) var state: State = .off { didSet { onChange?() } }
  private(set) var gain: Float
  var onChange: (() -> Void)?

  init(hardware: any VoiceMonitorHardware, allowed: Bool, defaults: UserDefaults? = nil,
       lifetime: MonitorLifetime = MonitorLifetime()) {
    self.hardware = hardware
    self.allowed = allowed
    self.defaults = defaults
    self.lifetime = lifetime
    gain = VoiceMonitorPolicy.gain((defaults?.object(forKey: Self.gainKey) as? NSNumber)?.floatValue ?? 0.25)
  }

  /// Reserve at bridge entry, not when its asynchronous task eventually runs.
  func queuedEnable() -> @MainActor () async -> Void {
    let reservation = generation
    return { [weak self] in
      guard let self, self.generation == reservation, self.lifetime.isOpen else { return }
      await self.enable()
    }
  }

  func enable() async {
    guard lifetime.isOpen else { return }
    guard state != .requesting && state != .monitoring else { return }
    guard allowed, VoiceMonitorPolicy.allows(hardware.outputs) else { state = .blocked; return }
    generation += 1
    let request = generation
    state = .requesting
    let granted = await hardware.requestPermission()
    guard request == generation, lifetime.isOpen else { return }
    guard granted else { state = .denied; return }
    guard VoiceMonitorPolicy.allows(hardware.outputs) else { state = .blocked; return }
    do {
      // Input availability is meaningful only after activating playAndRecord;
      // the hardware validates it and the route again before unmuting.
      try hardware.start(gain: gain)
      guard request == generation, lifetime.isOpen, VoiceMonitorPolicy.allows(hardware.outputs) else {
        hardware.stop()
        if request == generation { state = .blocked }
        return
      }
      state = .monitoring
    } catch {
      hardware.stop()
      if request == generation { state = .failed }
    }
  }

  func disable() {
    generation += 1
    hardware.stop()
    state = .off
  }

  func invalidate() { disable() }

  /// Serialized with enable on MainActor: lesson setup must not switch an
  /// active (or permission-pending) input/output session back to playback-only.
  func configurePlayback(_ configure: () throws -> Void) rethrows {
    guard lifetime.isOpen, state != .monitoring, state != .requesting else { return }
    try configure()
  }

  /// Existing capture may continue in the background, but a delayed permission
  /// response or queued tap must never start a new microphone session there.
  func applicationBecameInactive() {
    if state != .monitoring { disable() }
  }

  func setGain(_ value: Float) {
    gain = VoiceMonitorPolicy.gain(value)
    defaults?.set(gain, forKey: Self.gainKey)
    if state == .monitoring { hardware.setGain(gain) }
    onChange?()
  }
}
