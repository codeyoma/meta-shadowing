import Foundation
import Testing
@testable import LearningDomain

struct LearningPreferencesTests {
    @Test func fullscreenSizesRoundTripIndependentlyOfNormalSizeReset() throws {
        let data = Data(#"{"mode":"manual","rate":1,"originalTextSize":26,"translationTextSize":22,"fullscreenOriginalTextSize":32,"fullscreenTranslationTextSize":28}"#.utf8)
        var value = try JSONDecoder().decode(LearningPreferences.self, from: data)
        value.resetTextSizes()
        let encoded = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
        #expect(encoded["originalTextSize"] as? Int == 20)
        #expect(encoded["translationTextSize"] as? Int == 18)
        #expect(encoded["fullscreenOriginalTextSize"] as? Int == 32)
        #expect(encoded["fullscreenTranslationTextSize"] as? Int == 28)
    }

    @Test func oldPreferencesSeedFullscreenSizesWithoutCouplingLaterEdits() throws {
        var value = try JSONDecoder().decode(LearningPreferences.self, from:
            Data(#"{"mode":"manual","rate":1,"originalTextSize":26,"translationTextSize":22}"#.utf8))
        value.originalTextSize = 40; value.translationTextSize = 36
        let encoded = try #require(JSONSerialization.jsonObject(with: JSONEncoder().encode(value)) as? [String: Any])
        #expect(encoded["fullscreenOriginalTextSize"] as? Int == 26)
        #expect(encoded["fullscreenTranslationTextSize"] as? Int == 22)
    }

    @Test(arguments: ["fullscreenOriginalTextSize", "fullscreenTranslationTextSize"])
    func fullscreenSizesRejectOutOfRangeValues(_ key: String) throws {
        for size in [11, 49] {
            let data = try JSONSerialization.data(withJSONObject: ["mode": "manual", "rate": 1, key: size])
            #expect(throws: (any Error).self) { try JSONDecoder().decode(LearningPreferences.self, from: data) }
        }
    }

    @Test func fontResetDoesNotResetSize() throws {
        var value = LearningPreferences.fresh
        value.originalTextSize = 32; value.originalTextFont = "georgia"
        value.resetFonts()
        #expect(value.originalTextFont == "system" && value.originalTextSize == 32)
        value.resetTextSizes()
        #expect(value.originalTextSize == 20 && value.translationTextSize == 18)
        value.originalTextSize = 32; value.translationTextSize = 28
        value.fullscreenOriginalTextSize = 40; value.fullscreenTranslationTextSize = 36
        value.resetFullscreenTextSizes()
        #expect(value.originalTextSize == 32 && value.translationTextSize == 28)
        #expect(value.fullscreenOriginalTextSize == 20 && value.fullscreenTranslationTextSize == 18)
    }
    @Test func absentLegacyFieldsStayAbsent() throws {
        let data = Data(#"{"mode":"auto","rate":1.37}"#.utf8)
        let value = try JSONDecoder().decode(LearningPreferences.self, from: data)
        #expect(value.originalTextSize == nil && value.originalTextFont == nil && value.rate == 1.37)
        #expect(value.groupSize == 2 && value.revealWPM == [150, 200, 250, 300])
    }
    @Test(arguments: ["system", "rounded", "serif", "avenir-next", "georgia", "apple-sd-gothic-neo"])
    func storedFontsSurviveWithoutPlatformEnumeration(font: String) throws {
        var value = LearningPreferences.fresh; value.originalTextFont = font
        #expect(try JSONDecoder().decode(LearningPreferences.self, from: JSONEncoder().encode(value)) == value)
    }
    @Test func invalidPreferencesAreRejected() throws {
        for json in [#"{"mode":"manual","rate":0}"#, #"{"mode":"manual","rate":1,"originalTextSize":49}"#,
                     #"{"mode":"manual","rate":1,"crazyWpm":[0,1,2,3]}"#, #"{"mode":"manual","rate":1,"originalTextFont":"random"}"#] {
            #expect(throws: (any Error).self) { try JSONDecoder().decode(LearningPreferences.self, from: Data(json.utf8)) }
        }
    }
}
