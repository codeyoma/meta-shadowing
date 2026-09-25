#if os(iOS)
import AVFoundation
import UIKit

/// The render path is entirely AVAudioEngine. This object only controls it.
@MainActor
final class VoiceMonitorEngine: VoiceMonitorHardware {
  private let session = AVAudioSession.sharedInstance()
  private let allowed: Bool
  private let files: MonitorSampleFiles
  private var graph: AVAudioEngine?
  private var voice: VoiceMonitorVoicePath?
  private var sample: AVAudioPlayerNode?
  private var sampleFormat: AVAudioFormat?
  private var observers: [NSObjectProtocol] = []
  private var ownsSession = false
  private var stopped = false
  var onInvalidation: (() -> Void)?
  var onInactive: (() -> Void)?
  var running: Bool { graph?.isRunning == true }

  init(allowed: Bool = VoiceMonitorPolicy.monitoringSupported,
       packages: URL = URL.documentsDirectory.appendingPathComponent("lesson-packages")) {
    self.allowed = allowed
    files = MonitorSampleFiles(packages: packages)
    let center = NotificationCenter.default
    for name in [AVAudioSession.routeChangeNotification, AVAudioSession.interruptionNotification,
                 AVAudioSession.mediaServicesWereLostNotification, AVAudioSession.mediaServicesWereResetNotification,
                 UIApplication.willResignActiveNotification] {
      observers.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
        let reason = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
        MainActor.assumeIsolated {
          guard let self else { return }
          if name == UIApplication.willResignActiveNotification {
            self.onInactive?()
            return
          }
          // Our own category activation may post a queued notification. It is
          // not a disconnect; every route-affecting operation is checked below.
          if name == AVAudioSession.routeChangeNotification,
             reason == AVAudioSession.RouteChangeReason.categoryChange.rawValue,
             self.ownsSession, self.session.category == .playAndRecord,
             VoiceMonitorPolicy.allows(self.outputs) { return }
          self.stop()
          self.onInvalidation?()
        }
      })
    }
  }

  var outputs: [MonitorOutput] {
    session.currentRoute.outputs.map { port in
      switch port.portType {
      case .headphones: .headphones
      case .builtInSpeaker: .speaker
      case .builtInReceiver: .receiver
      case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE: .bluetooth
      case .airPlay: .airplay
      case .usbAudio: .usb
      default: .other
      }
    }
  }
  private func kind(_ port: AVAudioSessionPortDescription) -> MonitorInput {
    switch port.portType {
    case .headsetMic: .headset
    case .builtInMic: .builtIn
    case .usbAudio: .usb
    default: .other
    }
  }
  var inputs: [MonitorInput] { (session.availableInputs ?? []).map(kind) }
  var activeInput: String? {
    guard running, let input = session.currentRoute.inputs.first else { return nil }
    switch kind(input) { case .headset: return "headset"; case .builtIn: return "builtIn"; default: return nil }
  }

  func requestPermission() async -> Bool {
    guard allowed, !stopped, VoiceMonitorPolicy.allows(outputs) else { return false }
    return await AVAudioApplication.requestRecordPermission()
  }

  func start(gain: Float) throws {
    guard allowed, !stopped, UIApplication.shared.applicationState == .active,
          VoiceMonitorPolicy.allows(outputs) else { throw LocalAudioError.invalidInput }
    stop()
    ownsSession = true
    do {
      try session.setCategory(.playAndRecord, mode: .default, options: [])
      try session.setPreferredIOBufferDuration(0.005)
      try session.setActive(true)
      guard ownsSession, VoiceMonitorPolicy.allows(outputs),
            let preferred = VoiceMonitorPolicy.preferredInput(inputs),
            let port = session.availableInputs?.first(where: { kind($0) == preferred }) else { throw LocalAudioError.invalidInput }
      try session.setPreferredInput(port)
      guard ownsSession, VoiceMonitorPolicy.allows(outputs),
            session.currentRoute.inputs.count == 1,
            session.currentRoute.inputs.first.map(kind) == preferred else { throw LocalAudioError.invalidInput }

      let engine = AVAudioEngine()
      let player = AVAudioPlayerNode()
      let inputFormat = engine.inputNode.outputFormat(forBus: 0)
      let outputFormat = engine.outputNode.inputFormat(forBus: 0)
      guard inputFormat.channelCount > 0, inputFormat.sampleRate > 0,
            outputFormat.channelCount > 0, outputFormat.sampleRate > 0 else { throw LocalAudioError.unavailableAudio }
      let voicePath = VoiceMonitorVoicePath(engine: engine, input: engine.inputNode, format: inputFormat)
      // Attach the sample branch up front, before starting the graph. Its file
      // format is independent from the microphone hardware's sample rate.
      let first = files.packages.appendingPathComponent("morning-notes-v1/audio/phrase-01.m4a")
      if let url = try? files.resolve(first.absoluteString), let file = try? AVAudioFile(forReading: url) {
        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: file.processingFormat)
        sample = player
        sampleFormat = file.processingFormat
      }
      graph = engine
      voice = voicePath
      // Keep the non-Sendable engine capture entirely on MainActor. The
      // notification callback transfers only this Sendable actor-bound action.
      let invalidateGraph: @MainActor @Sendable () -> Void = { [weak self, weak engine] in
        guard let self, let engine, self.graph === engine else { return }
        self.stop()
        self.onInvalidation?()
      }
      observers.append(NotificationCenter.default.addObserver(forName: .AVAudioEngineConfigurationChange,
        object: engine, queue: .main) { _ in
          MainActor.assumeIsolated { invalidateGraph() }
        })
      engine.prepare()
      try engine.start()
      guard ownsSession, graph === engine, engine.isRunning, VoiceMonitorPolicy.allows(outputs),
            UIApplication.shared.applicationState == .active else { throw LocalAudioError.invalidInput }
      voicePath.setGain(gain)
    } catch { stop(); throw error }
  }

  func stop() {
    voice?.setGain(0)
    sample?.stop()
    graph?.stop()
    graph = nil
    voice = nil
    sample = nil
    sampleFormat = nil
    if ownsSession {
      ownsSession = false
      try? session.setActive(false, options: .notifyOthersOnDeactivation)
    }
  }

  func setGain(_ gain: Float) {
    guard running, VoiceMonitorPolicy.allows(outputs) else { stop(); onInvalidation?(); return }
    voice?.setGain(gain)
  }

  func playSample(_ uri: String) throws {
    guard allowed, !stopped, running, VoiceMonitorPolicy.allows(outputs), let sample,
          let sampleFormat else { throw LocalAudioError.invalidInput }
    let file = try AVAudioFile(forReading: files.resolve(uri))
    guard file.length > 0, file.processingFormat == sampleFormat else { throw LocalAudioError.unavailableAudio }
    sample.stop()
    sample.scheduleFile(file, at: nil)
    sample.play()
  }
  func stopSample() { sample?.stop() }
  func configurePlayback() throws {
    try session.setCategory(.playback, mode: .default, options: [])
  }
  func shutdown() {
    stopped = true
    stop()
    observers.forEach(NotificationCenter.default.removeObserver)
    observers.removeAll()
  }

  func diagnostics() -> [String: Any] {
    let permission: String
    switch AVAudioApplication.shared.recordPermission {
    case .undetermined: permission = "undetermined"
    case .denied: permission = "denied"
    case .granted: permission = "granted"
    @unknown default: permission = "denied"
    }
    return ["input": activeInput as Any? ?? NSNull(),
     "permission": permission,
     "output": outputs.isEmpty ? "none" : VoiceMonitorPolicy.allows(outputs) ? "headphones" : "unsupported",
     "sampleRate": running ? session.sampleRate as Any : NSNull(),
     "bufferSeconds": running ? session.ioBufferDuration as Any : NSNull(),
     "inputLatencySeconds": running ? session.inputLatency as Any : NSNull(),
     "outputLatencySeconds": running ? session.outputLatency as Any : NSNull()]
  }
}

@MainActor
final class VoiceMonitorService {
  private let engine = VoiceMonitorEngine()
  private let controller: VoiceMonitorController
  private var invalidationVersion = 0
  var onChange: (([String: Any]) -> Void)?
  init(lifetime: MonitorLifetime) {
    controller = VoiceMonitorController(hardware: engine, allowed: VoiceMonitorPolicy.monitoringSupported, defaults: .standard, lifetime: lifetime)
    engine.onInvalidation = { [weak self] in
      guard let self else { return }
      self.invalidationVersion += 1
      self.controller.invalidate()
    }
    engine.onInactive = { [weak self] in self?.controller.applicationBecameInactive() }
    controller.onChange = { [weak self] in guard let self else { return }; self.onChange?(self.status) }
  }
  var status: [String: Any] {
    var value = engine.diagnostics()
    value["state"] = controller.state.rawValue
    value["gain"] = controller.gain
    // Unlike a permission-sheet inactivity cancellation, an audio invalidation
    // must never be automatically retried on the same wired connection.
    value["invalidationVersion"] = invalidationVersion
    return value
  }
  func queuedEnable() -> @MainActor () async -> Void { controller.queuedEnable() }
  func disable() { controller.disable() }
  func configurePlayback() throws { try controller.configurePlayback { try engine.configurePlayback() } }
  func gain(_ value: Float) { controller.setGain(value) }
  func play(_ uri: String) throws { try engine.playSample(uri) }
  func stopSample() { engine.stopSample() }
  func shutdown() { controller.disable(); engine.shutdown(); onChange = nil }
}
#endif
