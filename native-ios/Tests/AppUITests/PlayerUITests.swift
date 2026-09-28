import XCTest

final class PlayerUITests: XCTestCase {
    @MainActor func testRepeatAndBackgroundReentryPreserveConfirmedWork() {
        let app = fixture(stage: 1, mode: "audio")
        let main = app.buttons["player-main"]
        let timeline = app.descendants(matching: .any)["cycle-timeline"]
        guard main.waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
        for count in 1...2 {
            XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
            main.tap()
            XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 \(count)/3", timeout: 5))
        }
        let repeatButton = app.buttons["player-repeat"]
        XCTAssertTrue(repeatButton.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        repeatButton.tap()
        XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 3/5", timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 10))
        XCTAssertEqual(timeline.label, "확인한 반복 3/5")
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "3 / 100 XP", timeout: 5))
        app.buttons["stage-1"].tap()
        XCTAssertTrue(timeline.waitForExistence(timeout: 10))
        XCTAssertEqual(timeline.label, "확인한 반복 3/5")
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["options-close"].waitForExistence(timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
    }

    @MainActor func testHeaderActionsHaveIndependentMinimumTouchTargets() {
        let app = fixture(stage: 1, mode: "audio")
        guard app.buttons["player-main"].waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
        for label in ["Lv 1", "학습 속도", "문장 분석"] {
            let button = app.buttons[label]
            XCTAssertTrue(button.isHittable, label)
            XCTAssertGreaterThanOrEqual(button.frame.width, 44, label)
            XCTAssertGreaterThanOrEqual(button.frame.height, 44, label)
        }
    }

    @MainActor private func fixture(stage: Int, mode: String, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString,
                               "--ui-test-product-fixture", mode] + extra
        app.launch()
        let book = app.buttons["book-ui-fixture-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15))
        if !book.exists { return app }
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        book.tap()
        let row = app.buttons["stage-\(stage)"]
        for _ in 0..<10 where !row.isHittable { app.swipeUp() }
        XCTAssertTrue(row.isHittable)
        if row.isHittable { row.tap() }
        return app
    }
    @MainActor func testGroupedVideoAndSilentUseNormalPlayer() {
        let video = fixture(stage: 7, mode: "video")
        let main = video.buttons["player-main"]
        guard main.waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
        XCTAssertTrue(video.otherElements["lesson-video"].exists)
        XCTAssertTrue(video.otherElements["learning-bubble-0-0"].exists)
        XCTAssertTrue(video.otherElements["learning-bubble-1-0"].exists)
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        XCTAssertEqual(video.descendants(matching: .any)["cycle-timeline"].value as? String, "재생 완료, 확인 대기")
        main.tap()
        XCTAssertTrue(video.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        video.buttons["player-exit"].tap()
        XCTAssertTrue(video.staticTexts["header-xp"].wait(for: \.label, toEqual: "2 / 100 XP", timeout: 5))
        video.terminate()

        let silent = fixture(stage: 15, mode: "audio")
        let action = silent.buttons["player-main"]
        guard action.waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
        XCTAssertFalse(silent.otherElements["lesson-video"].exists)
        XCTAssertFalse(silent.descendants(matching: .any)["cycle-timeline"].exists)
        XCTAssertFalse(silent.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Secret")).firstMatch.exists)
        XCTAssertTrue(action.wait(for: \.isEnabled, toEqual: true, timeout: 10))
        action.tap()
        silent.buttons["player-exit"].tap()
        XCTAssertTrue(silent.staticTexts["header-xp"].wait(for: \.label, toEqual: "3 / 100 XP", timeout: 5))
    }
    @MainActor func testAllSentencesSelectsPausedWithoutCredit() {
        let app = fixture(stage: 1, mode: "audio")
        guard app.buttons["player-options"].waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["전체 문장"].waitForExistence(timeout: 5))
        app.buttons["전체 문장"].tap()
        app.buttons["source-1"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        XCTAssertTrue(app.staticTexts["2/2"].exists)
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testSaveFailureRetryDoesNotDuplicateCreditOrAutoplay() {
        let app = fixture(stage: 1, mode: "audio", extra: ["--ui-test-product-fail-save"])
        let main = app.buttons["player-main"]
        guard main.waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10))
        main.tap()
        let retry = app.buttons["player-save-retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 5))
        retry.tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts["header-xp"].waitForExistence(timeout: 15))
        XCTAssertEqual(app.staticTexts["header-xp"].label, "1 / 100 XP")
    }

    @MainActor func testRealAudioConfirmationAndPausedMenu() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15))
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        XCTAssertEqual(app.staticTexts["header-xp"].label, "0 / 100 XP")
        book.tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        app.buttons["stage-1"].tap()
        let action = app.buttons["player-main"]
        XCTAssertTrue(action.waitForExistence(timeout: 10))
        guard action.exists else { return }
        XCTAssertTrue(action.wait(for: \.isEnabled, toEqual: true, timeout: 20))
        action.tap()
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["options-close"].waitForExistence(timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(action.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
    }
}
