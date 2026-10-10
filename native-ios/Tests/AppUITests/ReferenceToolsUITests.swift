import UIKit
import XCTest

final class ReferenceToolsUITests: XCTestCase {
    @MainActor func testSingleSentenceOpensDetailAndBackDismissesToPausedLearning() {
        continueAfterFailure = false
        let app = openFixture()
        openSingleSentenceAnalysis(app)
        app.buttons["analysis-token-0"].tap()
        XCTAssertTrue(app.buttons["analysis-token-0"].isSelected)
        app.navigationBars["문장 분석"].buttons["BackButton"].tap()
        assertPausedWithoutCredit(app, unitCount: 2)
    }
    @MainActor func testSingleSentenceCloseDismissesToPausedLearning() {
        continueAfterFailure = false
        let app = openFixture()
        openSingleSentenceAnalysis(app)
        app.buttons["options-close"].tap()
        assertPausedWithoutCredit(app, unitCount: 2)
    }
    @MainActor func testMultipleSentencesKeepListAndBackNavigationBeforeClose() {
        continueAfterFailure = false
        let app = openFixture(stage: 7)
        app.buttons["문장 분석"].tap()
        let first = app.buttons["analysis-sentence-1:0"]
        let second = app.buttons["analysis-sentence-2:0"]
        XCTAssertTrue(first.existsOrWait(timeout: 8))
        XCTAssertTrue(second.exists)
        XCTAssertFalse(app.scrollViews["analysis-detail-scroll"].exists)
        first.tap()
        XCTAssertTrue(app.scrollViews["analysis-detail-scroll"].existsOrWait(timeout: 5))
        XCTAssertTrue(app.navigationBars["문장 분석"].exists)
        app.buttons["analysis-token-0"].tap()
        XCTAssertTrue(app.buttons["analysis-token-0"].isSelected)
        app.navigationBars["문장 분석"].buttons["BackButton"].tap()
        XCTAssertTrue(first.existsOrWait(timeout: 5))
        XCTAssertTrue(second.exists)
        XCTAssertFalse(app.scrollViews["analysis-detail-scroll"].exists)
        second.tap()
        XCTAssertTrue(app.scrollViews["analysis-detail-scroll"].existsOrWait(timeout: 5))
        XCTAssertTrue(app.staticTexts["Secret two"].exists)
        XCTAssertFalse(app.buttons["analysis-token-0"].isSelected)
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.01, dy: 0.45))
            .press(forDuration: 0.1, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0.45)))
        XCTAssertTrue(first.existsOrWait(timeout: 5), "Native edge-back returns to the sentence list")
        first.tap()
        XCTAssertTrue(app.scrollViews["analysis-detail-scroll"].existsOrWait(timeout: 5))
        XCTAssertFalse(app.buttons["analysis-token-0"].isSelected)
        XCTAssertEqual(app.buttons.matching(identifier: "options-close").count, 1)
        app.buttons["options-close"].tap()
        assertPausedWithoutCredit(app, unitCount: 1)
    }
    @MainActor func testConnectedTokensAndDictionaryReadingOrder() {
        continueAfterFailure = false
        let app = openFixture()
        openSingleSentenceAnalysis(app)
        let selected = app.buttons["analysis-token-0"], connected = app.buttons["analysis-token-1"]
        XCTAssertTrue(selected.existsOrWait(timeout: 5)); selected.tap()
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
        openSingleSentenceAnalysis(app)
        let indicator = app.otherElements["analysis-scroll-position"]
        XCTAssertTrue(indicator.existsOrWait(timeout: 5))
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
        XCTAssertTrue(line.existsOrWait(timeout: 5))
        line.coordinate(withNormalizedOffset: CGVector(dx: 0.08, dy: 0.5)).tap()
        let close = app.buttons["dictionary-close"]
        XCTAssertTrue(close.existsOrWait(timeout: 5)); close.tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testLongGraphAtLargestTextSizeReachesLastToken() {
        continueAfterFailure = false
        let app = openFixture(mode: "analysis-long", extra: ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"])
        openSingleSentenceAnalysis(app)
        let scroll = app.scrollViews["analysis-detail-scroll"]
        let graph = app.scrollViews["analysis-graph"]
        for _ in 0..<12 {
            guard !app.buttons["analysis-token-0"].isHittable else { break }
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.25)))
        }
        let last = app.buttons["analysis-token-12"]
        for _ in 0..<25 {
            guard !last.isHittable else { break }
            graph.swipeLeft()
        }
        XCTAssertTrue(last.isHittable); last.tap()
        XCTAssertTrue(last.isSelected)
        let relation = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "finish → Words")).firstMatch
        for _ in 0..<12 {
            guard !relation.isHittable else { break }
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.7))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.25)))
        }
        XCTAssertTrue(relation.isHittable)
        let copy = app.buttons["analysis-copy"]
        for _ in 0..<16 {
            guard !copy.isHittable else { break }
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.25))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.02, dy: 0.75)))
        }
        XCTAssertTrue(copy.isHittable)
        // The visible confirmation lasts 1.5 seconds, which a largest-text snapshot can
        // outlast on slower hosts. The pasteboard change count proves the copy without
        // reading its contents or prompting for paste access.
        let changeCount = UIPasteboard.general.changeCount
        copy.tap()
        let copied = expectation(for: NSPredicate { _, _ in UIPasteboard.general.changeCount > changeCount },
                                 evaluatedWith: nil)
        let copyResult = XCTWaiter.wait(for: [copied], timeout: 5)
        if copyResult != .completed {
            let failureScreen = XCTAttachment(screenshot: app.screenshot())
            failureScreen.name = "Largest-text copy failure"
            failureScreen.lifetime = .keepAlways
            add(failureScreen)
            let hierarchy = XCTAttachment(string: "Pasteboard change count: \(changeCount) before, \(UIPasteboard.general.changeCount) after\n\(app.debugDescription)")
            hierarchy.name = "Largest-text copy failure hierarchy"
            hierarchy.lifetime = .keepAlways
            add(hierarchy)
        }
        XCTAssertEqual(copyResult, .completed)
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
        openSingleSentenceAnalysis(app)
        let token = app.buttons["analysis-token-0"]
        XCTAssertTrue(token.existsOrWait(timeout: 5)); token.tap()
        let lookup = app.buttons["analysis-dictionary"]
        let scroll = app.scrollViews["analysis-detail-scroll"]
        for _ in 0..<5 {
            guard !lookup.isHittable else { break }
            scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.65))
                .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.25)))
        }
        XCTAssertTrue(lookup.isHittable, app.debugDescription); lookup.tap()
        let close = app.buttons["dictionary-close"]
        XCTAssertTrue(close.existsOrWait(timeout: 8)); close.tap()
        XCTAssertTrue(lookup.existsOrWait(timeout: 5))
        XCTAssertTrue(token.isSelected)
        lookup.tap()
        XCTAssertTrue(close.existsOrWait(timeout: 5))
        let dictionary = app.otherElements["dictionary.sheet"]
        XCTAssertTrue(dictionary.exists)
        dictionary.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.05)).tap()
        XCTAssertTrue(close.waitForNonExistence(timeout: 5))
        XCTAssertTrue(token.isSelected)
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testAnalysisSelectionAndCopyDoNotEarnCredit() {
        continueAfterFailure = false
        let app = openFixture()
        openSingleSentenceAnalysis(app)
        let token = app.buttons["analysis-token-0"]
        XCTAssertTrue(token.existsOrWait(timeout: 5))
        token.tap()
        XCTAssertTrue(token.isSelected)
        app.buttons["analysis-copy"].tap()
        XCTAssertTrue(app.buttons["analysis-copy"].wait(for: \.label, toEqual: "복사됨", timeout: 5))
        XCTAssertTrue(token.isSelected)
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor private func openSingleSentenceAnalysis(_ app: XCUIApplication) {
        app.buttons["문장 분석"].tap()
        XCTAssertTrue(app.scrollViews["analysis-detail-scroll"].existsOrWait(timeout: 8))
        XCTAssertFalse(app.buttons["analysis-sentence-1:0"].exists,
                       "A single sentence opens directly without a redundant selection row")
        XCTAssertTrue(app.navigationBars["문장 분석"].exists)
        XCTAssertEqual(app.buttons.matching(identifier: "options-close").count, 1)
    }
    @MainActor private func assertPausedWithoutCredit(_ app: XCUIApplication, unitCount: Int) {
        let main = app.buttons["player-main"]
        XCTAssertTrue(app.buttons["options-close"].waitForNonExistence(timeout: 5))
        XCTAssertFalse(app.buttons["options-exit"].exists, "Returning from analysis must dismiss the options sheet")
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        let deadline = Date().addingTimeInterval(2)
        let stillPaused = XCTNSPredicateExpectation(predicate: NSPredicate { _, _ in
            Date() >= deadline && main.label == "학습 이어하기"
        }, object: nil)
        XCTAssertEqual(XCTWaiter.wait(for: [stillPaused], timeout: 3), .completed)
        XCTAssertTrue(app.staticTexts["1/\(unitCount)"].exists, "Analysis must preserve the learning cursor")
        XCTAssertEqual(app.descendants(matching: .any)["cycle-timeline"].label, "확인한 반복 0/3")
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor private func openFixture(mode: String = "analysis", stage: Int = 1, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString, "--ui-test-product-fixture", mode] + extra
        app.launch()
        let book = app.buttons["book-ui-fixture-v1"]
        XCTAssertTrue(book.existsOrWait(timeout: 15))
        for _ in 0..<8 {
            guard !book.isHittable else { break }
            app.swipeUp()
        }
        XCTAssertTrue(book.hittableOrWait(timeout: 10))
        book.tap()
        for _ in 0..<16 {
            guard !app.buttons["stage-\(stage)"].isHittable else { break }
            app.swipeUp()
        }
        app.buttons["stage-\(stage)"].tap()
        XCTAssertTrue(app.buttons["문장 분석"].existsOrWait(timeout: 10))
        return app
    }
}
