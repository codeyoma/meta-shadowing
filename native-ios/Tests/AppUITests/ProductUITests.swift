import XCTest

final class ProductUITests: XCTestCase {
    @MainActor func testBooksStagesSettingsAndEmptyLanguage() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15))
        guard book.exists else { return }
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
