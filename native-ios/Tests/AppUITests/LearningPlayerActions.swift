import XCTest

extension XCUIApplication {
    @MainActor func exitLearningThroughOptions(file: StaticString = #filePath, line: UInt = #line) {
        let options = buttons["player-options"]
        XCTAssertTrue(options.wait(for: \.isHittable, toEqual: true, timeout: 10), file: file, line: line)
        options.tap()
        let exit = buttons["options-exit"]
        XCTAssertTrue(buttons["options-close"].waitForExistence(timeout: 5), file: file, line: line)
        // The List lazily creates action rows that fall below the current viewport.
        for _ in 0..<8 where !exit.isHittable { swipeUp() }
        XCTAssertTrue(exit.isHittable, file: file, line: line)
        exit.tap()
        XCTAssertTrue(options.waitForNonExistence(timeout: 5), file: file, line: line)
    }
}
