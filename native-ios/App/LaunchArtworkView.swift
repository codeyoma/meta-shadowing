import LearningMedia
import SwiftUI
import UIKit

struct LaunchArtworkView: UIViewRepresentable {
    let artwork: LaunchArtwork?
    let wordmark: CGImage?
    let still: CGImage?
    let playback: LaunchPlayback

    func makeUIView(context: Context) -> LaunchCanvas { LaunchCanvas() }
    func updateUIView(_ view: LaunchCanvas, context: Context) {
        view.configure(artwork: artwork, wordmark: wordmark, still: still, playback: playback)
    }
    static func dismantleUIView(_ view: LaunchCanvas, coordinator: ()) { view.stop() }
}

final class LaunchCanvas: UIView, CAAnimationDelegate {
    private let puppy = CALayer(), wordmark = CALayer()
    private var artwork: LaunchArtwork?
    private weak var playback: LaunchPlayback?
    private var displayLink: CADisplayLink?
    private var presented = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .systemBackground
        for image in [puppy, wordmark] { image.contentsGravity = .resizeAspect; layer.addSublayer(image) }
        isAccessibilityElement = true; accessibilityLabel = String(localized: "쇄도잉 시작 화면")
        accessibilityIdentifier = "launch-screen"
    }
    required init?(coder: NSCoder) { fatalError("init(coder:) is unavailable") }
    override func layoutSubviews() {
        super.layoutSubviews()
        CATransaction.begin(); CATransaction.setDisableActions(true)
        puppy.frame = CGRect(x: (bounds.width - 160) / 2, y: (bounds.height - 160) / 2, width: 160, height: 160)
        wordmark.frame = CGRect(x: (bounds.width - 220) / 2, y: bounds.height - 58 - 220 * 2 / 3, width: 220, height: 220 * 2 / 3)
        CATransaction.commit()
    }
    func configure(artwork: LaunchArtwork?, wordmark: CGImage?, still: CGImage?, playback: LaunchPlayback) {
        self.playback = playback
        self.artwork = playback.phase == .finished ? nil : artwork
        CATransaction.begin(); CATransaction.setDisableActions(true)
        self.wordmark.contents = wordmark
        if playback.phase != .playing { puppy.contents = playback.phase == .finished ? still : artwork?.frames.first ?? still }
        CATransaction.commit()
        playback.onStart = { [weak self] in self?.animate() }
        if playback.phase == .finished { stop(); return }
        if !presented, artwork != nil, wordmark != nil, displayLink == nil {
            let link = CADisplayLink(target: self, selector: #selector(framePresented))
            displayLink = link; link.add(to: .main, forMode: .common)
        }
    }
    @objc private func framePresented() {
        guard window != nil, !bounds.isEmpty, UIApplication.shared.applicationState == .active else { return }
        presented = true; displayLink?.invalidate(); displayLink = nil
        playback?.startWhenReady(reduceMotion: UIAccessibility.isReduceMotionEnabled)
    }
    private func animate() {
        guard let artwork else { return }
        let animation = CAKeyframeAnimation(keyPath: "contents")
        animation.values = artwork.frames
        animation.keyTimes = artwork.keyTimes.map { NSNumber(value: $0) }
        animation.calculationMode = .discrete; animation.duration = artwork.duration
        animation.repeatCount = 0; animation.delegate = self
        puppy.contents = artwork.frames.last
        puppy.add(animation, forKey: "launch-mouth")
    }
    nonisolated func animationDidStart(_ anim: CAAnimation) {
        Task { @MainActor [weak self] in self?.playback?.animationDidBegin() }
    }
    func stop() {
        displayLink?.invalidate(); displayLink = nil
        puppy.removeAnimation(forKey: "launch-mouth"); artwork = nil
    }
}
