import XCTest

final class ReferenceToolsUITests: XCTestCase {
    @MainActor func testConnectedTokensAndDictionaryReadingOrder() {
        continueAfterFailure = false
        let app = openFixture()
        app.buttons["문장 분석"].tap()
        XCTAssertTrue(app.buttons["analysis-sentence-1:0"].waitForExistence(timeout: 8))
        app.buttons["analysis-sentence-1:0"].tap()
        let selected = app.buttons["analysis-token-0"], connected = app.buttons["analysis-token-1"]
        XCTAssertTrue(selected.waitForExistence(timeout: 5)); selected.tap()
        XCTAssertEqual(connected.value as? String, "선택한 단어와 직접 연결됨")
        XCTAssertFalse(connected.isSelected)
        XCTAssertTrue(selected.isSelected)
        let lookup = app.buttons["analysis-dictionary"]
        let relation = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "one → Secret")).firstMatch
        XCTAssertTrue(lookup.exists); XCTAssertTrue(relation.exists)
        XCTAssertLessThan(lookup.frame.maxY, relation.frame.minY)
        XCTAssertFalse(app.otherElements["analysis-scroll-position"].exists)
        let appearance = XCTAttachment(screenshot: app.screenshot())
        appearance.name = "Selected and connected graph tokens"
        appearance.lifetime = .keepAlways
        add(appearance)
        selected.tap()
        XCTAssertEqual(connected.value as? String ?? "", "")
    }
    @MainActor func testOverflowIndicatorPersistsAfterScrolling() {
        continueAfterFailure = false
        let app = openFixture(mode: "analysis-long")
        app.buttons["문장 분석"].tap()
        XCTAssertTrue(app.buttons["analysis-sentence-1:0"].waitForExistence(timeout: 8))
        app.buttons["analysis-sentence-1:0"].tap()
        let indicator = app.otherElements["analysis-scroll-position"]
        XCTAssertTrue(indicator.waitForExistence(timeout: 5))
        let before = indicator.value as? String
        app.scrollViews["analysis-graph"].swipeLeft()
        XCTAssertNotEqual(indicator.value as? String, before)
        // A persistent cue must survive the native indicator's idle fade.
        let idleDeadline = Date().addingTimeInterval(2)
        let settled = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            Date() >= idleDeadline && indicator.exists
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [settled], timeout: 3), .completed)
        XCTAssertTrue(indicator.exists)
    }
    @MainActor func testVisiblePlayerWordPausesForDictionaryWithoutCredit() {
        continueAfterFailure = false
        let app = openFixture()
        let line = app.staticTexts["learning-line-0-0-target"]
        XCTAssertTrue(line.waitForExistence(timeout: 5))
        line.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.5)).tap()
        let close = app.buttons["dictionary-close"]
        XCTAssertTrue(close.waitForExistence(timeout: 5)); close.tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testLongGraphAtLargestTextSizeReachesLastToken() {
        continueAfterFailure = false
        let app = openFixture(mode: "analysis-long", extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        app.buttons["문장 분석"].tap()
        XCTAssertTrue(app.buttons["analysis-sentence-1:0"].waitForExistence(timeout: 8))
        app.buttons["analysis-sentence-1:0"].tap()
        let scroll = app.scrollViews["analysis-detail-scroll"]
        let graph = app.scrollViews["analysis-graph"]
        for _ in 0..<12 where !app.buttons["analysis-token-0"].isHittable {
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.25)))
        }
        let last = app.buttons["analysis-token-12"]
        for _ in 0..<25 where !last.isHittable { graph.swipeLeft() }
        XCTAssertTrue(last.isHittable); last.tap()
        XCTAssertTrue(last.isSelected)
        let relation = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "finish → Words")).firstMatch
        for _ in 0..<12 where !relation.isHittable {
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.25)))
        }
        XCTAssertTrue(relation.isHittable)
        let copy = app.buttons["analysis-copy"]
        for _ in 0..<16 where !copy.isHittable {
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.25))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.75)))
        }
        XCTAssertTrue(copy.isHittable); copy.tap()
        // The confirmation lasts 1.5 seconds; a full-hierarchy wait at this text size can miss it.
        XCTAssertEqual(copy.label, "복사됨")
        let evidence = XCTAttachment(screenshot: app.screenshot())
        evidence.name = "Reference graph at largest Dynamic Type"
        evidence.lifetime = .keepAlways
        add(evidence)
        XCTAssertTrue(app.buttons["options-close"].isHittable)
        app.buttons["options-close"].tap()
    }
    @MainActor func testDictionaryClosesWithoutClosingAnalysisOrClearingSelection() {
        continueAfterFailure = false
        let app = openFixture()
        app.buttons["문장 분석"].tap()
        XCTAssertTrue(app.buttons["analysis-sentence-1:0"].waitForExistence(timeout: 8))
        app.buttons["analysis-sentence-1:0"].tap()
        let token = app.buttons["analysis-token-0"]
        XCTAssertTrue(token.waitForExistence(timeout: 5)); token.tap()
        let lookup = app.buttons["analysis-dictionary"]
        let scroll = app.scrollViews["analysis-detail-scroll"]
        for _ in 0..<5 where !lookup.isHittable {
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)))
        }
        XCTAssertTrue(lookup.isHittable, app.debugDescription); lookup.tap()
        let close = app.buttons["dictionary-close"]
        XCTAssertTrue(close.waitForExistence(timeout: 8)); close.tap()
        XCTAssertTrue(lookup.waitForExistence(timeout: 5))
        XCTAssertTrue(token.isSelected)
        lookup.tap()
        XCTAssertTrue(close.waitForExistence(timeout: 5))
        let dictionary = app.otherElements["dictionary.sheet"]
        XCTAssertTrue(dictionary.exists)
        dictionary.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.05)).tap()
        XCTAssertTrue(close.waitForNonExistence(timeout: 5))
        XCTAssertTrue(token.isSelected)
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testAnalysisSelectionAndCopyDoNotEarnCredit() {
        continueAfterFailure = false
        let app = openFixture()
        app.buttons["문장 분석"].tap()
        let sentence = app.buttons["analysis-sentence-1:0"]
        XCTAssertTrue(sentence.waitForExistence(timeout: 8))
        sentence.tap()
        let token = app.buttons["analysis-token-0"]
        XCTAssertTrue(token.waitForExistence(timeout: 5))
        token.tap()
        XCTAssertTrue(token.isSelected)
        app.buttons["analysis-copy"].tap()
        XCTAssertTrue(app.buttons["analysis-copy"].wait(for: \.label, toEqual: "복사됨", timeout: 5))
        XCTAssertTrue(token.isSelected)
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor private func openFixture(mode: String = "analysis", extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString, "--ui-test-product-fixture", mode] + extra
        app.launch()
        let book = app.buttons["book-ui-fixture-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15))
        for _ in 0..<8 where !book.isHittable { app.swipeUp() }
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        book.tap()
        for _ in 0..<8 where !app.buttons["stage-1"].isHittable { app.swipeUp() }
        app.buttons["stage-1"].tap()
        XCTAssertTrue(app.buttons["문장 분석"].waitForExistence(timeout: 10))
        return app
    }
}
