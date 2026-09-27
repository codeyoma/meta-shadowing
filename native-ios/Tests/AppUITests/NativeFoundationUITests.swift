import XCTest

final class NativeFoundationUITests: XCTestCase {
    @MainActor func testLibraryDetailForegroundAndRelaunch() {
        let app = XCUIApplication()
        app.launch()
        let sample = app.buttons["lesson-native-sample"]
        XCTAssertTrue(sample.waitForExistence(timeout: 15))
        sample.tap()
        XCTAssertTrue(app.staticTexts["sentence-hello"].waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.staticTexts["sentence-hello"].waitForExistence(timeout: 5))
        app.navigationBars.buttons.element(boundBy: 0).tap()
        XCTAssertTrue(sample.waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(sample.waitForExistence(timeout: 15))
    }

    @MainActor func testLargeTextCanReachEverySentence() {
        let app = XCUIApplication()
        app.launchArguments = ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        let sample = app.buttons["lesson-native-sample"]
        XCTAssertTrue(sample.waitForExistence(timeout: 15))
        XCTAssertTrue(sample.isHittable)
        sample.tap()
        let first = app.staticTexts["sentence-hello"]
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertTrue(first.isHittable)
        let last = app.staticTexts["sentence-step"]
        if !last.isHittable { app.swipeUp() }
        XCTAssertTrue(last.isHittable)
    }

    @MainActor func testRetryAfterSyntheticLoadFailure() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-fail-first-load"]
        app.launch()
        let retry = app.buttons["bootstrap-retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 15))
        retry.tap()
        XCTAssertTrue(app.buttons["lesson-native-sample"].waitForExistence(timeout: 15))
    }
}
