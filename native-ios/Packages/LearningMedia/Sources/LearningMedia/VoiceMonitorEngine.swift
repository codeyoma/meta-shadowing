#if os(iOS)
import AVFoundation
import UIKit

/// Native live-through monitoring. No sample buffers are recorded or exported.
@MainActor public final class VoiceMonitorEngine: VoiceMonitorHardware {
    private let session: LessonAudioSession
    private let observation = AudioGraphObservation()
    private var graph: AVAudioEngine?
    private var voice: VoiceMonitorVoicePath?
    private var closed = false
    private var generation = UUID()
    public var onInvalidation: (@MainActor () -> Void)?
    public var running: Bool { graph?.isRunning == true }
    public init(session: LessonAudioSession) { self.session = session }
    public var permission: MicrophonePermission {
        switch AVAudioApplication.shared.recordPermission {
        case .undetermined: .undetermined
        case .granted: .granted
        default: .denied
        }
    }
    public var outputs: [MonitorOutput] {
        AVAudioSession.sharedInstance().currentRoute.outputs.map {
            switch $0.portType {
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
    public func requestPermission() async -> Bool {
        guard !closed, outputs == [.headphones], UIApplication.shared.applicationState == .active else { return false }
        return await AVAudioApplication.requestRecordPermission()
    }
    public func start(gain: Float) async throws {
        guard !closed, permission == .granted, outputs == [.headphones], UIApplication.shared.applicationState == .active else { throw MediaFailure.accessDenied }
        stop()
        let current = generation
        do {
            try await session.acquireMonitoring()
            guard !closed, current == generation, UIApplication.shared.applicationState == .active else { throw MediaFailure.cancelled }
            let audio = AVAudioSession.sharedInstance()
            let inputs = audio.availableInputs ?? []
            guard outputs == [.headphones],
                  let input = inputs.first(where: { $0.portType == .headsetMic }) ?? inputs.first(where: { $0.portType == .builtInMic }) else { throw MediaFailure.unavailable }
            try audio.setPreferredInput(input)
            guard audio.currentRoute.inputs.count == 1, audio.currentRoute.inputs.first?.portType == input.portType,
                  outputs == [.headphones] else { throw MediaFailure.accessDenied }
            let next = AVAudioEngine()
            let format = next.inputNode.outputFormat(forBus: 0)
            guard format.channelCount > 0, format.sampleRate > 0 else { throw MediaFailure.unavailable }
            let path = VoiceMonitorVoicePath(engine: next, input: next.inputNode, format: format)
            graph = next; voice = path
            observation.watch(next) { [weak self, weak next] in
                guard let self, let next, self.graph === next else { return }
                self.stop(); self.onInvalidation?()
            }
            next.prepare(); try next.start()
            guard graph === next, next.isRunning, outputs == [.headphones], UIApplication.shared.applicationState == .active else { throw MediaFailure.cancelled }
            path.setGain(gain)
        } catch { if current == generation { stop() }; throw error }
    }
    public func stop() {
        generation = UUID()
        observation.stop(); voice?.setGain(0); graph?.stop()
        graph = nil; voice = nil; session.releaseMonitoring()
    }
    public func setGain(_ gain: Float) {
        guard running, outputs == [.headphones] else { stop(); onInvalidation?(); return }
        voice?.setGain(gain)
    }
    public func close() { closed = true; stop(); onInvalidation = nil }
}
#endif
