import XCTest

/// Controlled service failure, not an assertion that the simulator's radios are off.
final class OfflineAcceptanceUITests: XCTestCase {
    @MainActor func testOfflineDownloadFailsWithoutBlockingBundledLearning() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-services-offline",
                               "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let download = app.buttons["download-hosted-morning-notes-v1"]
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 20))
        download.tap()
        let retry = app.buttons.matching(NSPredicate(format: "identifier == %@ AND label ENDSWITH %@",
            "download-hosted-morning-notes-v1", "다운로드 다시 시도")).firstMatch
        XCTAssertTrue(retry.waitForExistence(timeout: 10),
                      "The offline fixture must fail acquisition, not silently install bundled bytes")
        XCTAssertTrue((retry.value as? String ?? "").contains("연결과 서비스 설정"),
                      "VoiceOver must receive recovery instructions from the card action")
        XCTAssertFalse(app.buttons["book-hosted-morning-notes-v1"].exists)
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
        app.buttons["book-morning-notes-v1"].tap()
        XCTAssertTrue(app.buttons["stage-1"].wait(for: \.isHittable, toEqual: true, timeout: 5))
        app.buttons["stage-1"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.isEnabled, toEqual: true, timeout: 20),
                      "A failed external transfer must not block bundled native playback")
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testDownloadedLessonSurvivesOfflineRelaunchWithoutNewCredit() {
        continueAfterFailure = false
        let app = XCUIApplication()
        let arguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString]
        app.launchArguments = arguments
        app.launch()
        let download = app.buttons["download-hosted-morning-notes-v1"]
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 20))
        download.tap()
        openDownloadedStage(app)
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 20))
        main.tap() // One explicit confirmation in this disposable profile only.
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(
            for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["다구간 학습 사이즈"].tap()
        let grouping = app.segmentedControls.buttons["3구간"]
        XCTAssertTrue(grouping.wait(for: \.isHittable, toEqual: true, timeout: 5))
        grouping.tap()
        XCTAssertTrue(grouping.wait(for: \.isSelected, toEqual: true, timeout: 5))
        XCTAssertTrue(grouping.wait(for: \.isEnabled, toEqual: true, timeout: 5),
                      "Terminate only after the preference editor settles its durable save")
        XCTAssertTrue(grouping.isSelected)

        app.terminate()
        app.launchArguments = arguments + ["--ui-test-services-offline"]
        app.launch()
        let book = app.buttons["book-hosted-morning-notes-v1"]
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 20))
        XCTAssertEqual(app.buttons["header-xp"].label, "1 / 100 XP")
        XCTAssertFalse(main.exists, "Offline relaunch must not enter or confirm a lesson")
        openDownloadedStage(app)
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(
            for: \.label, toEqual: "확인한 반복 1/3", timeout: 10))
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 확인", timeout: 20),
                      "The offline lesson must reach actual native playback completion before menu entry")
        XCTAssertEqual(app.descendants(matching: .any)["cycle-timeline"].label, "확인한 반복 1/3")
        app.buttons["player-options"].tap()
        app.buttons["전체 문장"].tap()
        XCTAssertTrue(app.buttons["source-0"].waitForExistence(timeout: 5),
                      "Installed source navigation must not depend on a service connection")
        app.navigationBars["전체 문장"].buttons["BackButton"].tap()
        XCTAssertTrue(app.buttons["options-close"].wait(for: \.isHittable, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5),
                      "Closing reference options must leave learning paused")
        selectLocalSource(app, index: 1, position: "2/12", cycles: "확인한 반복 0/3")
        selectLocalSource(app, index: 0, position: "1/12", cycles: "확인한 반복 1/3")
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["다구간 학습 사이즈"].tap()
        XCTAssertTrue(grouping.wait(for: \.isSelected, toEqual: true, timeout: 5))
        app.tabBars.buttons["책장"].tap()
        let manage = app.buttons["manage-hosted-morning-notes-v1"]
        XCTAssertTrue(manage.wait(for: \.isHittable, toEqual: true, timeout: 5),
                      "The Books tab opens the library directly")
        manage.tap()
        app.buttons["삭제하기"].tap()
        XCTAssertTrue(app.alerts["다운로드를 삭제할까요?"].waitForExistence(timeout: 5))
        app.alerts.buttons["다운로드 삭제"].tap()
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 10))
        download.tap()
        let retry = app.buttons.matching(NSPredicate(format: "identifier == %@ AND label ENDSWITH %@",
            "download-hosted-morning-notes-v1", "다운로드 다시 시도")).firstMatch
        XCTAssertTrue(retry.waitForExistence(timeout: 10), "The offline branch must really refuse re-acquisition")
        XCTAssertFalse(book.exists)
        XCTAssertEqual(app.buttons["header-xp"].label, "1 / 100 XP")

        app.terminate()
        app.launchArguments = arguments
        app.launch()
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 20))
        download.tap()
        openDownloadedStage(app)
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(
            for: \.label, toEqual: "확인한 반복 1/3", timeout: 10))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
    }

    @MainActor private func openDownloadedStage(_ app: XCUIApplication) {
        let book = app.buttons["book-hosted-morning-notes-v1"]
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        book.tap()
        XCTAssertTrue(app.tabBars.buttons["스테이지"].wait(for: \.isSelected, toEqual: true, timeout: 5))
        let stage = app.buttons["stage-1"]
        XCTAssertTrue(stage.wait(for: \.isHittable, toEqual: true, timeout: 5))
        stage.tap()
        XCTAssertTrue(app.buttons["player-options"].waitForExistence(timeout: 10))
    }

    @MainActor private func selectLocalSource(_ app: XCUIApplication, index: Int, position: String, cycles: String) {
        app.buttons["player-options"].tap()
        app.buttons["전체 문장"].tap()
        let source = app.buttons["source-\(index)"]
        XCTAssertTrue(source.wait(for: \.isHittable, toEqual: true, timeout: 5))
        source.tap()
        XCTAssertTrue(app.staticTexts[position].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: cycles, timeout: 5))
    }
}
