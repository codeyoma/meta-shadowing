import Testing
import LearningMedia

@MainActor struct NativeHapticTests {
    @Test func fixedPatternsConstructWithoutTouchingAudioSession() throws {
        for ordinal in 1...5 {
            let pattern = try #require(HapticPattern.cycle(ordinal))
            _ = try NativeHapticPlayer.nativePattern(pattern)
        }
        _ = try NativeHapticPlayer.nativePattern(.launch)
        _ = try NativeHapticPlayer.nativePattern(.repeatChoice)
        let player = NativeHapticPlayer()
        player.stop(); player.stop()
    }
}
