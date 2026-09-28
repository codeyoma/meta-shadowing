import SwiftUI

enum BrandStyle {
    static let yellow = Color(red: 1, green: 200.0 / 255, blue: 0)
    static let orange = Color(red: 1, green: 150.0 / 255, blue: 0)
    static let ink = Color(red: 4.0 / 255, green: 44.0 / 255, blue: 96.0 / 255)
    static let green = Color(red: 88.0 / 255, green: 204.0 / 255, blue: 2.0 / 255)
}
struct LearningActionStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.frame(maxWidth: .infinity, minHeight: 44)
            .foregroundStyle(BrandStyle.ink)
            .background(configuration.isPressed ? BrandStyle.orange : BrandStyle.yellow, in: .rect(cornerRadius: 12))
            .opacity(enabled ? 1 : 0.45)
    }
}
