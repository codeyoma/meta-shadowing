import XCTest

final class PlayerUITests: XCTestCase {
    @MainActor func testCommittedRewardAppearsOnceAndCompletionDoesNotReplayOnRelaunch() {
        continueAfterFailure = false
        let app = fixture(stage: 11, mode: "audio")
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10))
        main.tap()
        let reward = app.descendants(matching: .any)["player-xp-receipt"]
        // Verify identifier and exact committed XP in one snapshot before the transient receipt expires.
        let earned = app.descendants(matching: .any).matching(NSPredicate(
            format: "identifier == %@ AND label == %@", "player-xp-receipt", "3 XP 획득")).firstMatch
        XCTAssertTrue(earned.waitForExistence(timeout: 3), "The receipt must expose the committed 3 XP")
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10))
        main.tap()
        let completion = app.descendants(matching: .any)["player-completion-receipt"]
        let completed = app.descendants(matching: .any).matching(NSPredicate(
            format: "identifier == %@ AND label == %@", "player-completion-receipt", "학습 완료!")).firstMatch
        XCTAssertTrue(completed.waitForExistence(timeout: 5), "Observe the completion receipt before checking durable state")
        XCTAssertTrue(app.staticTexts["스테이지 완료"].waitForExistence(timeout: 5))
        XCTAssertTrue(completion.waitForNonExistence(timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "6 / 100 XP", timeout: 20))
        XCTAssertFalse(reward.exists)
        XCTAssertFalse(completion.exists)
    }
    @MainActor func testInstalledLessonReopensWithoutServiceAccessOrExtraCredit() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 20))
        book.tap()
        app.buttons["stage-1"].tap()
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 20))
        main.tap()
        let timeline = app.descendants(matching: .any)["cycle-timeline"]
        XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 20))
        XCTAssertEqual(app.staticTexts["header-xp"].label, "1 / 100 XP")
        XCTAssertFalse(main.exists, "Relaunch must not automatically reopen or play a lesson")
        app.tabBars.buttons["설정"].tap()
        app.buttons["iCloud 동기화"].tap()
        XCTAssertTrue(app.staticTexts["자동 동기화, 꺼짐"].waitForExistence(timeout: 5))
        app.tabBars.buttons["도서 목록"].tap()
        book.tap()
        app.buttons["stage-1"].tap()
        XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 10))
        app.buttons["player-options"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
    }
    @MainActor func testRevealLevelWaitsForPendingPresetSave() {
        continueAfterFailure = false
        let app = fixture(stage: 15, mode: "audio", extra: ["--ui-test-product-delay-reveal-save"])
        XCTAssertTrue(app.buttons["학습 속도"].waitForExistence(timeout: 10))
        app.buttons["학습 속도"].tap()
        let first = app.textFields["reveal-wpm-1"]
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        first.replaceNumericText(with: "175")
        app.buttons["완료"].tap()
        for level in 1...4 {
            XCTAssertFalse(app.buttons["active-reveal-level-\(level)"].isEnabled,
                           "Do not apply a stale preset while its save is pending")
        }
        let active = app.staticTexts["active-reveal-speed"]
        XCTAssertEqual(active.label, "현재 S1 · 150 WPM")
        let level = app.buttons["active-reveal-level-1"]
        XCTAssertTrue(level.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        XCTAssertEqual(first.value as? String, "175")
        XCTAssertEqual(active.label, "현재 S1 · 150 WPM", "Saving a preset must not change the active run")
        level.tap()
        XCTAssertTrue(active.wait(for: \.label, toEqual: "현재 S1 · 175 WPM", timeout: 5))
        app.buttons["학습 이어하기"].tap()
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testGuideExplainsActiveStageWithoutGrantingCredit() {
        continueAfterFailure = false
        let app = fixture(stage: 9, mode: "audio")
        XCTAssertTrue(app.buttons["Lv 5"].waitForExistence(timeout: 10))
        app.buttons["Lv 5"].tap()
        let practice = app.staticTexts["guide-practice"]
        XCTAssertTrue(practice.waitForExistence(timeout: 5), "The guide must explain the active stage, not only its name")
        XCTAssertTrue(practice.label.contains("첫 단어"))
        let group = app.staticTexts["guide-grouping"]
        for _ in 0..<5 where !group.isHittable { app.swipeUp() }
        XCTAssertTrue(group.isHittable)
        XCTAssertTrue(group.label.contains("2–4개"))
        let confirmation = app.staticTexts["guide-confirmation"]
        for _ in 0..<5 where !confirmation.isHittable { app.swipeUp() }
        XCTAssertTrue(confirmation.isHittable)
        XCTAssertTrue(confirmation.label.contains("세 번"))
        let rewards = app.staticTexts["guide-rewards"]
        for _ in 0..<5 where !rewards.isHittable { app.swipeUp() }
        XCTAssertTrue(rewards.isHittable)
        XCTAssertTrue(rewards.label.contains("원본 구간 수"))
        app.buttons["학습 이어하기"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testVideoStaysFixedWhileLargeLessonTextScrolls() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "video-long", extra: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ])
        let video = app.otherElements["lesson-video"]
        XCTAssertTrue(video.waitForExistence(timeout: 10))
        let header = app.descendants(matching: .any)["player-progress"]
        let footer = app.buttons["player-main"]
        let text = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Secret bilingual practice.")).firstMatch
        XCTAssertTrue(text.exists)
        let videoFrame = video.frame, headerY = header.frame.minY, footerY = footer.frame.minY
        let textY = text.frame.minY
        let scroll = app.scrollViews.firstMatch
        scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            .press(forDuration: 0.05, thenDragTo: scroll.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.2)))
        XCTAssertLessThan(text.frame.minY, textY, "The lesson text must actually scroll")
        XCTAssertEqual(video.frame.minY, videoFrame.minY, accuracy: 1, "Video must remain outside the scrolling text")
        XCTAssertEqual(video.frame.height, videoFrame.height, accuracy: 1)
        XCTAssertEqual(header.frame.minY, headerY, accuracy: 1)
        XCTAssertEqual(footer.frame.minY, footerY, accuracy: 1)
        XCTAssertTrue(footer.isHittable)
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testStageExitStaysFixedAcrossOptionsAndLargeText() {
        continueAfterFailure = false
        for largeText in [false, true] {
            let extra = largeText ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] : []
            let app = fixture(stage: 1, mode: "audio", extra: extra)
            XCTAssertTrue(app.buttons["player-options"].waitForExistence(timeout: 10), "Player options unavailable; largeText=\(largeText)")
            app.buttons["player-options"].tap()
            let leave = app.buttons["스테이지로 돌아가기"]
            XCTAssertTrue(leave.wait(for: \.isHittable, toEqual: true, timeout: 5), "Stage exit must be visible without scrolling")
            let footerY = leave.frame.midY
            app.swipeUp()
            XCTAssertTrue(leave.isHittable, "Stage exit became inaccessible after scrolling; largeText=\(largeText), optionsVisible=\(app.buttons["options-close"].exists), exitExists=\(leave.exists)")
            XCTAssertEqual(leave.frame.midY, footerY, accuracy: 1)
            app.swipeDown()
            let rate = app.buttons["배속"]
            XCTAssertTrue(rate.wait(for: \.isHittable, toEqual: true, timeout: 5), "Rate row inaccessible after returning to the top; largeText=\(largeText), optionsVisible=\(app.buttons["options-close"].exists), playerVisible=\(app.buttons["player-options"].exists)")
            rate.tap()
            XCTAssertTrue(app.sliders["재생 속도"].waitForExistence(timeout: 5), "Rate destination unavailable; largeText=\(largeText)")
            XCTAssertTrue(leave.isHittable, "Nested options must keep the fixed stage-exit action")
            XCTAssertEqual(leave.frame.midY, footerY, accuracy: 1)
            XCTAssertTrue(app.buttons["학습 이어하기"].isHittable, "Resume action inaccessible in nested options; largeText=\(largeText), optionsVisible=\(app.buttons["options-close"].exists)")
            leave.tap()
            XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5), "Stage exit did not return to stages; largeText=\(largeText)")
            XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5), "Opening and leaving options changed XP; largeText=\(largeText)")
            app.terminate()
        }
    }

    @MainActor func testSubtitleToggleAppearsOnlyForHintStages() {
        continueAfterFailure = false
        for stage in [1, 5, 7, 9] {
            let app = fixture(stage: stage, mode: "audio")
            XCTAssertTrue(app.buttons["player-main"].waitForExistence(timeout: 10))
            let toggle = app.switches["subtitle-toggle"]
            if stage == 5 || stage == 9 {
                XCTAssertTrue(toggle.exists, "Hint stage \(stage) must offer subtitle reveal")
                XCTAssertFalse(app.staticTexts["Secret one"].exists)
                toggle.tap()
                XCTAssertTrue(app.staticTexts["Secret one"].waitForExistence(timeout: 5))
                toggle.tap()
                XCTAssertTrue(app.staticTexts["Secret one"].waitForNonExistence(timeout: 5))
            } else {
                XCTAssertFalse(toggle.exists, "Subtitled stage \(stage) must not offer hiding")
                XCTAssertTrue(app.staticTexts["Secret one"].exists)
            }
            XCTAssertTrue(app.staticTexts["하나"].exists)
            app.buttons["player-exit"].tap()
            XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
            app.terminate()
        }
    }

    @MainActor func testUngroupedPlayerCanEditGlobalGroupAndRevealPresets() {
        let app = fixture(stage: 1, mode: "audio")
        XCTAssertTrue(app.buttons["player-options"].waitForExistence(timeout: 10))
        app.buttons["player-options"].tap()
        let group = app.buttons["다구간 학습 사이즈"], presets = app.buttons["크레이지 스피킹"]
        XCTAssertTrue(group.waitForExistence(timeout: 5))
        XCTAssertTrue(presets.exists)
        guard group.exists, presets.exists else { return }
        group.tap()
        app.segmentedControls.buttons["4구간"].tap()
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        presets.tap()
        let first = app.textFields["reveal-wpm-1"]
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        first.replaceNumericText(with: "175")
        app.buttons["완료"].tap()
        XCTAssertEqual(first.value as? String, "175")
        app.navigationBars["크레이지 스피킹"].buttons["BackButton"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        XCTAssertTrue(app.staticTexts["1/2"].exists)
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        group.tap()
        XCTAssertTrue(app.segmentedControls.buttons["4구간"].wait(for: \.isSelected, toEqual: true, timeout: 5))
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        presets.tap()
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertEqual(first.value as? String, "175")
    }

    @MainActor func testSilentSpeedPresetsRequireExplicitRunSelection() {
        let app = fixture(stage: 15, mode: "audio")
        XCTAssertTrue(app.buttons["학습 속도"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.isEnabled, toEqual: true, timeout: 10))
        XCTAssertEqual(app.buttons["player-main"].label, "다음 학습")
        app.buttons["학습 속도"].tap()
        let first = app.textFields["reveal-wpm-1"]
        guard first.waitForExistence(timeout: 5) else { XCTFail("Silent speed must include global presets"); return }
        let active = app.staticTexts["active-reveal-speed"]
        XCTAssertEqual(active.label, "현재 S1 · 150 WPM")
        XCTAssertTrue(app.buttons["active-reveal-level-1"].isSelected)
        first.replaceNumericText(with: "175")
        app.buttons["완료"].tap()
        XCTAssertEqual(first.value as? String, "175")
        XCTAssertEqual(active.label, "현재 S1 · 150 WPM")
        XCTAssertTrue(app.buttons["active-reveal-level-1"].wait(for: \.isSelected, toEqual: false, timeout: 5))
        app.buttons["active-reveal-level-1"].tap()
        XCTAssertTrue(active.wait(for: \.label, toEqual: "현재 S1 · 175 WPM", timeout: 5))
        app.navigationBars["단어 공개 속도"].buttons["BackButton"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "다음 학습", timeout: 5))
        XCTAssertTrue(app.staticTexts["1/2"].exists)
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testProgressTrackWidthSurvivesCounterDigitBoundary() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 20))
        book.tap()
        app.buttons["stage-1"].tap()
        XCTAssertTrue(app.buttons["player-options"].waitForExistence(timeout: 10))
        func selectSource(_ index: Int) {
            app.buttons["player-options"].tap()
            let sentences = app.buttons["전체 문장"]
            XCTAssertTrue(sentences.wait(for: \.isHittable, toEqual: true, timeout: 5))
            sentences.tap()
            XCTAssertTrue(app.navigationBars["전체 문장"].waitForExistence(timeout: 5))
            let row = app.buttons["source-\(index)"]
            for _ in 0..<8 where !row.isHittable { app.swipeUp() }
            XCTAssertTrue(row.isHittable)
            row.tap()
        }
        selectSource(8)
        XCTAssertTrue(app.staticTexts["9/12"].waitForExistence(timeout: 5))
        let track = app.descendants(matching: .any)["player-progress"]
        let before = track.frame
        XCTAssertGreaterThan(before.width, 0)
        selectSource(9)
        XCTAssertTrue(app.staticTexts["10/12"].waitForExistence(timeout: 5))
        XCTAssertEqual(track.frame.width, before.width, accuracy: 0.5)
        XCTAssertEqual(track.frame.minX, before.minX, accuracy: 0.5)
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
    }

    @MainActor func testFailedGroupingEditRetryUpdatesOpenEditor() {
        let app = fixture(stage: 7, mode: "audio", extra: ["--ui-test-product-fail-save"])
        XCTAssertTrue(app.buttons["player-options"].waitForExistence(timeout: 10))
        app.buttons["player-options"].tap()
        app.buttons["다구간 학습 사이즈"].tap()
        let selected = app.segmentedControls.buttons["3구간"]
        XCTAssertTrue(selected.waitForExistence(timeout: 5))
        selected.tap()
        let failure = app.staticTexts["저장하지 못했어요. 다시 변경해 주세요."]
        XCTAssertTrue(failure.waitForExistence(timeout: 5))
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].isSelected)
        let retry = app.buttons["options-save-retry"]
        guard retry.wait(for: \.isHittable, toEqual: true, timeout: 5) else {
            XCTFail("Retry must remain available in the editor"); return
        }
        retry.tap()
        XCTAssertTrue(selected.wait(for: \.isSelected, toEqual: true, timeout: 5))
        XCTAssertTrue(failure.waitForNonExistence(timeout: 5))
        XCTAssertTrue(selected.isEnabled)
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["다구간 학습 사이즈"].tap()
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].wait(for: \.isSelected, toEqual: true, timeout: 5))
    }

    @MainActor func testFailedRateEditRetryUpdatesOpenEditor() {
        let app = fixture(stage: 1, mode: "audio", extra: ["--ui-test-product-fail-save"])
        let speed = app.buttons["학습 속도"]
        XCTAssertTrue(speed.waitForExistence(timeout: 10))
        speed.tap()
        let slider = app.sliders["재생 속도"]
        XCTAssertTrue(slider.waitForExistence(timeout: 5))
        slider.adjust(toNormalizedSliderPosition: 1)
        let failure = app.staticTexts["저장하지 못했어요. 다시 변경해 주세요."]
        XCTAssertTrue(failure.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["1×"].exists)
        XCTAssertFalse(slider.isEnabled)
        let retry = app.buttons["options-save-retry"]
        guard retry.wait(for: \.isHittable, toEqual: true, timeout: 5) else {
            XCTFail("Retry must remain available in the editor"); return
        }
        retry.tap()
        XCTAssertTrue(app.staticTexts["3×"].waitForExistence(timeout: 5))
        XCTAssertTrue(failure.waitForNonExistence(timeout: 5))
        XCTAssertTrue(slider.isEnabled)
        app.navigationBars["배속"].buttons["BackButton"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.buttons["stage-1"].tap()
        XCTAssertTrue(speed.waitForExistence(timeout: 10))
        speed.tap()
        XCTAssertTrue(slider.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["3×"].exists)
    }

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

    @MainActor func testPausedRateEditorKeepsGlobalPreferenceSeparate() {
        let app = fixture(stage: 1, mode: "audio")
        let speed = app.buttons["학습 속도"]
        XCTAssertTrue(speed.waitForExistence(timeout: 10))
        speed.tap()
        let slider = app.sliders["재생 속도"]
        XCTAssertTrue(slider.waitForExistence(timeout: 5))
        for label in ["0.25×", "2×", "3×"] { XCTAssertFalse(app.staticTexts[label].exists, label) }
        slider.adjust(toNormalizedSliderPosition: 1)
        XCTAssertTrue(app.staticTexts["3×"].waitForExistence(timeout: 5))
        XCTAssertTrue(slider.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.navigationBars["배속"].buttons["BackButton"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        speed.tap()
        XCTAssertTrue(slider.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["3×"].exists)
        XCTAssertFalse(app.staticTexts["1×"].exists)
        app.navigationBars["배속"].buttons["BackButton"].tap()
        app.buttons["options-close"].tap()
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["배속"].tap()
        XCTAssertTrue(slider.waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["1×"].exists)
        XCTAssertFalse(app.staticTexts["3×"].exists)
    }

    @MainActor private func fixture(stage: Int, mode: String, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString,
                               "--ui-test-product-fixture", mode] + extra
        app.launch()
        let book = app.buttons["book-ui-fixture-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15), "The isolated fixture book must finish loading")
        if !book.exists { return app }
        for _ in 0..<5 where !book.isHittable { app.scrollViews.firstMatch.swipeUp() }
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10), "The fixture book must be tappable")
        book.tap()
        let row = app.buttons["stage-\(stage)"]
        for _ in 0..<10 where !row.isHittable { app.swipeUp() }
        XCTAssertTrue(row.isHittable, "The requested fixture stage must be reachable")
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
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10), "Audio completion must enable explicit confirmation")
        main.tap()
        let retry = app.buttons["player-save-retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 5), "The injected save failure must expose its retry action")
        retry.tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5), "Retry must leave playback paused")
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5), "Retry must commit exactly one XP before leaving the player")
        app.terminate(); app.launch()
        XCTAssertTrue(app.staticTexts["header-xp"].waitForExistence(timeout: 15), "Relaunch must restore the fixture profile")
        XCTAssertEqual(app.staticTexts["header-xp"].label, "1 / 100 XP", "Relaunch must preserve exactly one committed XP")
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
