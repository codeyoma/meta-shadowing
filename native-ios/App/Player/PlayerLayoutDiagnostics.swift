import SwiftUI

#if DEBUG
/// Passive observations of the real player. No view reads these values back.
/// Kept out of Release alongside the isolated native verification fixtures.
@MainActor final class PlayerLayoutMeasurements {
    var frames: [String: CGRect] = [:]
}

extension EnvironmentValues {
    @Entry var playerLayoutMeasurements: PlayerLayoutMeasurements? = nil
}

private struct PlayerLayoutMeasurement: ViewModifier {
    let identifier: String
    @Environment(\.playerLayoutMeasurements) private var measurements

    @ViewBuilder func body(content: Content) -> some View {
        if let measurements {
            content.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frame in
                measurements.frames[identifier] = frame
            }
        } else {
            content
        }
    }
}
#endif

extension View {
    func playerLayoutFrame(_ identifier: String) -> some View {
        #if DEBUG
        modifier(PlayerLayoutMeasurement(identifier: identifier))
        #else
        self
        #endif
    }
}
