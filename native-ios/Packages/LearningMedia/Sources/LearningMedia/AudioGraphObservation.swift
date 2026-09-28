import AVFoundation

/// OS notification ownership is independent of starting microphone capture.
@MainActor public final class AudioGraphObservation {
    private let center: NotificationCenter
    private var token: (any NSObjectProtocol)?
    private var generation = UUID()
    private var action: (@MainActor () -> Void)?
    public init(center: NotificationCenter = .default) { self.center = center }
    public func watch(_ graph: AVAudioEngine, invalidated: @escaping @MainActor () -> Void) {
        stop(); action = invalidated
        let current = generation
        token = center.addObserver(forName: .AVAudioEngineConfigurationChange, object: graph, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, current == self.generation else { return }
                self.action?()
            }
        }
    }
    public func stop() {
        generation = UUID()
        if let token { center.removeObserver(token) }
        token = nil; action = nil
    }
}
