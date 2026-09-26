import XCTest

@MainActor
final class DictionaryDrawerUITests: XCTestCase {
  func testSystemGrabberDragCancelsDismissesAndReopensWithoutExtraHeader() throws {
    let app = XCUIApplication()
    app.launch()
    app.buttons["dictionary.fixture.open"].tap()
    let resume = app.buttons["학습 이어하기"]
    XCTAssertTrue(resume.waitForExistence(timeout: 5))
    XCTAssertFalse(app.navigationBars["dictionary.header"].exists)
    let sheet = app.otherElements["dictionary.sheet"]
    XCTAssertTrue(sheet.waitForExistence(timeout: 3))
    guard sheet.exists else { return }
    // UIKit places the grabber at the top center of the presented sheet.
    let start = sheet.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0))
      .withOffset(CGVector(dx: 0, dy: 8))
    start.press(forDuration: 0.1, thenDragTo: start.withOffset(CGVector(dx: 0, dy: 20)),
      withVelocity: .slow, thenHoldForDuration: 0.4)
    XCTAssertTrue(resume.exists, "A cancelled drag must retain the dictionary")
    let bottom = app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.9))
    start.press(forDuration: 0.1, thenDragTo: bottom)
    XCTAssertTrue(resume.waitForNonExistence(timeout: 3))
    XCTAssertEqual(app.staticTexts["dictionary.fixture.status"].label, "Dismissed")
    app.buttons["dictionary.fixture.open"].tap()
    XCTAssertTrue(resume.waitForExistence(timeout: 5))
    resume.tap()
    XCTAssertTrue(resume.waitForNonExistence(timeout: 3))
    XCTAssertEqual(app.staticTexts["dictionary.fixture.status"].label, "Dismissed")
  }

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
