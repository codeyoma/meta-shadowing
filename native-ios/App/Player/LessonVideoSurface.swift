import SwiftUI
import AVFoundation
import LearningMedia

struct LessonVideoSurface: UIViewRepresentable {
    let transport: VideoSegmentTransport
    func makeUIView(context: Context) -> VideoSurface {
        let view = VideoSurface()
        transport.attach(view.playerLayer)
        context.coordinator.transport = transport
        return view
    }
    func updateUIView(_ view: VideoSurface, context: Context) {
        if context.coordinator.transport !== transport {
            context.coordinator.transport?.detach(view.playerLayer)
            transport.attach(view.playerLayer); context.coordinator.transport = transport
        }
    }
    static func dismantleUIView(_ view: VideoSurface, coordinator: Coordinator) {
        coordinator.transport?.detach(view.playerLayer)
    }
    func makeCoordinator() -> Coordinator { Coordinator() }
    final class Coordinator { var transport: VideoSegmentTransport? }
}
final class VideoSurface: UIView {
    override class var layerClass: AnyClass { AVPlayerLayer.self }
    var playerLayer: AVPlayerLayer { layer as! AVPlayerLayer }
}
