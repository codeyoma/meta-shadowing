import XCTest

final class DictionaryWordsTests: XCTestCase {
  func testWordsPreserveInternalJoinersAndExcludePunctuation() {
    let text = "“Don't re-enter,” she said. 🙂 café!"
    let words = DictionaryWords.ranges(text).map { (text as NSString).substring(with: $0) }
    XCTAssertEqual(words, ["Don't", "re-enter", "she", "said", "café"])
  }
  func testJapaneseAndThaiDoNotTreatAnEntireSentenceAsOneWord() {
    for text in ["私は学生です。", "ฉันชอบเรียนภาษาไทย"] {
      let ranges = DictionaryWords.ranges(text)
      XCTAssertGreaterThan(ranges.count, 1)
      for range in ranges {
        let term = (text as NSString).substring(with: range)
        XCTAssertFalse(term.contains("。"))
        XCTAssertFalse(term.isEmpty)
      }
    }
  }
  func testWhitespaceAndPunctuationHaveNoTargetsAndUnicodeOffsetsRemainExact() {
    XCTAssertEqual(DictionaryWords.ranges(" …!?🙂 \n — "), [])
    let text = "🙂 창문을 여세요. l’été non‑stop cafe\u{301}"
    XCTAssertEqual(DictionaryWords.ranges(text).map { (text as NSString).substring(with: $0) },
      ["창문을", "여세요", "l’été", "non‑stop", "cafe\u{301}"])
  }
}
