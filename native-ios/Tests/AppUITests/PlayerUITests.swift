import XCTest
import UIKit

final class PlayerUITests: XCTestCase {
    @MainActor func testPortraitGroupedVideoUsesQuickSettingsAndSharesFullscreenValues() {
        continueAfterFailure = false
        let app = fixture(stage: 7, mode: "video")
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        let group = app.buttons["player-group"]
        XCTAssertTrue(group.hittableOrWait(timeout: 5))
        XCTAssertEqual(group.value as? String, "2구간")
        let speed = app.buttons["학습 속도"]
        XCTAssertEqual(speed.value as? String, "1×", "Icon-only speed must still announce the current value")
        let level = app.buttons["Lv 4"]
        XCTAssertTrue(level.exists)
        XCTAssertFalse(app.staticTexts["player-book-title"].exists)
        let options = app.buttons["player-options"]
        XCTAssertTrue(options.isHittable)
        XCTAssertLessThan(options.frame.maxX, level.frame.minX)
        XCTAssertEqual(options.frame.midY, level.frame.midY, accuracy: 1)
        XCTAssertGreaterThan(app.descendants(matching: .any)["player-progress"].frame.minY, group.frame.maxY)
        XCTAssertLessThan(level.frame.maxX, app.buttons["학습 속도"].frame.minX)
        let font = app.buttons["player-font"]
        XCTAssertTrue(font.isHittable)
        XCTAssertLessThan(app.buttons["학습 속도"].frame.maxX, font.frame.minX)
        XCTAssertLessThan(font.frame.maxX, group.frame.minX)
        XCTAssertLessThan(group.frame.maxX, app.buttons["문장 분석"].frame.minX)
        group.tap()
        let popup = app.otherElements["learning-setting-popup"]
        XCTAssertTrue(popup.existsOrWait(timeout: 5))
        XCTAssertLessThan(popup.frame.height, app.frame.height * 0.5)
        app.segmentedControls.buttons["3구간"].tap()
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8)).tap()
        XCTAssertTrue(popup.waitForNonExistence(timeout: 5))
        XCTAssertEqual(group.value as? String, "3구간")
        XCTAssertEqual(main.label, "학습 이어하기")
        speed.tap()
        let slider = app.sliders["재생 속도"]
        XCTAssertTrue(slider.existsOrWait(timeout: 5))
        slider.adjust(toNormalizedSliderPosition: 1)
        XCTAssertTrue(slider.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertEqual(speed.value as? String, "3×")
        app.buttons["video-enter-fullscreen"].tap()
        let guide = app.buttons["video-guide"]
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: guide, timeout: 5))
        XCTAssertTrue(guide.isHittable)
        XCTAssertEqual(guide.label, "Lv 4")
        guide.tap()
        XCTAssertTrue(app.buttons["options-close"].existsOrWait(timeout: 5))
        app.buttons["options-close"].tap()
        app.buttons["video-group"].tap()
        XCTAssertTrue(app.segmentedControls.buttons["3구간"].existsOrWait(timeout: 5))
        XCTAssertTrue(app.segmentedControls.buttons["3구간"].isSelected)
        app.segmentedControls.buttons["4구간"].tap()
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        app.buttons["video-exit-fullscreen"].tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: false, control: group, timeout: 5))
        XCTAssertEqual(group.value as? String, "4구간")
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testFullscreenPopoversKeepControlsReachableAtLargestTextSize() {
        continueAfterFailure = false
        let app = fixture(stage: 7, mode: "video", extra: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ])
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.isEnabled, toEqual: true, timeout: 15))
        app.buttons["video-enter-fullscreen"].tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: app.buttons["video-font-size"], timeout: 5))
        func tapTool(_ identifier: String) {
            let button = app.buttons[identifier]
            XCTAssertTrue(button.existsOrWait(timeout: 5))
            XCTAssertTrue(app.frame.contains(button.frame))
            // Oversized caption AX frames can invalidate XCTest's suggested hit point after rotation.
            // Tap the observed visible control, then require the requested popup's actual contents.
            button.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        }
        tapTool("video-font-size")
        let popup = app.otherElements["learning-setting-popup"]
        XCTAssertTrue(popup.existsOrWait(timeout: 5))
        XCTAssertTrue(app.frame.contains(popup.frame), "Large text must keep the popup within the display")
        let initialTypography = XCTAttachment(screenshot: app.screenshot())
        initialTypography.name = "Typography popup at largest text"
        initialTypography.lifetime = .keepAlways
        add(initialTypography)
        let scroll = popup.scrollViews.firstMatch
        for (identifier, field, expected) in [
            ("fullscreen-original-size-stepper", "fullscreen-original-size", "21"),
            ("fullscreen-translation-size-stepper", "fullscreen-translation-size", "19")
        ] {
            let stepper = app.steppers[identifier]
            for _ in 0..<8 where !stepper.isHittable {
                // XCTest reports an empty visible frame for this nested popover ScrollView.
                // Use its observed on-screen area; real scroll and editable-value checks still follow.
                let visible = scroll.frame.intersection(popup.frame)
                XCTAssertFalse(visible.isEmpty)
                let origin = app.coordinate(withNormalizedOffset: .zero)
                // Short, direction-aware strokes must not skip a control between large-text rows.
                let target = stepper.frame
                let delta = visible.height * 0.35
                let direction: CGFloat = target.midY < visible.midY ? 1 : -1
                origin.withOffset(CGVector(dx: visible.midX, dy: visible.midY - direction * delta / 2))
                    .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: visible.midX, dy: visible.midY + direction * delta / 2)))
            }
            if !stepper.isHittable {
                let attachment = XCTAttachment(screenshot: app.screenshot())
                attachment.name = "Unreachable \(identifier)"
                attachment.lifetime = .keepAlways
                add(attachment)
            }
            XCTAssertTrue(stepper.isHittable)
            stepper.buttons.element(boundBy: 1).tap()
            XCTAssertTrue(stepper.wait(for: \.isEnabled, toEqual: true, timeout: 5))
            XCTAssertEqual(app.textFields[field].value as? String, expected)
        }
        XCTAssertTrue(app.buttons["options-close"].isHittable)
        app.buttons["options-close"].tap()
        tapTool("video-group")
        XCTAssertTrue(app.segmentedControls.buttons["4구간"].hittableOrWait(timeout: 5))
        app.buttons["options-close"].tap()
        tapTool("video-rate")
        XCTAssertTrue(app.sliders["재생 속도"].hittableOrWait(timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertEqual(app.buttons["player-main"].label, "학습 이어하기")
        XCTAssertEqual(app.descendants(matching: .any)["cycle-timeline"].label, "확인한 반복 0/3")
    }

    @MainActor func testFontPopoversShareFamiliesButKeepScreenSizesIndependent() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "video")
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        app.buttons["video-enter-fullscreen"].tap()
        let editor = app.buttons["video-font-size"]
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: editor, timeout: 5))
        XCTAssertTrue(editor.isHittable)
        XCTAssertFalse(app.buttons["video-group"].exists, "Single-unit stages must not offer grouping in the fullscreen toolbar")
        editor.tap()
        let popup = app.otherElements["learning-setting-popup"]
        XCTAssertTrue(popup.existsOrWait(timeout: 5))
        XCTAssertLessThan(popup.frame.width, app.frame.width * 0.6, "A quick setting must not cover the video with a drawer")
        let typographyImage = XCTAttachment(screenshot: app.screenshot())
        typographyImage.name = "Typography popup with labeled font pickers"
        typographyImage.lifetime = .keepAlways
        add(typographyImage)
        func reveal(_ element: XCUIElement) {
            for _ in 0..<6 where !element.isHittable {
                let visible = popup.scrollViews.firstMatch.frame.intersection(popup.frame)
                XCTAssertFalse(visible.isEmpty)
                let origin = app.coordinate(withNormalizedOffset: .zero)
                origin.withOffset(CGVector(dx: visible.midX, dy: visible.maxY - 12))
                    .press(forDuration: 0.05, thenDragTo: origin.withOffset(CGVector(dx: visible.midX, dy: visible.minY + 12)))
            }
            XCTAssertTrue(element.isHittable)
        }
        let fullFont = app.buttons["fullscreen-original-font"]
        XCTAssertTrue(fullFont.hittableOrWait(timeout: 5))
        XCTAssertEqual(fullFont.label, "원문 폰트", "The native labeled picker must announce its label once")
        fullFont.tap()
        app.buttons["Serif"].tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "Serif"),
                                                                    object: fullFont)], timeout: 5), .completed)
        let original = app.textFields["fullscreen-original-size"]
        let translation = app.textFields["fullscreen-translation-size"]
        XCTAssertTrue(original.existsOrWait(timeout: 5))
        XCTAssertEqual(original.value as? String, "20")
        let stepper = app.steppers["fullscreen-original-size-stepper"]
        stepper.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(stepper.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        XCTAssertEqual(original.value as? String, "21")
        let fullTranslationFont = app.buttons["fullscreen-translation-font"]
        reveal(fullTranslationFont)
        XCTAssertEqual(fullTranslationFont.label, "번역 폰트")
        fullTranslationFont.tap()
        app.buttons["Rounded"].tap()
        XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: NSPredicate(format: "value == %@", "Rounded"),
                                                                    object: fullTranslationFont)], timeout: 5), .completed)
        let translated = app.steppers["fullscreen-translation-size-stepper"]
        reveal(translated)
        translated.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(translated.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        XCTAssertEqual(translation.value as? String, "19")
        app.buttons["options-close"].tap()
        app.buttons["video-exit-fullscreen"].tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: false, control: app.buttons["player-font"], timeout: 5))
        app.buttons["player-font"].tap()
        XCTAssertTrue(popup.existsOrWait(timeout: 5))
        XCTAssertLessThan(popup.frame.height, app.frame.height * 0.6)
        XCTAssertEqual(app.buttons["original-font"].label, "원문 폰트")
        XCTAssertEqual(app.buttons["original-font"].value as? String, "Serif")
        XCTAssertTrue(app.textFields["original-size"].existsOrWait(timeout: 5))
        XCTAssertEqual(app.textFields["original-size"].value as? String, "20")
        app.steppers["original-size-stepper"].buttons.element(boundBy: 1).tap()
        XCTAssertTrue(app.steppers["original-size-stepper"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        XCTAssertEqual(app.textFields["original-size"].value as? String, "21")
        let normalTranslation = app.textFields["translation-size"]
        reveal(normalTranslation)
        XCTAssertEqual(normalTranslation.value as? String, "18")
        XCTAssertEqual(app.buttons["translation-font"].value as? String, "Rounded")
        let resetFonts = app.buttons["폰트 초기화 (System)"]
        reveal(resetFonts)
        resetFonts.tap()
        XCTAssertTrue(resetFonts.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        app.buttons["video-enter-fullscreen"].tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: editor, timeout: 5))
        XCTAssertTrue(editor.isHittable)
        editor.tap()
        XCTAssertTrue(original.existsOrWait(timeout: 5))
        XCTAssertEqual(fullFont.value as? String, "System")
        XCTAssertEqual(original.value as? String, "21")
        reveal(translation)
        XCTAssertEqual(fullTranslationFont.value as? String, "System")
        XCTAssertEqual(translation.value as? String, "19")
        app.buttons["options-close"].tap()
        XCTAssertEqual(app.descendants(matching: .any)["cycle-timeline"].label, "확인한 반복 0/3")
        XCTAssertEqual(main.label, "학습 이어하기")
    }

    @MainActor func testFullscreenGroupingPopupChangesOnlyTheActiveGroupedRun() {
        continueAfterFailure = false
        let app = fixture(stage: 7, mode: "video", extra: ["--ui-test-product-fail-save"])
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        app.buttons["video-enter-fullscreen"].tap()
        let group = app.buttons["video-group"]
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: group, timeout: 5))
        XCTAssertTrue(group.isHittable)
        group.tap()
        let popup = app.otherElements["learning-setting-popup"]
        XCTAssertTrue(popup.existsOrWait(timeout: 5))
        XCTAssertLessThan(popup.frame.width, app.frame.width * 0.6)
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].isSelected)
        app.segmentedControls.buttons["3구간"].tap()
        let failure = app.staticTexts["저장하지 못했어요. 다시 변경해 주세요."]
        XCTAssertTrue(failure.existsOrWait(timeout: 5))
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].isSelected)
        let retry = app.buttons["options-save-retry"]
        XCTAssertTrue(retry.isHittable, "Failed popup edits must keep the retry reachable")
        retry.tap()
        XCTAssertTrue(app.segmentedControls.buttons["3구간"].wait(for: \.isSelected, toEqual: true, timeout: 5))
        XCTAssertTrue(failure.waitForNonExistence(timeout: 5))
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        // Tapping the visible video dismisses the popover, not a learning action.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.9, dy: 0.45)).tap()
        XCTAssertTrue(popup.waitForNonExistence(timeout: 5))
        XCTAssertEqual(main.label, "학습 이어하기")
        group.tap()
        XCTAssertTrue(app.segmentedControls.buttons["3구간"].existsOrWait(timeout: 5))
        XCTAssertTrue(app.segmentedControls.buttons["3구간"].isSelected)
        app.buttons["options-close"].tap()
        app.buttons["video-exit-fullscreen"].tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: false, control: app.buttons["player-options"], timeout: 5))
        XCTAssertTrue(app.staticTexts["learning-line-1-0-target"].existsOrWait(timeout: 5), "Both remaining sources in this two-source fixture must remain visible")
        app.buttons["player-options"].tap()
        let exit = app.buttons["options-exit"]
        for _ in 0..<8 where !exit.isHittable { app.swipeUp() }
        XCTAssertTrue(exit.isHittable)
        exit.tap()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.buttons["stage-7"].tap()
        XCTAssertTrue(app.buttons["video-enter-fullscreen"].hittableOrWait(timeout: 5))
        app.buttons["video-enter-fullscreen"].tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: group, timeout: 5))
        XCTAssertTrue(group.isHittable)
        group.tap()
        XCTAssertTrue(app.segmentedControls.buttons["3구간"].existsOrWait(timeout: 5))
        XCTAssertTrue(app.segmentedControls.buttons["3구간"].isSelected, "Saved regrouping must survive leaving and reopening the lesson")
        app.buttons["options-close"].tap()
        app.buttons["video-exit-fullscreen"].tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: false, control: app.buttons["player-options"], timeout: 5))
        app.exitLearningThroughOptions()
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        XCTAssertEqual(app.buttons["다구간 학습 사이즈"].value as? String, "2구간", "Per-run regrouping must not change the default for future runs")
    }

    @MainActor func testFullscreenDockMovesWithoutConfirmingAndKeepsVideoBehindControls() {
        continueAfterFailure = false
        let app = fixture(stage: 7, mode: "video")
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        app.buttons["video-enter-fullscreen"].tap()
        let collapse = app.buttons["video-exit-fullscreen"]
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: collapse, timeout: 5))
        XCTAssertTrue(collapse.isHittable)
        let timeline = app.descendants(matching: .any)["cycle-timeline"]
        let video = app.otherElements["lesson-video"]
        let original = main.frame
        XCTAssertLessThanOrEqual(original.width, 80, "Fullscreen needs a compact thumb action, not a footer")
        XCTAssertGreaterThanOrEqual(original.width, 44)
        XCTAssertGreaterThan(original.midX, app.frame.midX)
        XCTAssertTrue(video.frame.contains(original), "Controls must overlay, not shrink, the video")
        XCTAssertLessThan(timeline.frame.maxY, original.minY)
        XCTAssertFalse(app.otherElements["learning-list-card"].exists, "Fullscreen captions have no opaque lesson card")
        let caption = app.staticTexts["learning-line-1-0-target"]
        XCTAssertTrue(caption.isHittable)
        XCTAssertFalse(caption.frame.intersects(original))

        // Start on the enabled action itself: docking must win over confirmation.
        let left = app.coordinate(withNormalizedOffset: CGVector(dx: 0.15, dy: 0))
            .withOffset(CGVector(dx: 0, dy: original.midY))
        main.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: left)
        XCTAssertLessThan(main.frame.midX, app.frame.midX)
        XCTAssertEqual(main.frame.minY, original.minY, accuracy: 1, "Docking only changes horizontal position")
        XCTAssertEqual(timeline.label, "확인한 반복 0/3")
        XCTAssertTrue(video.frame.contains(main.frame))

        let right = app.coordinate(withNormalizedOffset: CGVector(dx: 0.85, dy: 0))
            .withOffset(CGVector(dx: 0, dy: original.midY))
        main.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: right)
        XCTAssertGreaterThan(main.frame.midX, app.frame.midX)
        XCTAssertEqual(timeline.label, "확인한 반복 0/3")
        main.tap()
        XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        main.tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "다음 학습", timeout: 15))
        let repeatButton = app.buttons["player-repeat"]
        XCTAssertTrue(repeatButton.isHittable)
        XCTAssertEqual(main.frame.midX, original.midX, accuracy: 1, "Repeat must not push the right-docked main action")
        XCTAssertLessThan(repeatButton.frame.maxX, main.frame.minX)
        main.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
            .press(forDuration: 0.05, thenDragTo: left)
        let leftMain = main.frame
        XCTAssertLessThan(leftMain.midX, app.frame.midX)
        XCTAssertGreaterThan(repeatButton.frame.minX, leftMain.maxX, "Left dock expands inward to the right")
        repeatButton.tap()
        XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 3/5", timeout: 5))
        XCTAssertTrue(app.frame.contains(timeline.frame))
        XCTAssertEqual(main.frame.midX, leftMain.midX, accuracy: 1, "Five cycle dots cannot move the main action")
        XCTAssertEqual(main.frame.minY, leftMain.minY, accuracy: 1)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Fullscreen overlay with compact five-cycle dock"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        collapse.tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: false, control: app.buttons["player-options"], timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "6 / 100 XP", timeout: 5))
    }

    @MainActor func testVideoFullscreenChangesOnlyByButtonsWithoutCredit() {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        defer { XCUIDevice.shared.orientation = .portrait }
        let app = fixture(stage: 7, mode: "video")
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        let timeline = app.descendants(matching: .any)["cycle-timeline"]
        XCTAssertEqual(timeline.label, "확인한 반복 0/3")
        let expand = app.buttons["video-enter-fullscreen"]
        XCUIDevice.shared.orientation = .landscapeLeft
        XCTAssertGreaterThan(app.frame.height, app.frame.width, "Physical rotation cannot enter fullscreen")
        XCTAssertTrue(expand.hittableOrWait(timeout: 5))
        expand.tap()
        let collapse = app.buttons["video-exit-fullscreen"]
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: collapse, timeout: 5))
        XCTAssertTrue(collapse.isHittable)
        XCTAssertTrue(main.isHittable)
        XCTAssertTrue(app.frame.contains(timeline.frame))
        XCUIDevice.shared.orientation = .portrait
        XCTAssertTrue(collapse.isHittable)
        XCTAssertGreaterThan(app.frame.width, app.frame.height)
        XCTAssertEqual(timeline.label, "확인한 반복 0/3")
        XCTAssertFalse(app.staticTexts["learning-line-0-0-target"].exists,
                       "At the end of grouped video only the final member remains in fullscreen captions")
        XCTAssertTrue(app.staticTexts["learning-line-1-0-target"].exists)
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Landscape video learning"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        let tools = app.buttons["video-options"]
        for identifier in ["video-options", "video-guide", "video-rate", "video-font-size", "video-group", "video-analysis", "video-exit-fullscreen"] {
            XCTAssertTrue(app.buttons[identifier].isHittable, "Fullscreen tool must be directly available: \(identifier)")
        }
        XCTAssertTrue(tools.isHittable)
        app.buttons["video-rate"].tap()
        XCTAssertTrue(app.sliders["재생 속도"].existsOrWait(timeout: 5))
        let ratePopup = app.otherElements["learning-setting-popup"]
        XCTAssertTrue(ratePopup.exists)
        XCTAssertLessThan(ratePopup.frame.width, app.frame.width * 0.6)
        app.sliders["재생 속도"].adjust(toNormalizedSliderPosition: 1)
        XCTAssertTrue(app.sliders["재생 속도"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(collapse.hittableOrWait(timeout: 5))
        XCTAssertEqual(main.label, "학습 이어하기")
        app.buttons["video-rate"].tap()
        XCTAssertTrue(app.staticTexts["3×"].existsOrWait(timeout: 5))
        app.buttons["options-close"].tap()
        app.buttons["video-analysis"].tap()
        XCTAssertTrue(app.buttons["options-close"].hittableOrWait(timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(collapse.hittableOrWait(timeout: 5))
        XCTAssertGreaterThan(app.frame.width, app.frame.height)
        collapse.tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: false, control: expand, timeout: 5))
        XCTAssertTrue(expand.isHittable)
        XCTAssertTrue(app.staticTexts["learning-line-0-0-target"].exists)
        XCTAssertTrue(app.staticTexts["learning-line-1-0-target"].exists)
        XCTAssertEqual(main.label, "학습 이어하기")
        expand.tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: tools, timeout: 5))
        XCTAssertTrue(tools.isHittable)
        tools.tap()
        XCTAssertTrue(app.buttons["options-close"].hittableOrWait(timeout: 5))
        let optionsList = app.collectionViews.firstMatch
        XCTAssertTrue(optionsList.existsOrWait(timeout: 5))
        let exit = app.buttons["options-exit"]
        for _ in 0..<8 {
            guard !exit.isHittable else { break }
            optionsList.swipeUp()
        }
        XCTAssertTrue(exit.isHittable)
        exit.tap()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        XCTAssertGreaterThan(app.frame.height, app.frame.width)
    }

    @MainActor func testBriefRewardsPreserveLongVideoLayoutAndCredit() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "video-long", extra: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ])
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        app.swipeUp()
        let button = main.frame
        main.tap()
        XCTAssertTrue(app.otherElements["player-reward-burst"].waitForNonExistence(timeout: 1))
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(
            for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        XCTAssertEqual(main.frame.minY, button.minY, accuracy: 1)
        // The oversized text's un-clipped AX frame masks the fixed button's hit-point query.
        // Tap its observed on-screen center and require the actual options screen to open.
        let options = app.buttons["player-options"]
        XCTAssertTrue(app.frame.contains(options.frame))
        options.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).tap()
        XCTAssertTrue(app.buttons["options-close"].existsOrWait(timeout: 5))
        let exit = app.buttons["options-exit"]
        for _ in 0..<8 {
            guard !exit.isHittable else { break }
            app.swipeUp()
        }
        XCTAssertTrue(exit.isHittable)
        exit.tap()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
    }

    @MainActor func testBriefVideoRewardDoesNotMoveLargestLessonText() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "video", extra: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ])
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        let buttonFrame = main.frame
        let translationFrame = app.descendants(matching: .any)["learning-line-0-0-translation"].frame
        main.tap()
        let receipt = app.staticTexts["player-xp-receipt"]
        XCTAssertTrue(receipt.waitForNonExistence(timeout: 1))
        XCTAssertEqual(main.frame.minY, buttonFrame.minY, accuracy: 1)
        XCTAssertEqual(app.descendants(matching: .any)["learning-line-0-0-translation"].frame.minY,
                       translationFrame.minY, accuracy: 1)
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
    }

    @MainActor func testBriefRepeatedRewardsPreserveLayoutAndCredit() {
        continueAfterFailure = false
        for largeText in [false, true] {
            let extra = largeText ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] : []
            let app = fixture(stage: 1, mode: "audio", extra: extra)
            let main = app.buttons["player-main"]
            for confirmed in 1...2 {
                XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
                let buttonFrame = main.frame
                let sentenceFrame = app.descendants(matching: .any)["learning-line-0-0-translation"].frame
                main.tap()
                let receipt = app.staticTexts["player-xp-receipt"]
                XCTAssertTrue(receipt.waitForNonExistence(timeout: 1))
                XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(
                    for: \.label, toEqual: "확인한 반복 \(confirmed)/3", timeout: 5))
                XCTAssertEqual(main.frame.minY, buttonFrame.minY, accuracy: 1)
                XCTAssertEqual(app.descendants(matching: .any)["learning-line-0-0-translation"].frame.minY,
                               sentenceFrame.minY, accuracy: 1)
            }
            app.exitLearningThroughOptions()
            XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "2 / 100 XP", timeout: 5))
            app.terminate()
        }
    }

    @MainActor func testResumePlayingAndConfirmAreIconOnlyWithoutChangingCredit() {
        let app = fixture(stage: 1, mode: "audio")
        let main = app.buttons["player-main"]
        let speed = app.buttons["학습 속도"]
        XCTAssertTrue(speed.existsOrWait(timeout: 10))
        speed.tap()
        let slider = app.sliders["재생 속도"]
        XCTAssertTrue(slider.existsOrWait(timeout: 5))
        // Real playback at the slowest supported rate leaves time to inspect its disabled state.
        slider.adjust(toNormalizedSliderPosition: 0)
        XCTAssertTrue(app.staticTexts["0.25×"].existsOrWait(timeout: 5))
        XCTAssertTrue(slider.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        XCTAssertEqual(main.staticTexts.count, 0, "Resume must not render text")
        XCTAssertGreaterThanOrEqual(main.frame.height, 44)
        XCTAssertGreaterThanOrEqual(main.frame.width, 44)
        main.tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "재생 중", timeout: 5))
        XCTAssertFalse(main.isEnabled, "An icon-only playback state still cannot confirm practice")
        XCTAssertEqual(main.staticTexts.count, 0, "Playing must not render text")
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        XCTAssertEqual(main.label, "학습 확인")
        XCTAssertEqual(main.staticTexts.count, 0, "Confirm must not render text")
        main.tap()
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(
            for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
    }

    @MainActor func testOptionsOpensAtFullHeightWithoutAnExpansionGesture() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "audio")
        let options = app.buttons["player-options"]
        XCTAssertTrue(options.existsOrWait(timeout: 10))
        for _ in 0..<2 {
            options.tap()
            let close = app.buttons["options-close"]
            XCTAssertTrue(close.hittableOrWait(timeout: 5))
            XCTAssertLessThan(close.frame.maxY, app.frame.height * 0.25,
                              "The options sheet must open expanded, not halfway down the screen")
            XCTAssertTrue(app.collectionViews.buttons["폰트 설정"].isHittable,
                          "All preference rows should be reachable immediately at normal text size")
            close.tap()
        }
        XCTAssertEqual(app.buttons["player-main"].label, "학습 이어하기")
    }

    @MainActor func testNextIsIconOnlyAndStillConfirmsExactlyOneCycle() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "audio")
        let main = app.buttons["player-main"]
        let timeline = app.descendants(matching: .any)["cycle-timeline"]
        for count in 1...2 {
            XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
            XCTAssertEqual(main.label, "학습 확인")
            main.tap()
            XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 \(count)/3", timeout: 5))
        }
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        XCTAssertEqual(main.label, "다음 학습", "Icon-only controls retain their accessible name")
        XCTAssertFalse(main.staticTexts["다음 학습"].exists, "Next must not render a visible text label")
        XCTAssertTrue(app.buttons["player-repeat"].isHittable)
        main.tap()
        XCTAssertTrue(app.staticTexts["2/2"].existsOrWait(timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "3 / 100 XP", timeout: 5))
    }

    @MainActor func testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages() {
        continueAfterFailure = false
        for stage in [1, 11] {
            let app = fixture(stage: stage, mode: "audio")
            XCTAssertTrue(app.buttons["player-options"].existsOrWait(timeout: 10))
            XCTAssertFalse(app.staticTexts["player-book-title"].exists)
            let options = app.buttons["player-options"].frame
            let speed = app.buttons["학습 속도"].frame
            let analysis = app.buttons["문장 분석"].frame
            let progress = app.descendants(matching: .any)["player-progress"].frame
            XCTAssertEqual(options.midY, speed.midY, accuracy: 1)
            XCTAssertEqual(options.midY, analysis.midY, accuracy: 1)
            XCTAssertLessThan(analysis.maxY, progress.minY)
            app.buttons["player-font"].tap()
            XCTAssertTrue(app.otherElements["learning-setting-popup"].existsOrWait(timeout: 5))
            XCTAssertTrue(app.buttons["original-font"].isHittable)
            let fontSize = app.steppers["original-size-stepper"]
            fontSize.buttons.element(boundBy: 1).tap()
            XCTAssertTrue(fontSize.wait(for: \.isEnabled, toEqual: true, timeout: 5))
            XCTAssertEqual(app.textFields["original-size"].value as? String, "21")
            app.buttons["options-close"].tap()
            app.buttons["player-options"].tap()
            let speedTitle = stage == 11 ? "단어 공개 속도" : "배속"
            let titles = ["전체 문장", "학습 화면", "폰트 설정", speedTitle, "다구간 학습 사이즈", "크레이지 스피킹"]
            var previousBottom: CGFloat = 0
            for title in titles {
                let row = app.collectionViews.buttons[title]
                XCTAssertTrue(row.existsOrWait(timeout: 5))
                let rowFrame = row.frame
                XCTAssertGreaterThanOrEqual(rowFrame.minY, previousBottom,
                                           "\(title) must follow the shared Settings order in stage \(stage)")
                previousBottom = rowFrame.maxY
            }
            app.buttons[speedTitle].tap()
            XCTAssertTrue(app.navigationBars[speedTitle].existsOrWait(timeout: 5))
            app.buttons["options-close"].tap()
            app.exitLearningThroughOptions()
            XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
            app.terminate()
        }
    }

    @MainActor func testPlayerOptionsSummariesReflectActiveRunAndVideoLayout() {
        continueAfterFailure = false
        let app = fixture(stage: 7, mode: "video")
        XCTAssertTrue(app.buttons["player-options"].existsOrWait(timeout: 10))
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["배속"].existsOrWait(timeout: 5))
        // Keep lower rows reachable if text sizing makes the menu taller than the sheet.
        for _ in 0..<6 {
            guard !app.collectionViews.buttons["폰트 설정"].isHittable else { break }
            app.swipeUp()
        }
        XCTAssertTrue(app.collectionViews.buttons["폰트 설정"].isHittable)
        XCTAssertEqual(app.buttons["전체 문장"].value as? String, "총 2문장")
        XCTAssertEqual(app.buttons["배속"].value as? String, "1×")
        XCTAssertEqual(app.buttons["다구간 학습 사이즈"].value as? String, "2구간")
        XCTAssertEqual(app.buttons["학습 화면"].value as? String, "리스트로 보기")
        XCTAssertEqual(app.collectionViews.buttons["폰트 설정"].value as? String, "원문 System 20 · 번역 System 18")
        XCTAssertEqual(app.buttons["크레이지 스피킹"].value as? String, "S1 150 · S2 200 · S3 250 · S4 300 WPM")
        app.buttons["배속"].tap()
        app.sliders["재생 속도"].adjust(toNormalizedSliderPosition: 1)
        XCTAssertTrue(app.sliders["재생 속도"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.navigationBars["배속"].buttons["BackButton"].tap()
        XCTAssertEqual(app.buttons["배속"].value as? String, "3×")
        app.buttons["다구간 학습 사이즈"].tap()
        app.buttons["3구간"].tap()
        XCTAssertTrue(app.buttons["2구간"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        XCTAssertEqual(app.buttons["다구간 학습 사이즈"].value as? String, "3구간")
        let exit = app.buttons["options-exit"]
        for _ in 0..<8 {
            guard !exit.isHittable else { break }
            app.swipeUp()
        }
        exit.tap()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        XCTAssertEqual(app.buttons["배속"].value as? String, "1×")
        XCTAssertEqual(app.buttons["다구간 학습 사이즈"].value as? String, "2구간")
        XCTAssertEqual(app.buttons["학습 화면"].value as? String, "버블로 보기")
    }

    @MainActor func testBriefRewardsPreserveCompletionWithoutReplayOnRelaunch() {
        continueAfterFailure = false
        let app = fixture(stage: 11, mode: "audio")
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10))
        main.tap()
        let reward = app.descendants(matching: .any)["player-xp-receipt"]
        // The half-second visual is checked by LearningRewardRenderingTests, not slow UI polling.
        XCTAssertTrue(app.staticTexts["2/2"].existsOrWait(timeout: 5))
        XCTAssertTrue(reward.waitForNonExistence(timeout: 1))
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10))
        main.tap()
        let completion = app.descendants(matching: .any)["player-completion-receipt"]
        XCTAssertTrue(app.staticTexts["스테이지 완료"].existsOrWait(timeout: 5))
        XCTAssertTrue(completion.waitForNonExistence(timeout: 1))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "6 / 100 XP", timeout: 20))
        XCTAssertFalse(reward.exists)
        XCTAssertFalse(completion.exists)
        // The selected book persists; use its Stages tab directly after relaunch.
        XCTAssertTrue(app.tabBars.buttons["스테이지"].hittableOrWait(timeout: 5))
        app.tabBars.buttons["스테이지"].tap()
        XCTAssertTrue(app.buttons["stage-11"].existsOrWait(timeout: 5))
        XCTAssertEqual(app.buttons["stage-11"].value as? String, "완료 1/3",
                       "A persisted full run fills one stage check, not all three")
    }
    @MainActor func testInstalledLessonReopensWithoutServiceAccessOrExtraCredit() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.hittableOrWait(timeout: 20))
        book.tap()
        app.buttons["stage-1"].tap()
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 20))
        main.tap()
        let timeline = app.descendants(matching: .any)["cycle-timeline"]
        XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(book.hittableOrWait(timeout: 20))
        XCTAssertEqual(app.buttons["header-xp"].label, "1 / 100 XP")
        XCTAssertFalse(main.exists, "Relaunch must not automatically reopen or play a lesson")
        app.tabBars.buttons["설정"].tap()
        app.buttons["iCloud 동기화"].tap()
        XCTAssertTrue(app.switches["icloud-sync-toggle"].existsOrWait(timeout: 5))
        XCTAssertEqual(app.switches["icloud-sync-toggle"].value as? String, "0")
        app.tabBars.buttons["책장"].tap()
        book.tap()
        app.buttons["stage-1"].tap()
        XCTAssertTrue(timeline.wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 10))
        app.buttons["player-options"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
        XCTAssertTrue((app.buttons["stage-1"].value as? String ?? "").hasPrefix("완료 0/3"),
                      "One confirmed sentence cycle must not fill a stage-run check")
    }
    @MainActor func testRevealLevelWaitsForPendingPresetSave() {
        continueAfterFailure = false
        let app = fixture(stage: 15, mode: "audio", extra: ["--ui-test-product-delay-reveal-save"])
        XCTAssertTrue(app.buttons["학습 속도"].existsOrWait(timeout: 10))
        app.buttons["학습 속도"].tap()
        let first = app.textFields["reveal-wpm-1"]
        XCTAssertTrue(first.existsOrWait(timeout: 5))
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
        app.buttons["options-close"].tap()
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testGuideExplainsActiveStageWithoutGrantingCredit() {
        continueAfterFailure = false
        let app = fixture(stage: 9, mode: "audio")
        XCTAssertTrue(app.buttons["Lv 5"].existsOrWait(timeout: 10))
        app.buttons["Lv 5"].tap()
        let practice = app.staticTexts["guide-practice"]
        XCTAssertTrue(practice.existsOrWait(timeout: 5), "The guide must explain the active stage, not only its name")
        XCTAssertTrue(practice.label.contains("첫 단어"))
        let group = app.staticTexts["guide-grouping"]
        for _ in 0..<5 {
            guard !group.isHittable else { break }
            app.swipeUp()
        }
        XCTAssertTrue(group.isHittable)
        XCTAssertTrue(group.label.contains("2–4개"))
        let confirmation = app.staticTexts["guide-confirmation"]
        for _ in 0..<5 {
            guard !confirmation.isHittable else { break }
            app.swipeUp()
        }
        XCTAssertTrue(confirmation.isHittable)
        XCTAssertTrue(confirmation.label.contains("세 번"))
        let rewards = app.staticTexts["guide-rewards"]
        for _ in 0..<5 {
            guard !rewards.isHittable else { break }
            app.swipeUp()
        }
        XCTAssertTrue(rewards.isHittable)
        XCTAssertTrue(rewards.label.contains("원본 구간 수"))
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testVideoStaysFixedWhileLargeLessonTextScrolls() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "video-long", extra: [
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"
        ])
        let video = app.otherElements["lesson-video"]
        XCTAssertTrue(video.existsOrWait(timeout: 10))
        let header = app.descendants(matching: .any)["player-progress"]
        let footer = app.buttons["player-main"]
        let text = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Secret bilingual practice.")).firstMatch
        XCTAssertTrue(text.exists)
        let videoFrame = video.frame, headerY = header.frame.minY, footerY = footer.frame.minY
        let textY = text.frame.minY
        // Content scrolls under the player's safe-area bars, so drag inside the
        // visible text region between the fixed video and the bottom controls.
        video.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1.6))
            .press(forDuration: 0.05, thenDragTo: video.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 1.1)))
        XCTAssertLessThan(text.frame.minY, textY, "The lesson text must actually scroll")
        let scrolledVideoFrame = video.frame
        XCTAssertEqual(scrolledVideoFrame.minY, videoFrame.minY, accuracy: 1, "Video must remain outside the scrolling text")
        XCTAssertEqual(scrolledVideoFrame.height, videoFrame.height, accuracy: 1)
        XCTAssertEqual(header.frame.minY, headerY, accuracy: 1)
        XCTAssertEqual(footer.frame.minY, footerY, accuracy: 1)
        XCTAssertTrue(footer.isHittable)
        let expand = app.buttons["video-enter-fullscreen"]
        XCTAssertTrue(expand.isHittable)
        expand.tap()
        let collapse = app.buttons["video-exit-fullscreen"]
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: collapse, timeout: 5))
        XCTAssertTrue(collapse.isHittable)
        XCTAssertGreaterThan(app.frame.width, app.frame.height)
        XCTAssertTrue(app.frame.contains(footer.frame))
        XCTAssertTrue(footer.isHittable)
        let fullscreenTextY = text.frame.minY
        let fullscreenVideo = video.frame, fullscreenAction = footer.frame
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8))
            .press(forDuration: 0.05, thenDragTo: app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)))
        XCTAssertLessThan(text.frame.minY, fullscreenTextY, "Long fullscreen captions must actually scroll")
        XCTAssertEqual(video.frame, fullscreenVideo)
        XCTAssertEqual(footer.frame, fullscreenAction)
        XCTAssertFalse(text.frame.intersects(footer.frame), "The caption lane stays separate from the thumb controls")
        let fullscreen = XCTAttachment(screenshot: app.screenshot())
        fullscreen.name = "Landscape long captions - largest text"
        fullscreen.lifetime = .keepAlways
        add(fullscreen)
        collapse.tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: false, control: expand, timeout: 5))
        XCTAssertTrue(expand.isHittable)
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testOptionsSheetHasOneCloseAndAListExit() {
        continueAfterFailure = false
        for largeText in [false, true] {
            let extra = largeText ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] : []
            let app = fixture(stage: 1, mode: "audio", extra: extra)
            XCTAssertTrue(app.buttons["player-options"].existsOrWait(timeout: 10), "Player options unavailable; largeText=\(largeText)")
            app.buttons["player-options"].tap()
            let close = app.buttons["options-close"]
            XCTAssertTrue(close.hittableOrWait(timeout: 5), "Options need a close control; largeText=\(largeText)")
            XCTAssertEqual(app.buttons.matching(identifier: "options-close").count, 1, "Each page has one dismiss control")
            let rate = app.buttons["배속"]
            for _ in 0..<6 {
                guard !rate.isHittable else { break }
                app.swipeUp()
            }
            XCTAssertTrue(rate.hittableOrWait(timeout: 5), "Rate row inaccessible; largeText=\(largeText)")
            rate.tap()
            XCTAssertTrue(app.sliders["재생 속도"].existsOrWait(timeout: 5), "Rate destination unavailable; largeText=\(largeText)")
            XCTAssertTrue(close.isHittable, "Nested options keep the single close control; largeText=\(largeText)")
            let leave = app.buttons["options-exit"]
            XCTAssertFalse(leave.exists && leave.isHittable, "The stage exit belongs to the options list, not a fixed footer")
            app.navigationBars["배속"].buttons["BackButton"].tap()
            for _ in 0..<6 {
                guard !leave.isHittable else { break }
                app.swipeUp()
            }
            XCTAssertTrue(leave.isHittable, "Stage exit must be reachable in the options list; largeText=\(largeText)")
            leave.tap()
            XCTAssertTrue(app.buttons["stage-1"].existsOrWait(timeout: 5), "Stage exit did not return to stages; largeText=\(largeText)")
            XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5), "Opening and leaving options changed XP; largeText=\(largeText)")
            app.terminate()
        }
    }

    @MainActor func testSubtitleToggleAppearsOnlyForHintStages() {
        continueAfterFailure = false
        for stage in [1, 5, 7, 9] {
            let app = fixture(stage: stage, mode: "audio")
            XCTAssertTrue(app.buttons["player-main"].existsOrWait(timeout: 10))
            let toggle = app.switches["subtitle-toggle"]
            if stage == 5 || stage == 9 {
                XCTAssertTrue(toggle.exists, "Hint stage \(stage) must offer subtitle reveal")
                XCTAssertFalse(app.staticTexts["Secret one"].exists)
                toggle.tap()
                XCTAssertTrue(app.staticTexts["Secret one"].existsOrWait(timeout: 5))
                toggle.tap()
                XCTAssertTrue(app.staticTexts["Secret one"].waitForNonExistence(timeout: 5))
            } else {
                XCTAssertFalse(toggle.exists, "Subtitled stage \(stage) must not offer hiding")
                XCTAssertTrue(app.staticTexts["Secret one"].exists)
            }
            XCTAssertTrue(app.staticTexts["하나"].exists)
            app.exitLearningThroughOptions()
            XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
            app.terminate()
        }
    }

    @MainActor func testVideoHintVisibilitySurvivesFullscreenAndBackground() {
        continueAfterFailure = false
        let app = fixture(stage: 9, mode: "video")
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.isEnabled, toEqual: true, timeout: 15))
        app.buttons["video-enter-fullscreen"].tap()
        let collapse = app.buttons["video-exit-fullscreen"]
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: true, control: collapse, timeout: 5))
        XCTAssertTrue(collapse.isHittable)
        XCTAssertFalse(app.staticTexts["Secret two"].exists, "Fullscreen must not reveal hidden words")
        let toggle = app.switches["subtitle-toggle"]
        toggle.tap()
        XCTAssertTrue(app.staticTexts["Secret two"].existsOrWait(timeout: 5))
        XCUIDevice.shared.press(.home)
        app.activate()
        XCTAssertTrue(collapse.hittableOrWait(timeout: 5))
        XCTAssertTrue(app.staticTexts["Secret two"].exists)
        XCTAssertEqual(app.buttons["player-main"].label, "학습 이어하기")
        collapse.tap()
        XCTAssertTrue(app.videoLayoutOrWait(fullscreen: false, control: app.buttons["video-enter-fullscreen"], timeout: 5))
        XCTAssertTrue(app.buttons["video-enter-fullscreen"].isHittable)
        XCTAssertTrue(app.staticTexts["Secret one"].exists, "Explicit reveal survives the layout change")
        toggle.tap()
        XCTAssertTrue(app.staticTexts["Secret one"].waitForNonExistence(timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testUngroupedPlayerCanEditGlobalGroupAndRevealPresets() {
        let app = fixture(stage: 1, mode: "audio")
        XCTAssertTrue(app.buttons["player-options"].existsOrWait(timeout: 10))
        app.buttons["player-options"].tap()
        let group = app.buttons["다구간 학습 사이즈"], presets = app.buttons["크레이지 스피킹"]
        XCTAssertTrue(group.existsOrWait(timeout: 5))
        XCTAssertTrue(presets.exists)
        guard group.exists, presets.exists else { return }
        group.tap()
        app.segmentedControls.buttons["4구간"].tap()
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        presets.tap()
        let first = app.textFields["reveal-wpm-1"]
        XCTAssertTrue(first.existsOrWait(timeout: 5))
        first.replaceNumericText(with: "175")
        app.buttons["완료"].tap()
        XCTAssertEqual(first.value as? String, "175")
        app.navigationBars["크레이지 스피킹"].buttons["BackButton"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        XCTAssertTrue(app.staticTexts["1/2"].exists)
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        group.tap()
        XCTAssertTrue(app.segmentedControls.buttons["4구간"].wait(for: \.isSelected, toEqual: true, timeout: 5))
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        presets.tap()
        XCTAssertTrue(first.existsOrWait(timeout: 5))
        XCTAssertEqual(first.value as? String, "175")
    }

    @MainActor func testSilentSpeedPresetsRequireExplicitRunSelection() {
        let app = fixture(stage: 15, mode: "audio")
        XCTAssertTrue(app.buttons["학습 속도"].existsOrWait(timeout: 10))
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.isEnabled, toEqual: true, timeout: 10))
        XCTAssertEqual(app.buttons["player-main"].label, "다음 학습")
        app.buttons["학습 속도"].tap()
        let first = app.textFields["reveal-wpm-1"]
        guard first.existsOrWait(timeout: 5) else { XCTFail("Silent speed must include global presets"); return }
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
        let reset = app.buttons["reveal-presets-reset"]
        XCTAssertTrue(reset.existsOrWait(timeout: 5))
        reset.tap()
        XCTAssertTrue(reset.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        for (index, expected) in ["150", "200", "250", "300"].enumerated() {
            XCTAssertEqual(app.textFields["reveal-wpm-\(index + 1)"].value as? String, expected)
        }
        XCTAssertEqual(active.label, "현재 S1 · 175 WPM", "Reset changes defaults, not the active run")
        XCTAssertFalse(app.buttons["active-reveal-level-1"].isSelected)
        app.navigationBars["단어 공개 속도"].buttons["BackButton"].tap()
        XCTAssertEqual(app.buttons["단어 공개 속도"].value as? String, "S1 · 175 WPM")
        XCTAssertEqual(app.buttons["크레이지 스피킹"].value as? String, "S1 150 · S2 200 · S3 250 · S4 300 WPM")
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "다음 학습", timeout: 5))
        XCTAssertTrue(app.staticTexts["1/2"].exists)
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testProgressTrackWidthSurvivesCounterDigitBoundary() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.hittableOrWait(timeout: 20))
        book.tap()
        app.buttons["stage-1"].tap()
        XCTAssertTrue(app.buttons["player-options"].existsOrWait(timeout: 10))
        func selectSource(_ index: Int) {
            app.buttons["player-options"].tap()
            let sentences = app.buttons["전체 문장"]
            XCTAssertTrue(sentences.hittableOrWait(timeout: 5))
            sentences.tap()
            XCTAssertTrue(app.navigationBars["전체 문장"].existsOrWait(timeout: 5))
            let row = app.buttons["source-\(index)"]
            for _ in 0..<8 {
                guard !row.isHittable else { break }
                app.swipeUp()
            }
            XCTAssertTrue(row.isHittable)
            row.tap()
        }
        selectSource(8)
        XCTAssertTrue(app.staticTexts["9/12"].existsOrWait(timeout: 5))
        let track = app.descendants(matching: .any)["player-progress"]
        let before = track.frame
        XCTAssertGreaterThan(before.width, 0)
        selectSource(9)
        XCTAssertTrue(app.staticTexts["10/12"].existsOrWait(timeout: 5))
        let after = track.frame
        XCTAssertEqual(after.width, before.width, accuracy: 0.5)
        XCTAssertEqual(after.minX, before.minX, accuracy: 0.5)
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
    }

    @MainActor func testFailedGroupingEditRetryUpdatesOpenEditor() {
        let app = fixture(stage: 7, mode: "audio", extra: ["--ui-test-product-fail-save"])
        XCTAssertTrue(app.buttons["player-options"].existsOrWait(timeout: 10))
        app.buttons["player-options"].tap()
        app.buttons["다구간 학습 사이즈"].tap()
        let selected = app.segmentedControls.buttons["3구간"]
        XCTAssertTrue(selected.existsOrWait(timeout: 5))
        selected.tap()
        let failure = app.staticTexts["저장하지 못했어요. 다시 변경해 주세요."]
        XCTAssertTrue(failure.existsOrWait(timeout: 5))
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].isSelected)
        let retry = app.buttons["options-save-retry"]
        guard retry.hittableOrWait(timeout: 5) else {
            XCTFail("Retry must remain available in the editor"); return
        }
        retry.tap()
        XCTAssertTrue(selected.wait(for: \.isSelected, toEqual: true, timeout: 5))
        XCTAssertTrue(failure.waitForNonExistence(timeout: 5))
        XCTAssertTrue(selected.isEnabled)
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["다구간 학습 사이즈"].tap()
        XCTAssertTrue(app.segmentedControls.buttons["2구간"].wait(for: \.isSelected, toEqual: true, timeout: 5))
    }

    @MainActor func testFailedRateEditRetryUpdatesOpenEditor() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "audio", extra: ["--ui-test-product-fail-save"])
        let speed = app.buttons["학습 속도"]
        XCTAssertTrue(speed.existsOrWait(timeout: 10))
        XCTAssertFalse(app.buttons["player-group"].exists)
        speed.tap()
        let slider = app.sliders["재생 속도"]
        XCTAssertTrue(slider.existsOrWait(timeout: 5))
        let popup = app.otherElements["learning-setting-popup"]
        XCTAssertTrue(popup.exists)
        XCTAssertLessThan(popup.frame.height, app.frame.height * 0.5)
        slider.adjust(toNormalizedSliderPosition: 1)
        let failure = app.staticTexts["저장하지 못했어요. 다시 변경해 주세요."]
        XCTAssertTrue(failure.existsOrWait(timeout: 5))
        XCTAssertTrue(app.staticTexts["1×"].exists)
        XCTAssertFalse(slider.isEnabled)
        let retry = app.buttons["options-save-retry"]
        guard retry.hittableOrWait(timeout: 5) else {
            XCTFail("Retry must remain available in the editor"); return
        }
        retry.tap()
        XCTAssertTrue(app.staticTexts["3×"].existsOrWait(timeout: 5))
        XCTAssertTrue(failure.waitForNonExistence(timeout: 5))
        XCTAssertTrue(slider.isEnabled)
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.buttons["stage-1"].tap()
        XCTAssertTrue(speed.existsOrWait(timeout: 10))
        speed.tap()
        XCTAssertTrue(slider.existsOrWait(timeout: 5))
        XCTAssertTrue(app.staticTexts["3×"].exists)
    }

    @MainActor func testRepeatAndBackgroundReentryPreserveConfirmedWork() {
        let app = fixture(stage: 1, mode: "audio")
        let main = app.buttons["player-main"]
        let timeline = app.descendants(matching: .any)["cycle-timeline"]
        guard main.existsOrWait(timeout: 10) else { XCTFail("Player unavailable"); return }
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
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "3 / 100 XP", timeout: 5))
        app.buttons["stage-1"].tap()
        XCTAssertTrue(timeline.existsOrWait(timeout: 10))
        XCTAssertEqual(timeline.label, "확인한 반복 3/5")
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["options-close"].existsOrWait(timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
    }

    @MainActor func testPausedRateEditorKeepsGlobalPreferenceSeparate() {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "audio")
        let speed = app.buttons["학습 속도"]
        XCTAssertTrue(speed.existsOrWait(timeout: 10))
        speed.tap()
        let slider = app.sliders["재생 속도"]
        XCTAssertTrue(slider.existsOrWait(timeout: 5))
        let indicator = app.staticTexts["rate-current-value"]
        XCTAssertTrue(indicator.exists)
        XCTAssertGreaterThan(indicator.frame.minX, slider.frame.maxX)
        // AX includes the lower tick overlay in the slider bounds; the hosted rendering
        // regression checks exact alignment with the visible track, not this larger AX box.
        XCTAssertGreaterThanOrEqual(indicator.frame.minY, slider.frame.minY)
        XCTAssertLessThanOrEqual(indicator.frame.maxY, slider.frame.maxY)
        for label in ["0.25×", "2×", "3×"] { XCTAssertFalse(app.staticTexts[label].exists, label) }
        // XCTest's normalized drag is approximate; require an actual quarter-step change
        // and its durable reopening rather than assuming an exact intermediate pointer position.
        slider.adjust(toNormalizedSliderPosition: 0.65)
        XCTAssertTrue(slider.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        let changedLabel = indicator.label
        let changedRate = Double(changedLabel.replacingOccurrences(of: "×", with: "")) ?? -1
        XCTAssertGreaterThan(changedRate, 1)
        XCTAssertLessThan(changedRate, 3)
        XCTAssertEqual((changedRate * 4).rounded(), changedRate * 4)
        app.buttons["options-close"].tap()
        speed.tap()
        XCTAssertTrue(indicator.wait(for: \.label, toEqual: changedLabel, timeout: 5))
        slider.adjust(toNormalizedSliderPosition: 1)
        XCTAssertTrue(app.staticTexts["3×"].existsOrWait(timeout: 5))
        XCTAssertTrue(slider.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        speed.tap()
        XCTAssertTrue(slider.existsOrWait(timeout: 5))
        XCTAssertTrue(app.staticTexts["3×"].exists)
        XCTAssertFalse(app.staticTexts["1×"].exists)
        app.buttons["options-close"].tap()
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["배속"].tap()
        XCTAssertTrue(slider.existsOrWait(timeout: 5))
        XCTAssertTrue(app.staticTexts["1×"].exists)
        XCTAssertFalse(app.staticTexts["3×"].exists)
    }

    @MainActor private func fixture(stage: Int, mode: String, extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString,
                               "--ui-test-product-fixture", mode] + extra
        app.launch()
        let book = app.buttons["book-ui-fixture-v1"]
        XCTAssertTrue(book.existsOrWait(timeout: 15),
                      "The isolated fixture book must finish loading: appState=\(app.state.rawValue), retryVisible=\(app.buttons["bootstrap-retry"].exists), launchVisible=\(app.descendants(matching: .any)["launch-screen"].exists)")
        if !book.exists { return app }
        for _ in 0..<5 {
            guard !book.isHittable else { break }
            app.scrollViews.firstMatch.swipeUp()
        }
        XCTAssertTrue(book.hittableOrWait(timeout: 10), "The fixture book must be tappable")
        book.tap()
        let row = app.buttons["stage-\(stage)"]
        for _ in 0..<10 {
            guard !row.isHittable else { break }
            app.swipeUp()
        }
        XCTAssertTrue(row.isHittable, "The requested fixture stage must be reachable")
        if row.isHittable { row.tap() }
        return app
    }
    @MainActor func testGroupedVideoAndSilentUseNormalPlayer() {
        continueAfterFailure = false
        let video = fixture(stage: 7, mode: "video")
        let main = video.buttons["player-main"]
        guard main.existsOrWait(timeout: 10) else { XCTFail("Player unavailable"); return }
        XCTAssertTrue(video.otherElements["lesson-video"].exists)
        XCTAssertFalse(video.otherElements["learning-bubble-0-0"].exists, "Video overrides the saved bubble layout")
        let first = video.staticTexts["learning-line-0-0-target"]
        let second = video.staticTexts["learning-line-1-0-target"]
        XCTAssertTrue(first.exists && second.exists)
        XCTAssertEqual(first.frame.minX, second.frame.minX, accuracy: 1)
        let listCard = video.otherElements["learning-list-card"]
        XCTAssertTrue(listCard.exists)
        XCTAssertEqual(video.otherElements.matching(identifier: "learning-list-card").count, 1)
        XCTAssertGreaterThanOrEqual(first.frame.minX - listCard.frame.minX, 12)
        XCTAssertLessThan(second.frame.maxY, listCard.frame.maxY)
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
        XCTAssertEqual(video.descendants(matching: .any)["cycle-timeline"].value as? String, "재생 완료, 확인 대기")
        main.tap()
        XCTAssertTrue(video.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        video.buttons["player-options"].tap()
        video.buttons["학습 화면"].tap()
        let previewFirst = video.staticTexts["settings-preview-original-0"]
        let previewSecond = video.staticTexts["settings-preview-original-1"]
        XCTAssertTrue(previewFirst.existsOrWait(timeout: 5))
        XCTAssertTrue(previewSecond.exists)
        XCTAssertEqual(previewFirst.frame.minX, previewSecond.frame.minX, accuracy: 1)
        XCTAssertTrue(video.otherElements["settings-preview-list-card"].exists)
        XCTAssertFalse(video.buttons["버블로 보기"].exists, "Video options must not offer an ineffective bubble choice")
        video.buttons["options-close"].tap()
        video.exitLearningThroughOptions()
        XCTAssertTrue(video.buttons["header-xp"].wait(for: \.label, toEqual: "2 / 100 XP", timeout: 5))
        video.tabBars.buttons["설정"].tap()
        video.buttons["학습 설정"].tap()
        video.buttons["학습 화면"].tap()
        XCTAssertTrue(video.buttons["버블로 보기"].isSelected, "Video must not overwrite the saved display preference")
        video.terminate()

        let silent = fixture(stage: 15, mode: "video")
        let action = silent.buttons["player-main"]
        guard action.existsOrWait(timeout: 10) else { XCTFail("Player unavailable"); return }
        XCTAssertFalse(silent.otherElements["lesson-video"].exists)
        XCTAssertFalse(silent.descendants(matching: .any)["cycle-timeline"].exists)
        XCTAssertFalse(silent.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "Secret")).firstMatch.exists)
        XCTAssertTrue(action.wait(for: \.isEnabled, toEqual: true, timeout: 10))
        XCTAssertTrue(silent.otherElements["learning-bubble-0-0"].exists, "Silent stages without video honor the bubble preference")
        action.tap()
        silent.exitLearningThroughOptions()
        XCTAssertTrue(silent.buttons["header-xp"].wait(for: \.label, toEqual: "3 / 100 XP", timeout: 5))
    }
    @MainActor func testAudioLayoutChangesBetweenConversationAndReadingWithoutCredit() {
        continueAfterFailure = false
        let app = fixture(stage: 7, mode: "audio")
        let first = app.staticTexts["learning-line-0-0-target"]
        let second = app.staticTexts["learning-line-1-0-target"]
        XCTAssertTrue(first.existsOrWait(timeout: 10))
        XCTAssertTrue(second.exists)
        XCTAssertGreaterThan(second.frame.minX, first.frame.minX + 20)
        app.buttons["player-options"].tap()
        app.buttons["학습 화면"].tap()
        app.buttons["리스트로 보기"].tap()
        XCTAssertTrue(app.buttons["버블로 보기"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(first.existsOrWait(timeout: 5))
        let firstFrame = first.frame, secondFrame = second.frame
        XCTAssertEqual(firstFrame.minX, secondFrame.minX, accuracy: 1)
        XCTAssertFalse(app.otherElements["learning-bubble-0-0"].exists)
        let listCard = app.otherElements["learning-list-card"]
        XCTAssertTrue(listCard.exists)
        let listCardFrame = listCard.frame
        XCTAssertGreaterThanOrEqual(firstFrame.minX - listCardFrame.minX, 12)
        XCTAssertLessThan(secondFrame.maxY, listCardFrame.maxY)
        XCTAssertEqual(app.buttons["player-main"].label, "학습 이어하기")
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testAllSentencesSelectsPausedWithoutCredit() {
        let app = fixture(stage: 1, mode: "audio")
        guard app.buttons["player-options"].existsOrWait(timeout: 10) else { XCTFail("Player unavailable"); return }
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["전체 문장"].existsOrWait(timeout: 5))
        app.buttons["전체 문장"].tap()
        app.buttons["source-1"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        XCTAssertTrue(app.staticTexts["2/2"].exists)
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testSaveFailureRetryDoesNotDuplicateCreditOrAutoplay() {
        let app = fixture(stage: 1, mode: "audio", extra: ["--ui-test-product-fail-save"])
        let main = app.buttons["player-main"]
        guard main.existsOrWait(timeout: 10) else { XCTFail("Player unavailable"); return }
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10), "Audio completion must enable explicit confirmation")
        main.tap()
        let retry = app.buttons["player-save-retry"]
        XCTAssertTrue(retry.existsOrWait(timeout: 5), "The injected save failure must expose its retry action")
        app.buttons["player-options"].tap()
        let menuRetry = app.buttons["options-save-retry"]
        XCTAssertTrue(menuRetry.existsOrWait(timeout: 5), "A save failure must not block the only exit menu")
        XCTAssertFalse(app.buttons["배속"].isEnabled, "Lesson edits remain blocked until retry commits")
        menuRetry.tap()
        XCTAssertTrue(app.buttons["배속"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5), "Retry must leave playback paused")
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5), "Retry must commit exactly one XP before leaving the player")
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["header-xp"].existsOrWait(timeout: 15), "Relaunch must restore the fixture profile")
        XCTAssertEqual(app.buttons["header-xp"].label, "1 / 100 XP", "Relaunch must preserve exactly one committed XP")
    }

    @MainActor func testRealAudioConfirmationAndPausedMenu() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.existsOrWait(timeout: 15))
        XCTAssertTrue(book.hittableOrWait(timeout: 10))
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
        book.tap()
        XCTAssertTrue(app.buttons["stage-1"].existsOrWait(timeout: 5))
        app.buttons["stage-1"].tap()
        let action = app.buttons["player-main"]
        XCTAssertTrue(action.existsOrWait(timeout: 10))
        XCTAssertFalse(app.buttons["player-exit"].exists, "Stage exit belongs in the options sheet")
        for label in ["학습 옵션", "Lv 1", "학습 속도", "문장 분석"] {
            XCTAssertTrue(app.buttons[label].isHittable, "Header controls remain actual independent touch targets: \(label)")
        }
        guard action.exists else { return }
        XCTAssertTrue(action.wait(for: \.isEnabled, toEqual: true, timeout: 20))
        action.tap()
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["options-close"].existsOrWait(timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(action.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
    }
}
