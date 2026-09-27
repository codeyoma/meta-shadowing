import AVFoundation
import UIKit
import MediaPlayer
import Testing
import LearningMedia

@MainActor struct NativeLifecycleTests {
    @Test func inactiveRemoteLeaseCannotClearAnotherOwnersMetadata() {
        let session = LessonAudioSession()
        let remote = LessonRemoteControl(session: session)
        let center = MPNowPlayingInfoCenter.default()
        let previous = center.nowPlayingInfo
        defer { center.nowPlayingInfo = previous; session.close() }
        center.nowPlayingInfo = [MPMediaItemPropertyTitle: "Other fixture owner"]
        remote.close()
        #expect(center.nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Other fixture owner")
        remote.close()
        #expect(center.nowPlayingInfo?[MPMediaItemPropertyTitle] as? String == "Other fixture owner")
    }

    @Test func retiredGraphCannotInvalidateReplacement() {
        let center = NotificationCenter()
        let observation = AudioGraphObservation(center: center)
        let first = AVAudioEngine(), second = AVAudioEngine()
        var invalidations = 0
        observation.watch(first) { invalidations += 1 }
        observation.watch(second) { invalidations += 1 }
        center.post(name: .AVAudioEngineConfigurationChange, object: first)
        #expect(invalidations == 0)
        center.post(name: .AVAudioEngineConfigurationChange, object: second)
        #expect(invalidations == 1)
        observation.stop()
        center.post(name: .AVAudioEngineConfigurationChange, object: second)
        #expect(invalidations == 1)
    }

    @Test func shutdownRemovesLifecycleObservers() {
        let center = NotificationCenter()
        var events: [LessonLifecycleEvent] = []
        let observer = LessonLifecycleObserver(center: center) { events.append($0) }
        center.post(name: UIApplication.willResignActiveNotification, object: nil)
        center.post(name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.began.rawValue])
        center.post(name: AVAudioSession.interruptionNotification, object: nil,
            userInfo: [AVAudioSessionInterruptionTypeKey: AVAudioSession.InterruptionType.ended.rawValue])
        #expect(events == [.inactive, .interrupted])
        observer.close()
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        #expect(events.count == 2)
    }
}
