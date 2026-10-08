import XCTest
import UIKit

final class PlayerUITests: XCTestCase {
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
        XCTAssertTrue(app.buttons["options-close"].waitForExistence(timeout: 5))
        let exit = app.buttons["options-exit"]
        for _ in 0..<8 where !exit.isHittable { app.swipeUp() }
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

    @MainActor func testSentenceProgressUsesThePrimaryActionColor() throws {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "audio")
        let main = app.buttons["player-main"]
        for _ in 0..<3 {
            XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
            main.tap()
        }
        XCTAssertTrue(app.staticTexts["2/2"].waitForExistence(timeout: 5))
        let progress = app.progressIndicators["player-progress"]
        let image = try XCTUnwrap(progress.screenshot().image.cgImage)
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        try pixels.withUnsafeMutableBytes { bytes in
            let context = try XCTUnwrap(CGContext(data: bytes.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        let primaryPixels = stride(from: 0, to: pixels.count, by: 4).filter {
            pixels[$0] > 230 && pixels[$0 + 1] > 150 && pixels[$0 + 1] < 225 && pixels[$0 + 2] < 75
        }.count
        XCTAssertGreaterThan(primaryPixels, width, "Completed sentence progress must use the primary yellow, not the dark interactive tint")
    }

    @MainActor func testActiveCycleRingStaysInsideTimelineAtEveryNode() throws {
        continueAfterFailure = false
        let app = fixture(stage: 1, mode: "audio")
        let main = app.buttons["player-main"]
        let timeline = app.descendants(matching: .any)["cycle-timeline"]
        for ordinal in 0..<3 {
            XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 15))
            XCTAssertEqual(timeline.label, "확인한 반복 \(ordinal)/3")
            let image = try XCTUnwrap(timeline.screenshot().image.cgImage)
            let width = image.width, height = image.height
            var pixels = [UInt8](repeating: 0, count: width * height * 4)
            try pixels.withUnsafeMutableBytes { bytes in
                let context = try XCTUnwrap(CGContext(data: bytes.baseAddress, width: width, height: height,
                    bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
                context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
            }
            func green(_ x: Int, _ y: Int) -> Bool {
                let index = (y * width + x) * 4
                let red = Int(pixels[index]), green = Int(pixels[index + 1]), blue = Int(pixels[index + 2])
                return green > 80 && green > red + 20 && green > blue + 20
            }
            // Three evenly spaced nodes: inspect only the active node's third of the strip.
            let columns = (ordinal * width / 3)..<((ordinal + 1) * width / 3)
            // Exclude the connector centerline: it must not stand in for a missing active ring.
            XCTAssertTrue(columns.contains { x in
                (0..<height).contains { y in abs(y - height / 2) > height / 4 && green(x, y) }
            },
                          "The active ring must actually be drawn")
            XCTAssertFalse(columns.contains { green($0, 0) || green($0, height - 1) },
                           "The active ring needs clearance from the top/bottom clipping edges; node=\(ordinal)")
            if ordinal == 0 || ordinal == 2 {
                let edge = ordinal == 0 ? 0 : width - 1
                XCTAssertFalse((0..<height).contains { green(edge, $0) },
                               "Edge nodes must not touch the horizontal clipping boundary")
            }
            if ordinal < 2 { main.tap() }
        }
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "2 / 100 XP", timeout: 5))
    }

    @MainActor func testResumePlayingAndConfirmAreIconOnlyWithoutChangingCredit() {
        let app = fixture(stage: 1, mode: "audio")
        let main = app.buttons["player-main"]
        let speed = app.buttons["학습 속도"]
        XCTAssertTrue(speed.waitForExistence(timeout: 10))
        speed.tap()
        let slider = app.sliders["재생 속도"]
        XCTAssertTrue(slider.waitForExistence(timeout: 5))
        // Real playback at the slowest supported rate leaves time to inspect its disabled state.
        slider.adjust(toNormalizedSliderPosition: 0)
        XCTAssertTrue(app.staticTexts["0.25×"].waitForExistence(timeout: 5))
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
        XCTAssertTrue(options.waitForExistence(timeout: 10))
        for _ in 0..<2 {
            options.tap()
            let close = app.buttons["options-close"]
            XCTAssertTrue(close.wait(for: \.isHittable, toEqual: true, timeout: 5))
            XCTAssertLessThan(close.frame.maxY, app.frame.height * 0.25,
                              "The options sheet must open expanded, not halfway down the screen")
            XCTAssertTrue(app.buttons["폰트 설정"].isHittable,
                          "All preference rows should be reachable immediately at normal text size")
            close.tap()
        }
        XCTAssertEqual(app.buttons["player-main"].label, "학습 이어하기")
    }

    @MainActor func testShortLearningContentCentersBetweenFixedControls() {
        continueAfterFailure = false
        for mode in ["audio", "video"] {
            for largeText in [false, true] {
                let extra = largeText ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] : []
                let app = fixture(stage: 1, mode: mode, extra: extra)
                let original = app.staticTexts["learning-line-0-0-target"]
                let translation = app.staticTexts["learning-line-0-0-translation"]
                XCTAssertTrue(original.waitForExistence(timeout: 10))
                XCTAssertTrue(translation.exists)
                let upper = mode == "video" ? app.otherElements["lesson-video"] : app.buttons["Lv 1"]
                let timeline = app.descendants(matching: .any)["cycle-timeline"]
                let textFrame = original.frame.union(translation.frame)
                XCTAssertGreaterThan(textFrame.minY, upper.frame.maxY)
                XCTAssertLessThan(textFrame.maxY, timeline.frame.minY, "Content must fit above the footer; mode=\(mode), largeText=\(largeText)")
                XCTAssertEqual(textFrame.midY, (upper.frame.maxY + timeline.frame.minY) / 2, accuracy: 24,
                               "Short content should use the center of the available reading area; mode=\(mode), largeText=\(largeText)")
                XCTAssertTrue(app.buttons["player-main"].isHittable)
                app.terminate()
            }
        }
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
        XCTAssertTrue(app.staticTexts["2/2"].waitForExistence(timeout: 5))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "3 / 100 XP", timeout: 5))
    }

    @MainActor func testPlayerHeaderGroupsTitleAndProgressBesideLeadingOptions() {
        continueAfterFailure = false
        for (mode, largeText) in [("audio", false), ("audio", true), ("long", false), ("long", true)] {
            let extra = largeText ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] : []
            let app = fixture(stage: 1, mode: mode, extra: extra)
            let options = app.buttons["player-options"]
            XCTAssertTrue(options.waitForExistence(timeout: 10))
            XCTAssertFalse(app.buttons["player-exit"].exists)
            let title = app.staticTexts["player-book-title"]
            let progress = app.descendants(matching: .any)["player-progress"]
            XCTAssertTrue(title.exists && progress.exists)
            XCTAssertLessThan(options.frame.midX, app.frame.midX)
            XCTAssertGreaterThanOrEqual(progress.frame.minY, title.frame.maxY)
            XCTAssertGreaterThan(progress.frame.minX, options.frame.maxX)
            XCTAssertLessThanOrEqual(progress.frame.maxX, app.frame.maxX)
            XCTAssertLessThan(progress.frame.maxY, app.buttons["Lv 1"].frame.minY)
            XCTAssertEqual(title.frame.midX, app.frame.midX, accuracy: 2, "Keep the book title centered")
            XCTAssertEqual(app.staticTexts["1/2"].frame.maxX, app.buttons["문장 분석"].frame.maxX, accuracy: 2,
                           "The sentence count should use the right content margin, leaving a longer track")
            options.tap()
            let exit = app.buttons["options-exit"]
            for _ in 0..<8 where !exit.isHittable { app.swipeUp() }
            XCTAssertTrue(exit.isHittable)
            exit.tap()
            XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
            app.terminate()
        }
    }

    @MainActor func testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages() {
        continueAfterFailure = false
        for stage in [1, 11] {
            let app = fixture(stage: stage, mode: "audio")
            XCTAssertTrue(app.buttons["player-options"].waitForExistence(timeout: 10))
            app.buttons["player-options"].tap()
            let speedTitle = stage == 11 ? "단어 공개 속도" : "배속"
            let titles = ["전체 문장", "학습 화면", "폰트 설정", speedTitle, "다구간 학습 사이즈", "크레이지 스피킹"]
            var previousBottom: CGFloat = 0
            for title in titles {
                let row = app.buttons[title]
                XCTAssertTrue(row.waitForExistence(timeout: 5))
                XCTAssertGreaterThanOrEqual(row.frame.minY, previousBottom,
                                           "\(title) must follow the shared Settings order in stage \(stage)")
                previousBottom = row.frame.maxY
            }
            app.buttons[speedTitle].tap()
            XCTAssertTrue(app.navigationBars[speedTitle].waitForExistence(timeout: 5))
            app.buttons["options-close"].tap()
            app.exitLearningThroughOptions()
            XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
            app.terminate()
        }
    }

    @MainActor func testPlayerOptionsSummariesReflectActiveRunAndVideoLayout() {
        continueAfterFailure = false
        let app = fixture(stage: 7, mode: "video")
        XCTAssertTrue(app.buttons["player-options"].waitForExistence(timeout: 10))
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["배속"].waitForExistence(timeout: 5))
        // Keep lower rows reachable if text sizing makes the menu taller than the sheet.
        for _ in 0..<6 where !app.buttons["폰트 설정"].isHittable { app.swipeUp() }
        XCTAssertTrue(app.buttons["폰트 설정"].isHittable)
        XCTAssertEqual(app.buttons["전체 문장"].value as? String, "총 2문장")
        XCTAssertEqual(app.buttons["배속"].value as? String, "1×")
        XCTAssertEqual(app.buttons["다구간 학습 사이즈"].value as? String, "2구간")
        XCTAssertEqual(app.buttons["학습 화면"].value as? String, "리스트로 보기")
        XCTAssertEqual(app.buttons["폰트 설정"].value as? String, "원문 System 20 · 번역 System 18")
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
        for _ in 0..<8 where !exit.isHittable { app.swipeUp() }
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
        XCTAssertTrue(app.staticTexts["2/2"].waitForExistence(timeout: 5))
        XCTAssertTrue(reward.waitForNonExistence(timeout: 1))
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10))
        main.tap()
        let completion = app.descendants(matching: .any)["player-completion-receipt"]
        XCTAssertTrue(app.staticTexts["스테이지 완료"].waitForExistence(timeout: 5))
        XCTAssertTrue(completion.waitForNonExistence(timeout: 1))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "6 / 100 XP", timeout: 20))
        XCTAssertFalse(reward.exists)
        XCTAssertFalse(completion.exists)
        // The selected book persists; use its Stages tab directly after relaunch.
        XCTAssertTrue(app.tabBars.buttons["스테이지"].wait(for: \.isHittable, toEqual: true, timeout: 5))
        app.tabBars.buttons["스테이지"].tap()
        XCTAssertTrue(app.buttons["stage-11"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons["stage-11"].value as? String, "완료 1/3",
                       "A persisted full run fills one stage check, not all three")
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
        XCTAssertEqual(app.buttons["header-xp"].label, "1 / 100 XP")
        XCTAssertFalse(main.exists, "Relaunch must not automatically reopen or play a lesson")
        app.tabBars.buttons["설정"].tap()
        app.buttons["iCloud 동기화"].tap()
        XCTAssertTrue(app.switches["icloud-sync-toggle"].waitForExistence(timeout: 5))
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
        app.buttons["options-close"].tap()
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
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
        XCTAssertTrue(video.waitForExistence(timeout: 10))
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
        XCTAssertEqual(video.frame.minY, videoFrame.minY, accuracy: 1, "Video must remain outside the scrolling text")
        XCTAssertEqual(video.frame.height, videoFrame.height, accuracy: 1)
        XCTAssertEqual(header.frame.minY, headerY, accuracy: 1)
        XCTAssertEqual(footer.frame.minY, footerY, accuracy: 1)
        XCTAssertTrue(footer.isHittable)
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }

    @MainActor func testOptionsSheetHasOneCloseAndAListExit() {
        continueAfterFailure = false
        for largeText in [false, true] {
            let extra = largeText ? ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"] : []
            let app = fixture(stage: 1, mode: "audio", extra: extra)
            XCTAssertTrue(app.buttons["player-options"].waitForExistence(timeout: 10), "Player options unavailable; largeText=\(largeText)")
            app.buttons["player-options"].tap()
            let close = app.buttons["options-close"]
            XCTAssertTrue(close.wait(for: \.isHittable, toEqual: true, timeout: 5), "Options need a close control; largeText=\(largeText)")
            XCTAssertEqual(app.buttons.matching(identifier: "options-close").count, 1, "Each page has one dismiss control")
            let rate = app.buttons["배속"]
            for _ in 0..<6 where !rate.isHittable { app.swipeUp() }
            XCTAssertTrue(rate.wait(for: \.isHittable, toEqual: true, timeout: 5), "Rate row inaccessible; largeText=\(largeText)")
            rate.tap()
            XCTAssertTrue(app.sliders["재생 속도"].waitForExistence(timeout: 5), "Rate destination unavailable; largeText=\(largeText)")
            XCTAssertTrue(close.isHittable, "Nested options keep the single close control; largeText=\(largeText)")
            let leave = app.buttons["options-exit"]
            XCTAssertFalse(leave.exists && leave.isHittable, "The stage exit belongs to the options list, not a fixed footer")
            app.navigationBars["배속"].buttons["BackButton"].tap()
            for _ in 0..<6 where !leave.isHittable { app.swipeUp() }
            XCTAssertTrue(leave.isHittable, "Stage exit must be reachable in the options list; largeText=\(largeText)")
            leave.tap()
            XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5), "Stage exit did not return to stages; largeText=\(largeText)")
            XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5), "Opening and leaving options changed XP; largeText=\(largeText)")
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
            app.exitLearningThroughOptions()
            XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
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
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
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
        let reset = app.buttons["reveal-presets-reset"]
        XCTAssertTrue(reset.waitForExistence(timeout: 5))
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
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
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
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
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
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "3 / 100 XP", timeout: 5))
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
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
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
        XCTAssertTrue(book.waitForExistence(timeout: 15),
                      "The isolated fixture book must finish loading: appState=\(app.state.rawValue), retryVisible=\(app.buttons["bootstrap-retry"].exists), launchVisible=\(app.descendants(matching: .any)["launch-screen"].exists)")
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
        continueAfterFailure = false
        let video = fixture(stage: 7, mode: "video")
        let main = video.buttons["player-main"]
        guard main.waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
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
        XCTAssertTrue(previewFirst.waitForExistence(timeout: 5))
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
        guard action.waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
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
        XCTAssertTrue(first.waitForExistence(timeout: 10))
        XCTAssertTrue(second.exists)
        XCTAssertGreaterThan(second.frame.minX, first.frame.minX + 20)
        app.buttons["player-options"].tap()
        app.buttons["학습 화면"].tap()
        app.buttons["리스트로 보기"].tap()
        XCTAssertTrue(app.buttons["버블로 보기"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(first.waitForExistence(timeout: 5))
        XCTAssertEqual(first.frame.minX, second.frame.minX, accuracy: 1)
        XCTAssertFalse(app.otherElements["learning-bubble-0-0"].exists)
        let listCard = app.otherElements["learning-list-card"]
        XCTAssertTrue(listCard.exists)
        XCTAssertGreaterThanOrEqual(first.frame.minX - listCard.frame.minX, 12)
        XCTAssertLessThan(second.frame.maxY, listCard.frame.maxY)
        XCTAssertEqual(app.buttons["player-main"].label, "학습 이어하기")
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
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
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testSaveFailureRetryDoesNotDuplicateCreditOrAutoplay() {
        let app = fixture(stage: 1, mode: "audio", extra: ["--ui-test-product-fail-save"])
        let main = app.buttons["player-main"]
        guard main.waitForExistence(timeout: 10) else { XCTFail("Player unavailable"); return }
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 10), "Audio completion must enable explicit confirmation")
        main.tap()
        let retry = app.buttons["player-save-retry"]
        XCTAssertTrue(retry.waitForExistence(timeout: 5), "The injected save failure must expose its retry action")
        app.buttons["player-options"].tap()
        let menuRetry = app.buttons["options-save-retry"]
        XCTAssertTrue(menuRetry.waitForExistence(timeout: 5), "A save failure must not block the only exit menu")
        XCTAssertFalse(app.buttons["배속"].isEnabled, "Lesson edits remain blocked until retry commits")
        menuRetry.tap()
        XCTAssertTrue(app.buttons["배속"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["options-close"].tap()
        XCTAssertTrue(main.wait(for: \.label, toEqual: "학습 이어하기", timeout: 5), "Retry must leave playback paused")
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5), "Retry must commit exactly one XP before leaving the player")
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["header-xp"].waitForExistence(timeout: 15), "Relaunch must restore the fixture profile")
        XCTAssertEqual(app.buttons["header-xp"].label, "1 / 100 XP", "Relaunch must preserve exactly one committed XP")
    }

    @MainActor func testRealAudioConfirmationAndPausedMenu() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15))
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
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
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
    }
}
