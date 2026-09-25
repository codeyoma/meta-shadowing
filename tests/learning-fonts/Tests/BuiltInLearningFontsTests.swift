import CoreText
import Testing
import UIKit

struct BuiltInLearningFontsTests {
  @Test func catalogUsesNativeDesignsAndOnlyCuratedOfflineFaces() {
    let offered = Set(BuiltInLearningFonts.available())
    #expect(offered.isSuperset(of: ["system", "rounded", "serif"]))
    #expect(offered.isSubset(of: ["system", "rounded", "serif", "avenir-next", "georgia", "apple-sd-gothic-neo"]))
    #expect(!BuiltInLearningFonts.isBuiltInFace("UninstalledFixtureFont"))
    #expect(!BuiltInLearningFonts.isBuiltInFace(""))
    for (id, name) in [("avenir-next", "AvenirNext-Regular"), ("georgia", "Georgia"), ("apple-sd-gothic-neo", "AppleSDGothicNeo-Regular")] {
      #expect(offered.contains(id), "The supported iOS test runtime includes \(name)")
    }
  }

  @Test(arguments: [CGFloat(12), 20, 48, 150])
  func nativeFontsRenderLatinAndKoreanWithGlyphFallback(size: CGFloat) throws {
    let base = UIFont.systemFont(ofSize: size)
    var fonts = [base]
    for design in [UIFontDescriptor.SystemDesign.rounded, .serif] {
      let descriptor = try #require(base.fontDescriptor.withDesign(design))
      fonts.append(UIFont(descriptor: descriptor, size: size))
    }
    for name in ["AvenirNext-Regular", "Georgia", "AppleSDGothicNeo-Regular"] where BuiltInLearningFonts.isBuiltInFace(name) {
      fonts.append(try #require(UIFont(name: name, size: size)))
    }
    for font in fonts {
      #expect(font.pointSize == size)
      let sample = NSAttributedString(string: "Practice every day. 매일 또렷하고 자신 있게 말해요.", attributes: [.font: font])
      let line = CTLineCreateWithAttributedString(sample)
      let runs = CTLineGetGlyphRuns(line) as! [CTRun]
      #expect(!runs.isEmpty)
      for run in runs {
        var glyphs = [CGGlyph](repeating: 0, count: CTRunGetGlyphCount(run))
        CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
        #expect(glyphs.allSatisfy { $0 != 0 }, "Mixed text has no missing glyph boxes")
      }
    }
  }
}
