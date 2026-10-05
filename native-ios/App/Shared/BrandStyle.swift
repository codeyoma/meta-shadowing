import SwiftUI

/// Brand roles from the asset catalog. Each color defines light, dark and
/// Increase Contrast appearances; interactive tint comes from AccentColor.
enum BrandStyle {
    /// Bee yellow: the primary-action fill, XP and reward surfaces.
    static let yellow = Color(.brandYellow)
    /// Navy ink: drawn only on Bee yellow fills.
    static let ink = Color(.brandInk)
    /// Completion strokes and fills that must stay visible on grouped surfaces.
    static let green = Color(.brandGreen)
}

/// The single primary action on a surface: Bee yellow fill, navy label.
/// Pressed and disabled states come from the system prominent style.
struct PrimaryActionButtonStyle: PrimitiveButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button(configuration)
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .tint(BrandStyle.yellow)
            .foregroundStyle(BrandStyle.ink)
    }
}

extension PrimitiveButtonStyle where Self == PrimaryActionButtonStyle {
    static var primaryAction: PrimaryActionButtonStyle { PrimaryActionButtonStyle() }
}
