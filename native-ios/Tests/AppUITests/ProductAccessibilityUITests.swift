import XCTest

final class ProductAccessibilityUITests: XCTestCase {
    @MainActor func testLongHintTextDoesNotLeakAndControlsStayReachable() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString,
                               "--ui-test-product-fixture", "long",
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        let book = app.buttons["book-ui-fixture-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 20))
        for _ in 0..<5 where !book.isHittable { app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        book.tap()
        let stage = app.buttons["stage-5"]
        for _ in 0..<15 where !stage.isHittable { app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(stage.isHittable)
        guard stage.isHittable else { return }
        stage.tap()
        XCTAssertTrue(app.buttons["player-main"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["player-options"].isHittable)
        XCTAssertTrue(app.buttons["player-exit"].isHittable)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "bilingual")).firstMatch.exists)
        try app.performAccessibilityAudit(for: [.sufficientElementDescription, .trait])
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["options-close"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["options-close"].isHittable)
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
    }
}
