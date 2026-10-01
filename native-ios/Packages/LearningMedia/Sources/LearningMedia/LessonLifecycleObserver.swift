#if os(iOS)
import AVFoundation
import UIKit

public enum LessonLifecycleEvent: Equatable, Sendable {
    case active, inactive, routeChanged, interrupted, reset
    case interruptionEnded(shouldResume: Bool)
}

@MainActor public final class LessonLifecycleObserver {
    private let center: NotificationCenter
    private var tokens: [any NSObjectProtocol] = []
    private var closed = false
    public init(center: NotificationCenter = .default, onEvent: @escaping @MainActor (LessonLifecycleEvent) -> Void) {
        self.center = center
        for name in [UIApplication.didBecomeActiveNotification, UIApplication.willResignActiveNotification,
                     AVAudioSession.routeChangeNotification, AVAudioSession.interruptionNotification,
                     AVAudioSession.mediaServicesWereLostNotification, AVAudioSession.mediaServicesWereResetNotification] {
            tokens.append(center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                let interruption = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt
                let options = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                let route = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt
                MainActor.assumeIsolated {
                    guard self?.closed == false else { return }
                    switch name {
                    case UIApplication.didBecomeActiveNotification: onEvent(.active)
                    case UIApplication.willResignActiveNotification: onEvent(.inactive)
                    case AVAudioSession.routeChangeNotification:
                        if route != AVAudioSession.RouteChangeReason.categoryChange.rawValue { onEvent(.routeChanged) }
                    case AVAudioSession.interruptionNotification:
                        if interruption == AVAudioSession.InterruptionType.ended.rawValue {
                            onEvent(.interruptionEnded(shouldResume: AVAudioSession.InterruptionOptions(rawValue: options).contains(.shouldResume)))
                        } else { onEvent(.interrupted) }
                    default: onEvent(.reset)
                    }
                }
            })
        }
    }
    public func close() { closed = true; tokens.forEach(center.removeObserver); tokens = [] }
}
#endif
