import SwiftUI

enum LearningFont {
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
