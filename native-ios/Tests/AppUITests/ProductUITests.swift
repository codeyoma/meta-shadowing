import XCTest
import UIKit

final class ProductUITests: XCTestCase {
    @MainActor func testLearningSettingsSummariesWrapAtLargestTextSize() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString,
                               "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["설정"].wait(for: \.isHittable, toEqual: true, timeout: 20))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        let display = app.buttons["학습 화면"]
        XCTAssertTrue(display.waitForExistence(timeout: 5))
        let displayHeight = display.frame.height
        for title in ["학습 화면", "폰트 설정", "배속", "다구간 학습 사이즈", "크레이지 스피킹"] {
            let row = app.buttons[title]
            for _ in 0..<6 where !row.isHittable { app.swipeUp() }
            XCTAssertTrue(row.isHittable, "The summary must not make \(title) unreachable")
            XCTAssertFalse((row.value as? String ?? "").isEmpty)
            XCTAssertGreaterThanOrEqual(row.frame.minX, 0)
            XCTAssertLessThanOrEqual(row.frame.maxX, app.frame.width)
            if title == "폰트 설정" {
                XCTAssertGreaterThan(row.frame.height, displayHeight, "Long font details wrap instead of being clipped")
            }
        }
        app.buttons["크레이지 스피킹"].tap()
        XCTAssertTrue(app.navigationBars["크레이지 스피킹"].waitForExistence(timeout: 5))
    }

    @MainActor func testLearningSettingsSummariesFollowSavedOptionsAcrossRelaunch() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        func openSettings() {
            XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 20))
            app.tabBars.buttons["설정"].tap()
            app.buttons["학습 설정"].tap()
            XCTAssertTrue(app.buttons["학습 화면"].waitForExistence(timeout: 5))
        }
        func summary(_ title: String, _ expected: String) {
            XCTAssertEqual(app.buttons[title].value as? String, expected)
        }
        func back(_ title: String) { app.navigationBars[title].buttons["BackButton"].tap() }
        openSettings()
        summary("학습 화면", "버블로 보기")
        summary("폰트 설정", "원문 System 20 · 번역 System 18")
        summary("배속", "1×")
        summary("다구간 학습 사이즈", "2구간")
        summary("크레이지 스피킹", "S1 150 · S2 200 · S3 250 · S4 300 WPM")

        app.buttons["학습 화면"].tap()
        app.buttons["리스트로 보기"].tap()
        XCTAssertTrue(app.buttons["버블로 보기"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        back("학습 화면")
        summary("학습 화면", "리스트로 보기")

        app.buttons["배속"].tap()
        let slider = app.sliders["재생 속도"]
        slider.adjust(toNormalizedSliderPosition: 1)
        XCTAssertTrue(slider.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        back("배속")
        summary("배속", "3×")

        app.buttons["다구간 학습 사이즈"].tap()
        app.buttons["3구간"].tap()
        XCTAssertTrue(app.buttons["2구간"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        back("다구간 학습 사이즈")
        summary("다구간 학습 사이즈", "3구간")

        app.buttons["폰트 설정"].tap()
        let stepper = app.steppers["original-size-stepper"]
        XCTAssertTrue(stepper.waitForExistence(timeout: 5))
        stepper.buttons.element(boundBy: 1).tap()
        XCTAssertTrue(stepper.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.buttons["original-font"].tap()
        app.buttons["Apple SD Gothic Neo"].tap()
        XCTAssertTrue(app.buttons["original-font"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        back("폰트 설정")
        summary("폰트 설정", "원문 Apple SD Gothic Neo 21 · 번역 System 18")

        app.buttons["크레이지 스피킹"].tap()
        app.textFields["reveal-wpm-1"].replaceNumericText(with: "200")
        app.buttons["완료"].tap()
        XCTAssertTrue(app.buttons["reveal-presets-reset"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        back("크레이지 스피킹")
        summary("크레이지 스피킹", "S1 200 · S2 250 · S3 300 · S4 350 WPM")
        app.buttons["크레이지 스피킹"].tap()
        app.buttons["reveal-presets-reset"].tap()
        XCTAssertTrue(app.buttons["reveal-presets-reset"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
        back("크레이지 스피킹")
        summary("크레이지 스피킹", "S1 150 · S2 200 · S3 250 · S4 300 WPM")

        app.terminate(); app.launch()
        openSettings()
        summary("학습 화면", "리스트로 보기")
        summary("폰트 설정", "원문 Apple SD Gothic Neo 21 · 번역 System 18")
        summary("배속", "3×")
        summary("다구간 학습 사이즈", "3구간")
        summary("크레이지 스피킹", "S1 150 · S2 200 · S3 250 · S4 300 WPM")
    }

    @MainActor func testRevealPresetResetDiscardsDraftAndPersistsDefaults() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        func openEditor() {
            XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 20))
            app.tabBars.buttons["설정"].tap()
            app.buttons["학습 설정"].tap()
            app.buttons["크레이지 스피킹"].tap()
            XCTAssertTrue(app.textFields["reveal-wpm-1"].waitForExistence(timeout: 5))
        }
        func assertDefaults() {
            for (index, expected) in ["150", "200", "250", "300"].enumerated() {
                XCTAssertEqual(app.textFields["reveal-wpm-\(index + 1)"].value as? String, expected)
            }
        }
        openEditor()
        let reset = app.buttons["reveal-presets-reset"]
        XCTAssertTrue(reset.waitForExistence(timeout: 5))
        let first = app.textFields["reveal-wpm-1"]
        first.replaceNumericText(with: "200")
        app.buttons["완료"].tap()
        XCTAssertTrue(reset.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        XCTAssertEqual(app.textFields["reveal-wpm-4"].value as? String, "350")
        reset.tap()
        XCTAssertTrue(reset.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        assertDefaults()
        // A reset also discards an uncommitted draft when saved values already equal the defaults.
        first.replaceNumericText(with: "175")
        XCTAssertEqual(first.value as? String, "175")
        reset.tap()
        XCTAssertTrue(reset.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        assertDefaults()
        XCTAssertFalse(app.buttons["완료"].exists, "Reset must finish the discarded editing session")
        app.terminate(); app.launch()
        openEditor()
        assertDefaults()
    }

    @MainActor func testSettingsPreviewsShowTwoSeparateLongQuotedSentences() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.tabBars.buttons["설정"].wait(for: \.isHittable, toEqual: true, timeout: 10))
        app.tabBars.buttons["설정"].tap()
        XCTAssertTrue(app.buttons["학습 설정"].wait(for: \.isHittable, toEqual: true, timeout: 5))
        app.buttons["학습 설정"].tap()
        for editor in ["학습 화면", "폰트 설정"] {
            app.buttons[editor].tap()
            for index in 0..<2 {
                let original = app.staticTexts["settings-preview-original-\(index)"]
                let translation = app.staticTexts["settings-preview-translation-\(index)"]
                XCTAssertTrue(original.waitForExistence(timeout: 5))
                XCTAssertTrue(translation.exists)
                XCTAssertTrue(original.label.hasPrefix("\"") && original.label.hasSuffix("\""))
                XCTAssertTrue(translation.label.hasPrefix("\"") && translation.label.hasSuffix("\""))
                XCTAssertGreaterThan(original.label.count, 60, "Preview sentences exercise wrapping")
                XCTAssertGreaterThan(original.frame.height, 30)
            }
            let first = app.staticTexts["settings-preview-original-0"]
            let second = app.staticTexts["settings-preview-original-1"]
            XCTAssertGreaterThan(second.frame.minX, first.frame.minX + 20, "Bubble preview must alternate conversation sides")
            if editor == "학습 화면" {
                XCTAssertFalse(app.otherElements["settings-preview-list-card"].exists)
                app.buttons["리스트로 보기"].tap()
                XCTAssertTrue(app.buttons["버블로 보기"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
                XCTAssertEqual(first.frame.minX, second.frame.minX, accuracy: 1, "List paragraphs share a reading edge")
                let card = app.otherElements["settings-preview-list-card"]
                XCTAssertTrue(card.exists, "The entire list belongs inside one shared card")
                XCTAssertEqual(app.otherElements.matching(identifier: "settings-preview-list-card").count, 1)
                XCTAssertGreaterThanOrEqual(first.frame.minX - card.frame.minX, 12)
                let last = app.staticTexts["settings-preview-translation-1"]
                XCTAssertGreaterThanOrEqual(card.frame.maxY - last.frame.maxY, 12)
                app.buttons["버블로 보기"].tap()
                XCTAssertTrue(app.buttons["리스트로 보기"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
            }
            app.navigationBars[editor].buttons["BackButton"].tap()
        }
    }

    @MainActor func testExperiencePrecedesStreakWithMatchingVerticalAlignment() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let experience = app.buttons["header-xp"]
        XCTAssertTrue(experience.wait(for: \.isHittable, toEqual: true, timeout: 20))
        let streak = app.descendants(matching: .any).matching(NSPredicate(format: "label == %@", "연속 학습 0일")).firstMatch
        XCTAssertTrue(streak.exists)
        XCTAssertLessThan(experience.frame.maxX, streak.frame.minX, "XP belongs to the left of the streak")
        XCTAssertEqual(experience.frame.midY, streak.frame.midY, accuracy: 1)
        // The button includes its tap target; the streak's accessibility bounds hug its visible content.
        XCTAssertGreaterThanOrEqual(streak.frame.minY, experience.frame.minY)
        XCTAssertLessThanOrEqual(streak.frame.maxY, experience.frame.maxY)
    }

    @MainActor func testExperiencePopoverShowsCurrentLevelWithoutChangingProgress() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let experience = app.buttons["header-xp"]
        XCTAssertTrue(experience.wait(for: \.isHittable, toEqual: true, timeout: 20))
        XCTAssertEqual(experience.label, "0 / 100 XP")
        XCTAssertFalse(app.staticTexts["0 / 100 XP"].exists, "The header displays a bar, not XP numbers")
        let anchor = experience.frame
        experience.tap()
        let details = app.staticTexts["header-xp-details"]
        XCTAssertTrue(details.wait(for: \.isHittable, toEqual: true, timeout: 5))
        XCTAssertEqual(details.label, "0 / 100 XP")
        XCTAssertGreaterThan(app.staticTexts["header-xp-level"].frame.minY, anchor.maxY,
                             "The popover content opens below the XP control")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.8)).tap()
        XCTAssertTrue(details.waitForNonExistence(timeout: 5))
        XCTAssertEqual(experience.label, "0 / 100 XP", "Inspecting XP must not award progress")
    }

    @MainActor func testRevealPresetsSnapAndCascadeAcrossRelaunch() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        func openEditor() {
            XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 20))
            app.tabBars.buttons["설정"].tap()
            app.buttons["학습 설정"].tap()
            app.buttons["크레이지 스피킹"].tap()
            XCTAssertTrue(app.textFields["reveal-wpm-1"].waitForExistence(timeout: 5))
        }
        openEditor()
        let first = app.textFields["reveal-wpm-1"]
        first.coordinate(withNormalizedOffset: CGVector(dx: 0.05, dy: 0.5)).tap()
        first.replaceNumericText(with: "999")
        XCTAssertEqual(first.value as? String, "999")
        app.buttons["완료"].tap()
        for (index, expected) in ["200", "250", "300", "350"].enumerated() {
            XCTAssertEqual(app.textFields["reveal-wpm-\(index + 1)"].value as? String, expected)
        }
        app.terminate(); app.launch()
        openEditor()
        for (index, expected) in ["200", "250", "300", "350"].enumerated() {
            XCTAssertEqual(app.textFields["reveal-wpm-\(index + 1)"].value as? String, expected)
        }
    }

    @MainActor func testStagePathAndGuideUseCanonicalMethodNames() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        guard book.wait(for: \.isHittable, toEqual: true, timeout: 20) else {
            XCTFail("Book unavailable"); return
        }
        book.tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        let names = ["자막 쉐도잉", "자막 쉐도잉", "무자막 쉐도잉", "다구간 쉐도잉",
                     "다구간 무자막", "속사포 영한", "속사포 한영", "속사포 한글"]
        for stage in 1...16 {
            XCTAssertEqual(app.buttons["stage-\(stage)"].label, "스테이지 \(stage), \(names[(stage - 1) / 2])")
            XCTAssertEqual(app.buttons["stage-\(stage)"].value as? String, "완료 0/3")
        }
        let stage = app.buttons["stage-3"]
        for _ in 0..<5 where !stage.isHittable { app.swipeUp() }
        stage.tap()
        let guide = app.buttons["Lv 2"]
        XCTAssertTrue(guide.waitForExistence(timeout: 10))
        guide.tap()
        XCTAssertTrue(app.staticTexts["자막 쉐도잉"].waitForExistence(timeout: 5))
    }

    @MainActor func testBundledCoverRendersBlueArtwork() throws {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let action = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(action.wait(for: \.isHittable, toEqual: true, timeout: 20))
        let title = app.staticTexts["Morning Notes"]
        let screenshot = try XCTUnwrap(app.screenshot().image.cgImage)
        let scale = CGFloat(screenshot.width) / app.frame.width
        let region = CGRect(x: action.frame.midX - 20, y: title.frame.minY - 50, width: 40, height: 20)
        let crop = try XCTUnwrap(screenshot.cropping(to: CGRect(x: region.minX * scale, y: region.minY * scale,
                                                               width: region.width * scale, height: region.height * scale)))
        var pixels = [UInt8](repeating: 0, count: 8 * 4 * 4)
        let bluePixels = try pixels.withUnsafeMutableBytes { bytes in
            let context = try XCTUnwrap(CGContext(data: bytes.baseAddress, width: 8, height: 4,
                bitsPerComponent: 8, bytesPerRow: 32, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(crop, in: CGRect(x: 0, y: 0, width: 8, height: 4))
            return stride(from: 0, to: bytes.count, by: 4).filter { Int(bytes[$0 + 2]) > Int(bytes[$0]) + 20 }.count
        }
        XCTAssertGreaterThan(bluePixels, 4, "The supplied blue illustration must render, not an empty card.")
    }

    @MainActor func testFontSettingsPersistAcrossRelaunch() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 10))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        let typography = app.buttons["폰트 설정"]
        XCTAssertTrue(typography.waitForExistence(timeout: 5))
        guard typography.exists else { return }
        typography.tap()
        let stepper = app.steppers["original-size-stepper"]
        XCTAssertTrue(stepper.waitForExistence(timeout: 5))
        stepper.buttons.element(boundBy: 1).tap() // Increment follows decrement.
        XCTAssertEqual(app.textFields["original-size"].value as? String, "21")
        XCTAssertTrue(stepper.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 15))
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 10))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["폰트 설정"].tap()
        XCTAssertTrue(app.textFields["original-size"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.textFields["original-size"].value as? String, "21")
    }

    @MainActor func testRateEditorShowsOnlyLiveValueAndPersistsPreference() {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 20))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["배속"].tap()
        let slider = app.sliders["재생 속도"]
        XCTAssertTrue(slider.waitForExistence(timeout: 5))
        XCTAssertEqual(app.staticTexts.matching(NSPredicate(format: "label == %@", "배속")).count, 1,
                       "Keep the page title without a duplicate section heading")
        XCTAssertTrue(app.staticTexts["1×"].exists)
        for label in ["0.25×", "2×", "3×"] { XCTAssertFalse(app.staticTexts[label].exists, label) }
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = "Playback rate markers"
        screenshot.lifetime = .keepAlways
        add(screenshot)
        slider.adjust(toNormalizedSliderPosition: 0)
        XCTAssertTrue(app.staticTexts["0.25×"].waitForExistence(timeout: 5))
        XCTAssertTrue(slider.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        app.terminate(); app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 20))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["배속"].tap()
        XCTAssertTrue(app.sliders["재생 속도"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["0.25×"].exists)
        XCTAssertFalse(app.staticTexts["1×"].exists)
    }

    @MainActor func testBooksStagesSettingsAndEmptyLanguage() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15))
        guard book.exists else { return }
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        book.tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.tabBars.buttons["스테이지"].isSelected,
                      "Choosing a book opens its stages in the Stages tab")
        XCTAssertTrue(app.buttons["header-xp"].exists)
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
        app.tabBars.buttons["책장"].tap()
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 5),
                      "Books returns directly to the library, without a pushed stage screen")
        XCTAssertFalse(app.buttons["stage-1"].exists)
        app.tabBars.buttons["스테이지"].tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        app.tabBars.buttons["설정"].tap()
        XCTAssertTrue(app.buttons["학습 설정"].waitForExistence(timeout: 5))
        // Learning status belongs to the browsing screens' toolbars, not Settings.
        XCTAssertFalse(app.buttons["language-menu"].exists)
        XCTAssertFalse(app.buttons["header-xp"].exists)
        app.tabBars.buttons["스테이지"].tap()
        let englishButton = app.buttons["language-menu"].frame
        XCTAssertEqual(englishButton.width, englishButton.height, accuracy: 1)
        XCTAssertGreaterThanOrEqual(englishButton.width, 44)
        app.buttons["language-menu"].tap()
        XCTAssertTrue(app.buttons["🇬🇧  영어"].wait(for: \.isSelected, toEqual: true, timeout: 5))
        app.buttons["🇯🇵  일본어"].tap()
        XCTAssertTrue(app.buttons["language-menu"].wait(for: \.label, toEqual: "학습 언어, 일본어", timeout: 5))
        let japaneseButton = app.buttons["language-menu"].frame
        XCTAssertEqual(japaneseButton.width, japaneseButton.height, accuracy: 1)
        XCTAssertEqual(japaneseButton.width, englishButton.width, accuracy: 1)
        app.tabBars.buttons["책장"].tap()
        XCTAssertTrue(app.staticTexts["이 언어의 도서가 아직 없어요"].waitForExistence(timeout: 5))
        app.tabBars.buttons["스테이지"].tap()
        XCTAssertTrue(app.staticTexts["도서를 선택해 주세요"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["이 언어의 도서가 아직 없어요"].waitForExistence(timeout: 15))
    }
}
