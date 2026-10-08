import XCTest
import UIKit

final class BookshelfUITests: XCTestCase {
    @MainActor func testInstalledCardOpensStagesAndBundledMenuCannotDelete() {
        continueAfterFailure = false
        let app = launch()
        XCTAssertTrue(app.tabBars.buttons["책장"].waitForExistence(timeout: 20))
        XCTAssertTrue(app.navigationBars["책장"].exists)
        XCTAssertFalse(app.staticTexts["학습하기"].exists)
        let card = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(card.wait(for: \.isHittable, toEqual: true, timeout: 10))
        XCTAssertGreaterThan(card.frame.height, 150, "The whole card is the button")
        let menu = app.buttons["manage-morning-notes-v1"]
        XCTAssertTrue(menu.isHittable)
        XCTAssertGreaterThanOrEqual(menu.frame.width, 44)
        XCTAssertGreaterThanOrEqual(menu.frame.height, 44)
        let kind = app.staticTexts["book-kind-morning-notes-v1"]
        let xp = app.staticTexts["book-xp-morning-notes-v1"]
        XCTAssertTrue(kind.exists)
        XCTAssertTrue(xp.exists)
        XCTAssertEqual(kind.frame.minX, xp.frame.minX, accuracy: 1,
                       "Book type and XP badges must share their leading edge")
        XCTAssertLessThan(menu.frame.maxY, card.frame.minY + 55)
        XCTAssertEqual(menu.frame.maxX, card.frame.maxX - 4, accuracy: 2)
        menu.tap()
        XCTAssertTrue(app.buttons["삭제하기"].waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["삭제하기"].isEnabled)
        XCTAssertFalse(app.buttons["stage-1"].exists, "Menu taps must not activate the card")
        app.navigationBars["책장"].tap()
        card.tap()
        XCTAssertTrue(app.tabBars.buttons["스테이지"].wait(for: \.isSelected, toEqual: true, timeout: 5))
        XCTAssertTrue(app.buttons["stage-1"].exists)
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
    }

    @MainActor func testGrayCardCancelsAndRetriesWithInlineDownloadProgress() throws {
        continueAfterFailure = false
        let app = launch(extra: ["--ui-test-services", "--ui-test-services-slow"])
        let key = "hosted-morning-notes-v1"
        let download = app.buttons["download-\(key)"]
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 20))
        XCTAssertGreaterThan(download.frame.height, 150, "The download action occupies the whole card")
        let gray = try coverColorfulness(download)
        let bundled = try coverColorfulness(app.buttons["book-morning-notes-v1"])
        XCTAssertLessThan(gray, bundled * 0.4, "Undownloaded covers are visibly desaturated")
        XCTAssertFalse(app.staticTexts["다운로드"].exists, "No separate labeled download button")
        download.tap()
        let progress = app.progressIndicators["download-progress-\(key)"]
        XCTAssertTrue(progress.waitForExistence(timeout: 5))
        XCTAssertFalse(app.progressIndicators["stage-progress-\(key)"].exists)
        XCTAssertFalse(download.isEnabled)
        let menu = app.buttons["manage-\(key)"]
        XCTAssertTrue(menu.isEnabled)
        menu.tap()
        app.buttons["다운로드 취소"].tap()
        XCTAssertTrue(download.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        XCTAssertFalse(progress.exists)
        download.tap()
        let installed = app.buttons["book-\(key)"]
        XCTAssertTrue(installed.wait(for: \.isHittable, toEqual: true, timeout: 20))
        XCTAssertFalse(progress.exists)
        XCTAssertTrue(app.progressIndicators["stage-progress-\(key)"].exists)
        XCTAssertGreaterThan(try coverColorfulness(installed), gray * 2)
        XCTAssertTrue(app.tabBars.buttons["책장"].isSelected, "Download completion does not auto-enter learning")
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
    }

    @MainActor private func launch(extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString] + extra
        app.launch()
        return app
    }

    @MainActor private func coverColorfulness(_ card: XCUIElement) throws -> Double {
        let image = try XCTUnwrap(card.screenshot().image.cgImage)
        let width = image.width, height = image.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        try pixels.withUnsafeMutableBytes { data in
            let context = try XCTUnwrap(CGContext(data: data.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        // Lower half of the 3:2 cover excludes its management control and badges.
        guard width / 3 < min(width * 3 / 5, height) else {
            XCTFail("The card screenshot must include its artwork")
            return 0
        }
        var total = 0, count = 0
        for y in (width / 3)..<min(width * 3 / 5, height) {
            for x in (width / 5)..<(width * 4 / 5) {
                let i = (y * width + x) * 4
                let r = Int(pixels[i]), g = Int(pixels[i + 1]), b = Int(pixels[i + 2])
                total += max(r, g, b) - min(r, g, b); count += 1
            }
        }
        return Double(total) / Double(max(1, count))
    }
}
