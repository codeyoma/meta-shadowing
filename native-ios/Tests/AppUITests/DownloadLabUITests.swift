import XCTest

final class DownloadLabUITests: XCTestCase {
    @MainActor func testDeveloperEntryUsesIsolatedHistoryAndLeavesProductUnchanged() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 20))
        let settings = app.tabBars.buttons["설정"]
        XCTAssertTrue(settings.wait(for: \.isHittable, toEqual: true, timeout: 10))
        settings.tap()
        app.buttons["개발 도구"].tap()
        app.buttons["다운로드·복원 검증"].tap()
        XCTAssertTrue(app.buttons["lab-seed"].wait(for: \.isHittable, toEqual: true, timeout: 10))
        app.buttons["lab-seed"].tap()
        XCTAssertTrue(app.staticTexts["lab-xp"].wait(for: \.label, toEqual: "합성 테스트 XP: 3", timeout: 10))
        app.buttons["diagnostic-close"].tap()
        app.tabBars.buttons["책장"].tap()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 10))
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].exists)
        XCTAssertFalse(app.buttons["book-hosted-morning-notes-v1"].exists)
    }

    @MainActor func testCancellationAndRetryUseVerifiedInstallation() {
        continueAfterFailure = false
        let app = lab()
        app.launch()
        let start = app.buttons["lab-download"]
        XCTAssertTrue(start.wait(for: \.isHittable, toEqual: true, timeout: 20))
        start.tap()
        let cancel = app.buttons["lab-cancel"]
        XCTAssertTrue(cancel.wait(for: \.isHittable, toEqual: true, timeout: 5))
        cancel.tap()
        XCTAssertTrue(app.staticTexts["lab-result"].wait(for: \.label, toEqual: "취소 검증 통과", timeout: 10))
        XCTAssertEqual(app.staticTexts["lab-installed"].label, "설치: 없음")
        start.tap()
        XCTAssertTrue(app.staticTexts["lab-result"].wait(for: \.label, toEqual: "설치 검증 통과", timeout: 25))
        XCTAssertEqual(app.staticTexts["lab-installed"].label, "설치: 검증됨")
    }

    @MainActor func testPausedDownloadFailsThenExplicitRetrySucceeds() {
        continueAfterFailure = false
        let app = lab()
        app.launch()
        let start = app.buttons["lab-download"]
        XCTAssertTrue(start.wait(for: \.isHittable, toEqual: true, timeout: 20))
        start.tap()
        app.buttons["lab-pause"].tap()
        XCTAssertTrue(app.staticTexts["lab-paused"].wait(for: \.label, toEqual: "전송: 일시정지", timeout: 5))
        app.buttons["lab-fail"].tap()
        XCTAssertTrue(app.staticTexts["lab-result"].wait(for: \.label, toEqual: "실패 검증 통과", timeout: 10))
        XCTAssertEqual(app.staticTexts["lab-installed"].label, "설치: 없음")
        start.tap()
        XCTAssertTrue(app.staticTexts["lab-result"].wait(for: \.label, toEqual: "설치 검증 통과", timeout: 25))
    }

    @MainActor func testLocalResetAndRecoverySurviveProcessRelaunchWithoutDuplicateXP() {
        continueAfterFailure = false
        let app = lab()
        app.launch()
        XCTAssertTrue(app.buttons["lab-seed"].wait(for: \.isHittable, toEqual: true, timeout: 20))
        app.buttons["lab-seed"].tap()
        XCTAssertTrue(app.staticTexts["lab-xp"].wait(for: \.label, toEqual: "합성 테스트 XP: 3", timeout: 10))
        app.buttons["lab-reset"].tap()
        app.alerts.buttons["테스트 기록 삭제"].tap()
        XCTAssertTrue(app.staticTexts["lab-xp"].wait(for: \.label, toEqual: "합성 테스트 XP: 0", timeout: 10))
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts["lab-xp"].wait(for: \.label, toEqual: "합성 테스트 XP: 0", timeout: 20))
        app.buttons["lab-restore"].tap()
        XCTAssertTrue(app.staticTexts["lab-result"].wait(for: \.label, toEqual: "복원 검증 통과", timeout: 10))
        XCTAssertEqual(app.staticTexts["lab-xp"].label, "합성 테스트 XP: 3")
        app.buttons["lab-restore"].tap()
        XCTAssertTrue(app.staticTexts["lab-xp"].wait(for: \.label, toEqual: "합성 테스트 XP: 3", timeout: 10))
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts["lab-xp"].wait(for: \.label, toEqual: "합성 테스트 XP: 3", timeout: 20))
        XCTAssertEqual(app.staticTexts["lab-sync"].label, "실제 iCloud: 연결 안 함")
    }

    @MainActor private func lab() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-download-lab", "--ui-test-probe-id", UUID().uuidString]
        return app
    }
}
