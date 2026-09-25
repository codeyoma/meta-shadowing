import XCTest

@MainActor
final class DictionaryDrawerUITests: XCTestCase {
  func testFixedLearningActionDismissesAndAllowsAnotherLookup() {
    let app = XCUIApplication()
    app.launch()
    app.buttons["dictionary.fixture.open"].tap()
    let resume = app.buttons["학습 이어하기"]
    XCTAssertTrue(resume.waitForExistence(timeout: 5))
    resume.tap()
    XCTAssertTrue(resume.waitForNonExistence(timeout: 3))
    XCTAssertEqual(app.staticTexts["dictionary.fixture.status"].label, "Dismissed")
    app.buttons["dictionary.fixture.open"].tap()
    XCTAssertTrue(resume.waitForExistence(timeout: 5))
    resume.tap()
    XCTAssertTrue(resume.waitForNonExistence(timeout: 3))
    XCTAssertEqual(app.staticTexts["dictionary.fixture.status"].label, "Dismissed")
  }
}
