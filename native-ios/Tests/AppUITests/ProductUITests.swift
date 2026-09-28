import XCTest

final class ProductUITests: XCTestCase {
    @MainActor func testFontSettingsPersistAcrossRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 10))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        let typography = app.buttons["폰트 설정"]
        XCTAssertTrue(typography.waitForExistence(timeout: 5))
        guard typography.exists else { return }
        typography.tap()
        app.buttons["original-size-plus"].tap()
        XCTAssertEqual(app.textFields["original-size"].value as? String, "21")
        XCTAssertTrue(app.buttons["original-size-plus"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 10))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["폰트 설정"].tap()
        XCTAssertTrue(app.textFields["original-size"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["original-size"].value as? String, "21")
    }

    @MainActor func testBooksStagesSettingsAndEmptyLanguage() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15))
        guard book.exists else { return }
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        book.tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        app.tabBars.buttons["설정"].tap()
        XCTAssertTrue(app.buttons["학습 설정"].waitForExistence(timeout: 5))
        app.buttons["language-menu"].tap()
        app.buttons["일본어"].tap()
        app.tabBars.buttons["도서 목록"].tap()
        XCTAssertTrue(app.staticTexts["이 언어의 도서가 아직 없어요"].waitForExistence(timeout: 5))
        app.tabBars.buttons["스테이지"].tap()
        XCTAssertTrue(app.staticTexts["도서를 선택해 주세요"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["이 언어의 도서가 아직 없어요"].waitForExistence(timeout: 15))
    }
}
