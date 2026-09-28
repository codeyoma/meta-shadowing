import XCTest

final class NativeFoundationUITests: XCTestCase {
    @MainActor func testSyntheticLearningSurvivesRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-learning-storage", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let xp = app.staticTexts["probe-xp"]
        XCTAssertTrue(xp.waitForExistence(timeout: 15))
        XCTAssertEqual(xp.label, "XP: 0")
        app.buttons["probe-finish-reveal"].tap()
        let confirm = app.buttons["probe-confirm"]
        // XP stays zero while reveal completion is saving; it is not a readiness signal.
        guard confirm.wait(for: \.isEnabled, toEqual: true, timeout: 15),
              confirm.wait(for: \.isHittable, toEqual: true, timeout: 5) else {
            XCTFail("Confirmation did not become ready after reveal completion")
            return
        }
        XCTAssertEqual(xp.label, "XP: 0")
        confirm.tap()
        XCTAssertTrue(xp.wait(for: \.label, toEqual: "XP: 3", timeout: 5))
        XCTAssertEqual(app.staticTexts["probe-confirmed"].label, "Confirmed phrases: 1")
        app.terminate()
        app.launch()
        XCTAssertTrue(xp.waitForExistence(timeout: 15))
        XCTAssertEqual(xp.label, "XP: 3")
        XCTAssertEqual(app.staticTexts["probe-confirmed"].label, "Confirmed phrases: 1")
        XCTAssertEqual(app.staticTexts["probe-paused"].label, "Paused")
    }

    @MainActor func testLibraryDetailForegroundAndRelaunch() {
        let app = XCUIApplication()
        app.launch()
        let sample = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(sample.waitForExistence(timeout: 15))
        XCTAssertTrue(sample.wait(for: \.isHittable, toEqual: true, timeout: 10))
        sample.tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        app.tabBars.buttons["도서 목록"].tap()
        XCTAssertTrue(sample.waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(sample.waitForExistence(timeout: 15))
    }

    @MainActor func testLargeTextCanReachEverySentence() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString,
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        let sample = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(sample.waitForExistence(timeout: 15))
        for _ in 0..<5 where !sample.isHittable { app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(sample.wait(for: \.isHittable, toEqual: true, timeout: 10))
        sample.tap()
        let first = app.buttons["stage-1"]
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertTrue(first.isHittable)
        let last = app.buttons["stage-16"]
        for _ in 0..<20 where !last.isHittable { app.swipeUp() }
        XCTAssertTrue(last.isHittable)
    }

    @MainActor func testRetryAfterSyntheticLoadFailure() {
        assertLoadRetry()
    }

    @MainActor func testRetryRemainsReachableAtLargestText() {
        assertLoadRetry(extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
    }

    @MainActor private func assertLoadRetry(extra: [String] = []) {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString, "--ui-test-fail-first-load"] + extra
        app.launch()
        let retry = app.buttons["bootstrap-retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 15), "Initial load failure must expose retry")
        let launchScreen = app.descendants(matching: .any)["launch-screen"]
        XCTAssertTrue(launchScreen.waitForNonExistence(timeout: 15), "Launch artwork must finish before retry is tappable")
        XCTAssertTrue(retry.wait(for: \.isHittable, toEqual: true, timeout: 10),
                      "Retry is not tappable: enabled=\(retry.isEnabled), frame=\(retry.frame), window=\(app.windows.firstMatch.frame)")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(retry.wait(for: \.isHittable, toEqual: true, timeout: 10), "Foregrounding must preserve the explicit retry action")
        retry.tap()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 15), "Explicit retry must load the sample book")
    }
}
