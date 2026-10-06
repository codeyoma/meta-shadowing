import Testing
import UIKit
@testable import MetaShadowingNative

/// Verifies the semantic palette in every appearance the system can request.
@MainActor struct BrandPaletteTests {
    private static let appearances: [(String, UITraitCollection)] = [
        ("light", traits(.light, .normal)), ("dark", traits(.dark, .normal)),
        ("light high contrast", traits(.light, .high)), ("dark high contrast", traits(.dark, .high)),
    ]
    private static func traits(_ style: UIUserInterfaceStyle, _ contrast: UIAccessibilityContrast) -> UITraitCollection {
        UITraitCollection { $0.userInterfaceStyle = style; $0.accessibilityContrast = contrast }
    }
    private static let surfaces: [UIColor] = [.systemBackground, .systemGroupedBackground, .secondarySystemGroupedBackground]

    @Test(arguments: ["AccentColor", "BrandYellow", "BrandInk", "BrandGreen"])
    func colorAssetsResolveInEveryAppearance(_ name: String) throws {
        for (_, traits) in Self.appearances { _ = try Self.color(name, traits) }
    }

    @Test func accentAdaptsToAppearance() throws {
        let resolved = try Set(Self.appearances.map { Self.hex(try Self.color("AccentColor", $0.1)) })
        #expect(resolved.count == Self.appearances.count)
    }

    @Test func accentTextIsLegibleOnSystemSurfaces() throws {
        for (label, traits) in Self.appearances {
            let accent = try Self.color("AccentColor", traits)
            for surface in Self.surfaces {
                let ratio = Self.contrast(accent, surface.resolvedColor(with: traits))
                #expect(ratio >= 4.5, "accent \(ratio) on \(Self.hex(surface.resolvedColor(with: traits))) in \(label)")
            }
        }
    }

    @Test func inkIsLegibleOnBeeYellow() throws {
        for (label, traits) in Self.appearances {
            let ratio = Self.contrast(try Self.color("BrandInk", traits), try Self.color("BrandYellow", traits))
            #expect(ratio >= 4.5, "ink on yellow \(ratio) in \(label)")
        }
    }

    @Test func completionGreenMeetsNonTextContrast() throws {
        for (label, traits) in Self.appearances {
            let green = try Self.color("BrandGreen", traits)
            for surface in Self.surfaces {
                let ratio = Self.contrast(green, surface.resolvedColor(with: traits))
                #expect(ratio >= 3, "green \(ratio) in \(label)")
            }
        }
    }

    private static func color(_ name: String, _ traits: UITraitCollection) throws -> UIColor {
        try #require(UIColor(named: name, in: .main, compatibleWith: traits)).resolvedColor(with: traits)
    }
    private static func components(_ color: UIColor) -> (CGFloat, CGFloat, CGFloat) {
        var red: CGFloat = 0, green: CGFloat = 0, blue: CGFloat = 0, alpha: CGFloat = 0
        color.getRed(&red, green: &green, blue: &blue, alpha: &alpha)
        return (red, green, blue)
    }
    private static func luminance(_ color: UIColor) -> CGFloat {
        func linear(_ value: CGFloat) -> CGFloat {
            let clamped = min(1, max(0, value))
            return clamped <= 0.04045 ? clamped / 12.92 : pow((clamped + 0.055) / 1.055, 2.4)
        }
        let (red, green, blue) = components(color)
        return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
    }
    static func contrast(_ first: UIColor, _ second: UIColor) -> CGFloat {
        let values = [luminance(first), luminance(second)].sorted()
        return (values[1] + 0.05) / (values[0] + 0.05)
    }
    private static func hex(_ color: UIColor) -> String {
        let (red, green, blue) = components(color)
        return String(format: "%02X%02X%02X", Int(red * 255), Int(green * 255), Int(blue * 255))
    }
}
