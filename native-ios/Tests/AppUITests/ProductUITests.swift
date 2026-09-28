import XCTest
import UIKit

final class ProductUITests: XCTestCase {
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
        app.tabBars.buttons["설정"].tap()
        XCTAssertTrue(app.buttons["학습 설정"].waitForExistence(timeout: 5))
        app.buttons["language-menu"].tap()
        app.buttons["일본어"].tap()
        app.tabBars.buttons["도서 목록"].tap()
        XCTAssertTrue(app.staticTexts["이 언어의 도서가 아직 없어요"].waitForExistence(timeout: 5))
        app.tabBars.buttons["스테이지"].tap()
        XCTAssertTrue(app.staticTexts["도서를 선택해 주세요"].waitForExistence(timeout: 5))
        app.terminate()
        app.launch()
        XCTAssertTrue(app.staticTexts["이 언어의 도서가 아직 없어요"].waitForExistence(timeout: 15))
    }
}
