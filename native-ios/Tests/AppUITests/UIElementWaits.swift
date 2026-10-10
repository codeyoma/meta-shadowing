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
