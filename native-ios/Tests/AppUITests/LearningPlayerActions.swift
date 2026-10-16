import XCTest

extension XCUIApplication {
    @MainActor @discardableResult func revealStage(_ stage: Int, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        let row = buttons["stage-\(stage)"]
        if !row.exists {
            let family = buttons["stage-family-\(stage < 7 ? 0 : stage < 11 ? 1 : 2)"]
            revealBrowsingElement(family)
            XCTAssertTrue(family.isHittable, "The stage family must be reachable", file: file, line: line)
            if family.isHittable { family.tap() }
        }
        revealBrowsingElement(row)
        XCTAssertTrue(row.isHittable, "Stage \(stage) must be reachable", file: file, line: line)
        return row
    }
    @MainActor func revealBrowsingElement(_ element: XCUIElement) {
        for _ in 0..<16 {
            if element.isHittable { return }
            if element.exists, element.frame.maxY <= 0 { swipeDown() } else { swipeUp() }
        }
    }
    @MainActor func assertBrowsingXP(_ expected: String, timeout: TimeInterval = 5, _ message: String = "",
                                   file: StaticString = #filePath, line: UInt = #line) {
        let selected = ["책장", "스테이지", "설정"].first { tabBars.buttons[$0].isSelected }
        if selected != "책장" { tabBars.buttons["책장"].tap() }
        XCTAssertTrue(buttons["header-xp"].wait(for: \.label, toEqual: expected, timeout: timeout), message, file: file, line: line)
        if let selected, selected != "책장" { tabBars.buttons[selected].tap() }
    }
    @MainActor func exitLearningThroughOptions(file: StaticString = #filePath, line: UInt = #line) {
        let options = buttons["player-options"]
        XCTAssertTrue(options.hittableOrWait(timeout: 10), file: file, line: line)
        options.tap()
        let exit = buttons["options-exit"]
        XCTAssertTrue(buttons["options-close"].existsOrWait(timeout: 5), file: file, line: line)
        // The List lazily creates action rows that fall below the current viewport.
        for _ in 0..<8 {
            guard !exit.isHittable else { break }
            swipeUp()
        }
        XCTAssertTrue(exit.isHittable, file: file, line: line)
        exit.tap()
        XCTAssertTrue(options.waitForNonExistence(timeout: 5), file: file, line: line)
    }
}
