import XCTest
import UIKit

final class ProductUITests: XCTestCase {
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
            XCTAssertEqual(app.buttons["stage-\(stage)"].label,
                           "Stage \(stage), \(names[(stage - 1) / 2]), 완료 0/3")
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
        app.buttons["original-size-plus"].tap()
        XCTAssertEqual(app.textFields["original-size"].value as? String, "21")
        XCTAssertTrue(app.buttons["original-size-plus"].wait(for: \.isEnabled, toEqual: true, timeout: 5))
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
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(book.waitForExistence(timeout: 15))
        guard book.exists else { return }
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        book.tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        // Choosing a book pushes its stages inside Books; tabs never switch on their own.
        XCTAssertTrue(app.tabBars.buttons["도서 목록"].isSelected)
        XCTAssertTrue(app.staticTexts["header-xp"].exists)
        app.tabBars.buttons["스테이지"].tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 5))
        app.tabBars.buttons["설정"].tap()
        XCTAssertTrue(app.buttons["학습 설정"].waitForExistence(timeout: 5))
        // Learning status belongs to the browsing screens' toolbars, not Settings.
        XCTAssertFalse(app.buttons["language-menu"].exists)
        XCTAssertFalse(app.staticTexts["header-xp"].exists)
        app.tabBars.buttons["스테이지"].tap()
        app.buttons["language-menu"].tap()
        XCTAssertTrue(app.buttons["영어"].wait(for: \.isSelected, toEqual: true, timeout: 5))
        app.buttons["일본어"].tap()
        XCTAssertTrue(app.buttons["language-menu"].wait(for: \.label, toEqual: "학습 언어, 일본어", timeout: 5))
        app.tabBars.buttons["도서 목록"].tap()
        XCTAssertTrue(app.staticTexts["이 언어의 도서가 아직 없어요"].waitForExistence(timeout: 5))
        app.tabBars.buttons["스테이지"].tap()
        XCTAssertTrue(app.staticTexts["도서를 선택해 주세요"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["이 언어의 도서가 아직 없어요"].waitForExistence(timeout: 15))
    }
}
