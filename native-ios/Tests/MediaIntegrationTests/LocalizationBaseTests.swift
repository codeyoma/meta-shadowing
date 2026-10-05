import Foundation
import Testing
@testable import MetaShadowingNative

/// System-provided UI follows the bundle's resolved localization, so the
/// Korean app must resolve to Korean on every device language.
@MainActor struct LocalizationBaseTests {
    @Test func koreanIsTheDevelopmentLocalization() {
        #expect(Bundle.main.developmentLocalization == "ko")
        #expect(Bundle.main.localizations.contains("ko"))
        #expect(!Bundle.main.localizations.contains("en"))
    }

    @Test(arguments: [["en-US"], ["ko-KR"], ["ja-JP", "en-US"]])
    func everyDeviceLanguageResolvesToKorean(_ preferences: [String]) {
        let resolved = Bundle.preferredLocalizations(from: Bundle.main.localizations, forPreferences: preferences)
        #expect(resolved.first == "ko")
    }

    @Test func homeScreenNameIsTheProductName() {
        #expect(Bundle.main.object(forInfoDictionaryKey: "CFBundleDisplayName") as? String == "쇄도잉")
    }

    @Test func computedStringsAreCatalogued() throws {
        // Source-language values equal their keys, so the catalog file is the contract.
        let catalog = URL(filePath: #filePath).deletingLastPathComponent()
            .appending(path: "../../App/Localizable.xcstrings").standardized
        let object = try JSONSerialization.jsonObject(with: Data(contentsOf: catalog)) as? [String: Any]
        #expect(object?["sourceLanguage"] as? String == "ko")
        let keys = Set((object?["strings"] as? [String: Any])?.keys.map { $0 } ?? [])
        let computed = [StageMethod.title(1), StageMethod.title(11), StudyLanguage.japanese.title,
                        LearningOptionRoute.revealPresets.title, try LearningGuideContent(stage: 11).rewards]
        for value in computed { #expect(keys.contains(value), "\(value) is not catalogued") }
    }
}
