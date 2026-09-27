import Foundation
import Testing
@testable import LearningDomain

struct LearningPreferencesTests {
    @Test func fontResetDoesNotResetSize() throws {
        var value = LearningPreferences.fresh
        value.originalTextSize = 32; value.originalTextFont = "georgia"
        value.resetFonts()
        #expect(value.originalTextFont == "system" && value.originalTextSize == 32)
        value.resetTextSizes()
        #expect(value.originalTextSize == 20 && value.translationTextSize == 18)
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
