import Foundation

enum MonitorOutput { case headphones, speaker, receiver, bluetooth, airplay, usb, other }
enum MonitorInput { case headset, builtIn, usb, other }

enum VoiceMonitorPolicy {
  static func allows(_ outputs: [MonitorOutput]) -> Bool { outputs == [.headphones] }
  static func preferredInput(_ inputs: [MonitorInput]) -> MonitorInput? {
    inputs.contains(.headset) ? .headset : inputs.contains(.builtIn) ? .builtIn : nil
  }
  static func gain(_ value: Float) -> Float { value.isFinite ? min(1, max(0, value)) : 0.25 }
  // Learning monitoring is a normal feature. Runtime route/permission checks
  // remain authoritative in every build configuration.
  static let monitoringSupported = true
}

@MainActor
protocol VoiceMonitorHardware: AnyObject {
  var outputs: [MonitorOutput] { get }
  var inputs: [MonitorInput] { get }
  func requestPermission() async -> Bool
  func start(gain: Float) throws
  func stop()
  func setGain(_ gain: Float)
}
