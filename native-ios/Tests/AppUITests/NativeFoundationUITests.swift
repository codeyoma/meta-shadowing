import XCTest

final class NativeFoundationUITests: XCTestCase {
    @MainActor func testSyntheticLearningSurvivesRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-learning-storage", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let xp = app.staticTexts["probe-xp"]
        XCTAssertTrue(xp.existsOrWait(timeout: 15))
        XCTAssertEqual(xp.label, "XP: 0")
        app.buttons["probe-finish-reveal"].tap()
        let confirm = app.buttons["probe-confirm"]
        // XP stays zero while reveal completion is saving; it is not a readiness signal.
        guard confirm.wait(for: \.isEnabled, toEqual: true, timeout: 15),
              confirm.hittableOrWait(timeout: 5) else {
            XCTFail("Confirmation did not become ready after reveal completion")
            return
        }
        XCTAssertEqual(xp.label, "XP: 0")
        confirm.tap()
        XCTAssertTrue(xp.wait(for: \.label, toEqual: "XP: 3", timeout: 5))
        XCTAssertEqual(app.staticTexts["probe-confirmed"].label, "Confirmed phrases: 1")
        app.terminate()
        app.launch()
        XCTAssertTrue(xp.existsOrWait(timeout: 15))
        XCTAssertEqual(xp.label, "XP: 3")
        XCTAssertEqual(app.staticTexts["probe-confirmed"].label, "Confirmed phrases: 1")
        XCTAssertEqual(app.staticTexts["probe-paused"].label, "Paused")
    }

    @MainActor func testLibraryDetailForegroundAndRelaunch() {
        let app = XCUIApplication()
        app.launch()
        let sample = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(sample.existsOrWait(timeout: 15))
        XCTAssertTrue(sample.hittableOrWait(timeout: 10))
        sample.tap()
        XCTAssertTrue(app.buttons["stage-1"].existsOrWait(timeout: 5))
        XCUIDevice.shared.press(.home)
        // Home can return before XCTest observes the app in the background.
        let background = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            let state = app.state
            return state == .runningBackground || state == .runningBackgroundSuspended
        }, object: nil)
        guard XCTWaiter.wait(for: [background], timeout: 5) == .completed else {
            XCTFail("Home must finish backgrounding before activation; state=\(app.state.rawValue)")
            return
        }
        app.activate()
        guard app.wait(for: .runningForeground, timeout: 5) else {
            XCTFail("Activation must reach foreground before navigation; state=\(app.state.rawValue)")
            return
        }
        XCTAssertTrue(app.buttons["stage-1"].existsOrWait(timeout: 5))
        let booksTab = app.tabBars.buttons["책장"]
        XCTAssertTrue(booksTab.hittableOrWait(timeout: 5),
                      "Foreground activation must restore the Books tab's hit point before tapping")
        booksTab.tap()
        XCTAssertTrue(sample.existsOrWait(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(sample.existsOrWait(timeout: 15))
    }

    @MainActor func testLargeTextCanReachEverySentence() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString,
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        let sample = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(sample.existsOrWait(timeout: 15))
        for _ in 0..<5 {
            guard !sample.isHittable else { break }
            app.scrollViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(sample.hittableOrWait(timeout: 10))
        sample.tap()
        let first = app.buttons["stage-1"]
        XCTAssertTrue(first.existsOrWait(timeout: 5))
        XCTAssertTrue(first.isHittable)
        let last = app.buttons["stage-16"]
        for _ in 0..<20 {
            guard !last.isHittable else { break }
            app.swipeUp()
        }
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
        XCTAssertTrue(retry.existsOrWait(timeout: 15), "Initial load failure must expose retry")
        let launchScreen = app.descendants(matching: .any)["launch-screen"]
        XCTAssertTrue(launchScreen.waitForNonExistence(timeout: 15), "Launch artwork must finish before retry is tappable")
        XCTAssertTrue(retry.hittableOrWait(timeout: 10),
                      "Retry is not tappable: enabled=\(retry.isEnabled), frame=\(retry.frame), window=\(app.windows.firstMatch.frame), appState=\(app.state.rawValue), windows=\(app.windows.count), alerts=\(app.alerts.count), sheets=\(app.sheets.count), launchVisible=\(launchScreen.exists)")
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(retry.hittableOrWait(timeout: 10), "Foregrounding must preserve the explicit retry action")
        retry.tap()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].existsOrWait(timeout: 15), "Explicit retry must load the sample book")
    }
}
