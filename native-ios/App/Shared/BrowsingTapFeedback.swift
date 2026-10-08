import SwiftUI
import UIKit

/// Feedback belongs to user activation, not navigation-state observation.
@MainActor struct BrowsingTapFeedback {
    static let light = Self(generator: UIImpactFeedbackGenerator(style: .light))
    let generator: UIImpactFeedbackGenerator

    func perform(enabled: Bool = true, _ action: () -> Void) {
        guard enabled else { return }
        generator.impactOccurred()
        action()
    }

    func selection(_ value: Binding<Int>) -> Binding<Int> {
        Binding(get: { value.wrappedValue }, set: { selected in
            perform { value.wrappedValue = selected }
        })
    }
}
