import SwiftUI
import LearningDomain

enum LearningFont {
    static let choices = [("system", "System"), ("rounded", "Rounded"), ("serif", "Serif"),
                          ("avenir-next", "Avenir Next"), ("georgia", "Georgia"), ("apple-sd-gothic-neo", "Apple SD Gothic Neo")]
    static func title(_ identifier: String?) -> String {
        choices.first { $0.0 == identifier }?.1 ?? "System"
    }
    static func baseSize(original: Bool, preferences: LearningPreferences) -> Int {
        let bubble = preferences.speechView == "bubble"
        return original ? preferences.originalTextSize ?? (bubble ? 29 : 24)
                        : preferences.translationTextSize ?? (bubble ? 18 : 16)
    }
    static func make(_ identifier: String?, size: CGFloat) -> Font {
        switch identifier {
        case "rounded": return .system(size: size, design: .rounded)
        case "serif": return .system(size: size, design: .serif)
        case "avenir-next": return named("AvenirNext-Regular", size: size)
        case "georgia": return named("Georgia", size: size)
        case "apple-sd-gothic-neo": return named("AppleSDGothicNeo-Regular", size: size)
        default: return .system(size: size)
        }
    }
    private static func named(_ name: String, size: CGFloat) -> Font {
        UIFont(name: name, size: size) == nil ? .system(size: size) : .custom(name, fixedSize: size)
    }
}
