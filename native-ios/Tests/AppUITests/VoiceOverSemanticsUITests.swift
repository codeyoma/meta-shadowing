import XCTest

/// VoiceOver semantics that CI can verify without a human listener. The gate runs
/// Apple's VoiceOver-related audits (element descriptions, traits and element
/// detection) on every principal screen and checks the labels, values and order
/// VoiceOver announces. Visual audits are attached for review but do not gate.
/// Spoken output itself is not captured.
final class VoiceOverSemanticsUITests: XCTestCase {
    private static let voiceOverAudits: XCUIAccessibilityAuditType = [.sufficientElementDescription, .trait, .elementDetection]
    private static let visualAudits: XCUIAccessibilityAuditType = [.contrast, .hitRegion, .dynamicType, .textClipped]
    /// Collected so one run reports every screen's issues, not only the first.
    private var voiceOverFindings: [String] = []
    private var visualFindings: [String] = []

    override func setUp() {
        continueAfterFailure = false
    }

    @MainActor private func launch(largestText: Bool = false) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        if largestText {
            app.launchArguments += ["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        }
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 20))
        return app
    }

    /// Visits each principal screen and audits it.
    @MainActor private func auditPrincipalScreens(_ app: XCUIApplication, _ label: String) throws {
        try audit(app, "\(label) library")
        app.buttons["book-morning-notes-v1"].tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 10))
        try audit(app, "\(label) stages")
        app.buttons["stage-1"].tap()
        XCTAssertTrue(app.buttons["player-main"].wait(for: \.isEnabled, toEqual: true, timeout: 20))
        try audit(app, "\(label) player")
        app.buttons["player-options"].tap()
        XCTAssertTrue(app.buttons["options-close"].waitForExistence(timeout: 5))
        try audit(app, "\(label) options")
        app.buttons["배속"].tap()
        XCTAssertTrue(app.sliders["재생 속도"].waitForExistence(timeout: 5))
        try audit(app, "\(label) rate editor")
        app.buttons["options-close"].tap()
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].waitForExistence(timeout: 10))
        app.tabBars.buttons["설정"].tap()
        XCTAssertTrue(app.buttons["학습 설정"].waitForExistence(timeout: 5))
        try audit(app, "\(label) settings")
        app.buttons["학습 설정"].tap()
        app.buttons["폰트 설정"].tap()
        XCTAssertTrue(app.textFields["original-size"].waitForExistence(timeout: 5))
        try audit(app, "\(label) typography")
    }

    @MainActor private func audit(_ app: XCUIApplication, _ screen: String) throws {
        try app.performAccessibilityAudit(for: Self.voiceOverAudits.union(Self.visualAudits)) { [self] issue in
            let element = issue.element.map { "\($0.elementType.rawValue) '\($0.identifier)' '\($0.label)'" } ?? "no element"
            let finding = "\(screen): \(issue.auditType.rawValue) – \(issue.compactDescription) – \(element)"
            if Self.voiceOverAudits.contains(issue.auditType) { voiceOverFindings.append(finding) }
            else { visualFindings.append(finding) }
            return true
        }
    }

    @MainActor private func report() {
        let visual = XCTAttachment(string: visualFindings.joined(separator: "\n"))
        visual.name = "Visual accessibility audit (not gating)"
        visual.lifetime = .keepAlways
        add(visual)
        XCTAssertTrue(voiceOverFindings.isEmpty, voiceOverFindings.joined(separator: " ¦ "))
    }

    @MainActor func testPrincipalScreensPassVoiceOverAuditsInLightAndDark() throws {
        defer { XCUIDevice.shared.appearance = .light }
        for appearance in [XCUIDevice.Appearance.light, .dark] {
            XCUIDevice.shared.appearance = appearance
            let app = launch()
            try auditPrincipalScreens(app, appearance == .dark ? "dark" : "light")
            app.terminate()
        }
        report()
    }

    @MainActor func testPrincipalScreensPassVoiceOverAuditsAtLargestText() throws {
        let app = launch(largestText: true)
        try auditPrincipalScreens(app, "largest text")
        report()
    }

    /// The names, values and order VoiceOver reads on the browsing and learning screens.
    @MainActor func testVoiceOverLabelsValuesAndOrder() throws {
        let app = launch()
        XCTAssertEqual(app.buttons["language-menu"].label, "학습 언어, 영어")
        XCTAssertTrue(app.otherElements["연속 학습 0일"].exists || app.staticTexts["연속 학습 0일"].exists,
                      "Streak must read as one element with its unit")
        let book = app.buttons["book-morning-notes-v1"]
        XCTAssertEqual(book.label, "Morning Notes 학습하기")
        XCTAssertEqual(book.value as? String, "완료한 스테이지 0/16")

        book.tap()
        XCTAssertTrue(app.buttons["stage-1"].waitForExistence(timeout: 10))
        let rows = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'stage-'"))
        XCTAssertEqual((0..<rows.count).map { rows.element(boundBy: $0).identifier },
                       (1...16).map { "stage-\($0)" }, "Stages must be read in order")
        XCTAssertEqual(app.buttons["stage-1"].label, "스테이지 1, 자막 쉐도잉")
        XCTAssertEqual(app.buttons["stage-1"].value as? String, "완료 0/3")
        XCTAssertEqual(app.buttons["stage-11"].label, "스테이지 11, 속사포 영한")

        app.buttons["stage-1"].tap()
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 20))
        XCTAssertEqual(main.label, "학습 확인")
        XCTAssertEqual(app.buttons["player-options"].label, "학습 옵션")
        XCTAssertFalse(app.buttons["player-exit"].label.isEmpty, "Close must have a spoken name")
        XCTAssertTrue(app.buttons["학습 속도"].exists)
        XCTAssertTrue(app.buttons["문장 분석"].exists)
        XCTAssertEqual(app.descendants(matching: .any)["cycle-timeline"].label, "확인한 반복 0/3")
        app.buttons["학습 속도"].tap()
        let rate = app.sliders["재생 속도"]
        XCTAssertTrue(rate.waitForExistence(timeout: 5))
        XCTAssertEqual(rate.value as? String, "1배속")
        app.buttons["options-close"].tap()
        app.buttons["player-exit"].tap()
        XCTAssertTrue(app.staticTexts["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
}
