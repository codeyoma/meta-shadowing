import XCTest

final class AppleServicesUITests: XCTestCase {
    @MainActor func testServiceSettingsRemainReachableWithLargestText() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString,
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        // The enlarged card extends below the fold; this journey opens Settings,
        // so bootstrap accessibility readiness does not require tapping its play button.
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 20))
        let settings = app.tabBars.buttons["설정"]
        XCTAssertTrue(settings.wait(for: \.isHittable, toEqual: true, timeout: 10))
        settings.tap()
        let cloud = app.buttons["iCloud 동기화"]
        XCTAssertTrue(cloud.wait(for: \.isHittable, toEqual: true, timeout: 5))
        cloud.tap()
        XCTAssertTrue(app.staticTexts["자동 동기화"].waitForExistence(timeout: 5))
        // LabeledContent exposes the value through its combined accessibility row.
        XCTAssertTrue(app.staticTexts["자동 동기화, 꺼짐"].exists)
        let retry = app.buttons["계정 다시 확인"]
        for _ in 0..<6 where !retry.isHittable { app.swipeUp() }
        XCTAssertTrue(retry.isHittable)
    }
    @MainActor func testDownloadAndRemovalUseNormalBookControls() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let download = app.buttons["download-hosted-morning-notes-v1"]
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 20))
        download.tap()
        let book = app.buttons["book-hosted-morning-notes-v1"]
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        app.buttons["manage-hosted-morning-notes-v1"].tap()
        app.buttons["다운로드 삭제"].tap()
        XCTAssertTrue(app.alerts["다운로드를 삭제할까요?"].waitForExistence(timeout: 3))
        app.alerts.buttons["다운로드 삭제"].tap()
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 10))
        XCTAssertEqual(app.staticTexts["header-xp"].label, "0 / 100 XP")
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].exists)
    }
    @MainActor func testLocalAndCloudDeletionHaveSeparateScopedConfirmations() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 20))
        app.tabBars.buttons["설정"].tap()
        app.buttons["데이터 관리"].tap()
        let local = app.buttons["remove-local-history"]
        XCTAssertTrue(local.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["delete-cloud-history"].exists)
        XCTAssertFalse(app.buttons["delete-cloud-history"].isEnabled)
        local.tap()
        XCTAssertTrue(app.buttons["이 기기 기록 삭제"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["다운로드한 도서와 iCloud 기록은 삭제하지 않아요. 자동 동기화는 꺼집니다."].exists)
        app.alerts.buttons["취소"].tap()
        XCTAssertTrue(app.buttons["이 기기 기록 삭제"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(local.isEnabled)
    }
}
