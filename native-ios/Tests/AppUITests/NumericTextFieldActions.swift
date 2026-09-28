import XCTest

extension XCUIElement {
    /// Numeric fields are right-aligned; a center double-tap can land before their text.
    @MainActor func replaceNumericText(with text: String, file: StaticString = #filePath, line: UInt = #line) {
        XCTAssertTrue(wait(for: \.isHittable, toEqual: true, timeout: 5), file: file, line: line)
        guard let current = value as? String else {
            XCTFail("Numeric field must expose its current value", file: file, line: line)
            return
        }
        coordinate(withNormalizedOffset: CGVector(dx: 0.99, dy: 0.5)).tap()
        typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: current.count))
        // An empty SwiftUI field can expose its placeholder as its accessibility value.
        guard let cleared = value as? String, cleared.isEmpty || cleared == placeholderValue else {
            XCTFail("Clear the entire draft before replacing it", file: file, line: line)
            return
        }
        typeText(text)
        XCTAssertEqual(value as? String, text, file: file, line: line)
    }
}
