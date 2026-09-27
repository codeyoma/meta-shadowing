import XCTest

/// Opt-in device integration check. Requires an installed app with analysis open.
@MainActor
final class InstalledAnalysisUITests: XCTestCase {
  func testSystemCloseLeavesTheInstalledAnalysisOpen() throws {
    guard ProcessInfo.processInfo.environment["ANALYSIS_INSTALLED_UI"] == "1" else {
      throw XCTSkip("Requires the installed learning app and a locally selected package")
    }
    let app = XCUIApplication(bundleIdentifier: "com.codeyoma.shadowshadowing")
    app.activate()
    let back = app.buttons["문장 목록으로 돌아가기"]
    if back.exists { back.tap() }
    let sentence = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "문장 1 분석:")).firstMatch
    XCTAssertTrue(sentence.waitForExistence(timeout: 5))
    sentence.tap()
    let word = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "단어 1:")).firstMatch
    XCTAssertTrue(word.waitForExistence(timeout: 5))
    word.tap()
    let lookup = app.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", "사전 보기:")).firstMatch
    XCTAssertTrue(lookup.waitForExistence(timeout: 5))
    if !lookup.isHittable { app.swipeUp() }
    lookup.tap()
    let dictionary = app.otherElements["dictionary.sheet"]
    XCTAssertTrue(dictionary.waitForExistence(timeout: 5))
    guard dictionary.exists else { return }
    dictionary.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.05)).tap()
    XCTAssertTrue(dictionary.waitForNonExistence(timeout: 5))
    XCTAssertTrue(app.buttons["분석 닫기"].exists)
    XCTAssertTrue(app.buttons["문장 목록으로 돌아가기"].exists)
    XCTAssertTrue(word.isSelected)
    XCTAssertTrue(lookup.isEnabled)
    lookup.tap()
    XCTAssertTrue(dictionary.waitForExistence(timeout: 5))
    app.buttons["학습 이어하기"].tap()
    XCTAssertTrue(dictionary.waitForNonExistence(timeout: 5))
    XCTAssertTrue(app.buttons["분석 닫기"].exists)
    XCTAssertTrue(word.isSelected)
  }
}
