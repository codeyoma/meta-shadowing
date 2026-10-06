import Testing
import UIKit
@testable import MetaShadowingNative

/// The animated launch must continue the system launch screen in both
/// appearances instead of flashing white over a dark launch.
@MainActor struct LaunchAppearanceTests {
    @Test(arguments: [UIUserInterfaceStyle.light, .dark])
    func canvasMatchesTheSystemLaunchBackground(_ style: UIUserInterfaceStyle) throws {
        let traits = UITraitCollection(userInterfaceStyle: style)
        let canvas = LaunchCanvas()
        let background = try #require(canvas.backgroundColor).resolvedColor(with: traits)
        #expect(background == UIColor.systemBackground.resolvedColor(with: traits))
    }
}
