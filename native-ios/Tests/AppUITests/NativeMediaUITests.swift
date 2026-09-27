import XCTest

final class NativeMediaUITests: XCTestCase {
    @MainActor private func launch(mode: String = "audio") -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-learning-media", "--ui-test-probe-id", UUID().uuidString, "--media-probe-mode", mode]
        app.launch()
        XCTAssertTrue(app.staticTexts["media-xp"].waitForExistence(timeout: 20))
        return app
    }
    @MainActor func testMediaEndDoesNotConfirm() {
        let app = launch(mode: "video")
        app.buttons["media-main"].tap()
        XCTAssertTrue(app.staticTexts["media-phase"].wait(for: \.label, toEqual: "speaking", timeout: 15))
        XCTAssertEqual(app.staticTexts["media-xp"].label, "XP: 0")
        XCTAssertTrue(app.buttons["media-main"].isEnabled)
    }
    @MainActor func testExplicitConfirmationSurvivesMediaRelaunch() {
        let app = launch()
        app.buttons["media-main"].tap()
        XCTAssertTrue(app.staticTexts["media-phase"].wait(for: \.label, toEqual: "speaking", timeout: 15))
        app.buttons["media-main"].tap()
        XCTAssertTrue(app.staticTexts["media-xp"].wait(for: \.label, toEqual: "XP: 2", timeout: 10))
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts["media-xp"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["media-xp"].label, "XP: 2")
        XCTAssertEqual(app.staticTexts["media-status"].label, "Paused")
    }
    @MainActor func testBackgroundStopsAndRestoresPaused() {
        let app = launch()
        app.buttons["media-main"].tap()
        XCTAssertTrue(app.staticTexts["media-status"].wait(for: \.label, toEqual: "Playing", timeout: 10))
        XCUIDevice.shared.press(.home); app.activate()
        XCTAssertTrue(app.staticTexts["media-status"].wait(for: \.label, toEqual: "Paused", timeout: 10))
        XCTAssertEqual(app.staticTexts["media-xp"].label, "XP: 0")
    }
    @MainActor func testSilentProbeUsesRevealWithoutPlayback() {
        let app = launch(mode: "silent")
        app.buttons["media-main"].tap()
        XCTAssertTrue(app.staticTexts["media-phase"].wait(for: \.label, toEqual: "speaking", timeout: 10))
        XCTAssertEqual(app.staticTexts["media-xp"].label, "XP: 0")
        XCTAssertEqual(app.staticTexts["media-driver"].label, "Media drivers: 0")
        app.buttons["media-main"].tap()
        XCTAssertTrue(app.staticTexts["media-xp"].wait(for: \.label, toEqual: "XP: 3", timeout: 10))
    }
}
