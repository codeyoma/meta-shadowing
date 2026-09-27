import AppFoundation
import LearningMedia
import SwiftUI

struct LaunchGateView: View {
    let bootstrap: AppBootstrap
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var playback = LaunchPlayback()
    @State private var haptics = NativeHapticPlayer(honorsLearningPreference: false)
    @State private var artwork: LaunchArtwork?
    @State private var wordmark: CGImage?
    @State private var still: CGImage?

    private var isShowing: Bool {
        if playback.phase != .finished { return true }
        switch bootstrap.state { case .idle, .loading: return true; case .ready, .failed: return false }
    }
    var body: some View {
        ZStack {
            RootView(bootstrap: bootstrap).allowsHitTesting(!isShowing).accessibilityHidden(isShowing)
            if isShowing {
                LaunchArtworkView(artwork: artwork, wordmark: wordmark, still: still, playback: playback)
                    .ignoresSafeArea()
            }
        }
        .task {
            playback.onHaptics = { haptics.play(.launch) }
            playback.onStop = { haptics.stop() }
            playback.begin(reduceMotion: reduceMotion)
            haptics.prepare()
            do {
                if let url = Bundle.main.url(forResource: "talking-pup-still", withExtension: "png") {
                    still = try await LaunchArtwork.decodeStill(url: url)
                }
                if let url = Bundle.main.url(forResource: "launch-wordmark", withExtension: "png") {
                    wordmark = try await LaunchArtwork.decodeStill(url: url)
                }
                if playback.phase != .finished, let url = Bundle.main.url(forResource: "talking-pup-512", withExtension: "webp") {
                    let decoded = try await LaunchArtwork.decode(url: url)
                    if playback.phase != .finished { artwork = decoded }
                }
            } catch { /* The bounded launch gate still lets a ready application through. */ }
            if !isShowing { artwork = nil; wordmark = nil; still = nil }
        }
        .onChange(of: scenePhase) { _, phase in if phase != .active { playback.interrupt() } }
        .onChange(of: reduceMotion) { if reduceMotion { playback.interrupt() } }
        .onChange(of: playback.phase) { if playback.phase == .finished { artwork = nil } }
        .onChange(of: isShowing) { if !isShowing { artwork = nil; wordmark = nil; still = nil } }
        .onDisappear { playback.interrupt(); haptics.stop() }
    }
}
