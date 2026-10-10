import XCTest

extension XCUIElement {
    /// Presence alone does not establish hittability, settled layout, or saved state.
    @MainActor func existsOrWait(timeout: TimeInterval) -> Bool {
        exists || waitForExistence(timeout: timeout)
    }

    /// Navigation readiness only; this does not establish saved state or settled layout.
    @MainActor func hittableOrWait(timeout: TimeInterval) -> Bool {
        (exists && isHittable) || wait(for: \.isHittable, toEqual: true, timeout: timeout)
    }
}

extension XCUIApplication {
    /// Rotation can expose a new toolbar before XCTest has rotated its touch coordinates.
    /// Check geometry first; callers must still verify hittability and the resulting screen.
    @MainActor func videoLayoutOrWait(fullscreen: Bool, control: XCUIElement, timeout: TimeInterval) -> Bool {
        let ready = NSPredicate { _, _ in
            guard control.exists else { return false }
            let screen = self.frame
            let window = self.windows.firstMatch.frame
            let target = control.frame
            return (fullscreen ? screen.width > screen.height : screen.height > screen.width)
                && window.size == screen.size
                && target.width >= 44 && target.height >= 44
                && screen.contains(target) && window.contains(target)
        }
        return XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: ready, object: nil)], timeout: timeout) == .completed
    }
}
