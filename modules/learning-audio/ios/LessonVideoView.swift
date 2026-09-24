import ExpoModulesCore
import AVFoundation

final class LessonVideoView: ExpoView {
  private let videoLayer = AVPlayerLayer()
  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    videoLayer.player = LessonVideoPlayer.shared.player
    videoLayer.videoGravity = .resizeAspect
    layer.addSublayer(videoLayer)
    clipsToBounds = true
    isUserInteractionEnabled = false
  }
  override func layoutSubviews() { super.layoutSubviews(); videoLayer.frame = bounds }
}
