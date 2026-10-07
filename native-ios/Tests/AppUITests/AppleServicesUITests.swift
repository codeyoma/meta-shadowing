import XCTest

final class AppleServicesUITests: XCTestCase {
    @MainActor func testSyncToggleRequiresConsentAndCanTurnOffAfterTransportFailure() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-cloud-confirmation", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.tabBars.buttons["설정"].wait(for: \.isHittable, toEqual: true, timeout: 20))
        app.tabBars.buttons["설정"].tap()
        app.buttons["iCloud 동기화"].tap()
        let sync = app.switches["icloud-sync-toggle"]
        XCTAssertTrue(sync.wait(for: \.isHittable, toEqual: true, timeout: 5))
        XCTAssertEqual(sync.value as? String, "0")
        XCTAssertFalse(app.buttons["한 번만 동기화"].exists)
        XCTAssertTrue(sync.isEnabled, app.debugDescription)
        // SwiftUI exposes the Form row and the native thumb as separate switch elements.
        let thumb = sync.switches.firstMatch
        XCTAssertTrue(thumb.isHittable)
        thumb.tap()
        XCTAssertTrue(app.buttons["복원하고 동기화 켜기"].wait(for: \.isHittable, toEqual: true, timeout: 5), app.debugDescription)
        XCTAssertTrue(app.buttons["합치고 동기화 켜기"].exists)
        // iOS presents this as an anchored dialog; tapping outside cancels it.
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.7)).tap()
        XCTAssertTrue(app.buttons["복원하고 동기화 켜기"].waitForNonExistence(timeout: 5))
        XCTAssertEqual(sync.value as? String, "0", "Cancelling never grants sync consent")
        thumb.tap()
        XCTAssertTrue(app.buttons["복원하고 동기화 켜기"].wait(for: \.isHittable, toEqual: true, timeout: 5))
        app.buttons["복원하고 동기화 켜기"].tap()
        // The isolated transport intentionally fails; consent can remain on for retry.
        XCTAssertTrue(app.buttons["다시 시도"].waitForExistence(timeout: 10))
        // Account activation replaces the browsing root to isolate the old profile's UI.
        XCTAssertTrue(app.tabBars.buttons["설정"].wait(for: \.isHittable, toEqual: true, timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["iCloud 동기화"].tap()
        XCTAssertTrue(sync.waitForExistence(timeout: 5))
        XCTAssertEqual(sync.value as? String, "1")
        XCTAssertTrue(sync.wait(for: \.isEnabled, toEqual: true, timeout: 5))
        thumb.tap()
        let off = app.switches.matching(NSPredicate(format: "identifier == %@ AND value == %@", "icloud-sync-toggle", "0")).firstMatch
        XCTAssertTrue(off.waitForExistence(timeout: 5))
        XCTAssertFalse(app.buttons["다시 시도"].exists, "Disabling sync clears the inactive retry UI")
    }

    @MainActor func testFreeDownloadsAndSettingsHaveNoCommerceControls() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 20))
        let download = app.buttons["download-hosted-morning-notes-v1"]
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 10))
        XCTAssertFalse(app.buttons["구매 확인"].exists)
        download.tap()
        XCTAssertTrue(app.buttons["book-hosted-morning-notes-v1"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
        app.tabBars.buttons["설정"].tap()
        XCTAssertTrue(app.buttons["iCloud 동기화"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["데이터 관리"].exists)
        XCTAssertFalse(app.buttons["구매 복원"].exists)
        XCTAssertFalse(app.buttons["restore-purchases"].exists)
        app.buttons["데이터 관리"].tap()
        let downloadHelp = app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "다운로드 삭제는")).firstMatch
        XCTAssertTrue(app.buttons["remove-local-history"].waitForExistence(timeout: 5))
        XCTAssertFalse(downloadHelp.exists, "Routine explanations do not belong on the action-only screen")
        XCTAssertFalse(app.staticTexts["현재 학습 프로필"].exists)
        XCTAssertFalse(app.staticTexts.matching(NSPredicate(format: "label CONTAINS %@", "구매")).firstMatch.exists,
                       "The free app must not imply retained purchase records")
        XCTAssertTrue(app.buttons["remove-local-history"].exists)
        XCTAssertTrue(app.buttons["delete-cloud-history"].exists)
    }
    @MainActor func testServiceConfirmationsInLightAndDarkAtLargestText() {
        continueAfterFailure = false
        let original = XCUIDevice.shared.appearance
        defer { XCUIDevice.shared.appearance = original }
        for appearance in [XCUIDevice.Appearance.light, .dark] {
            XCUIDevice.shared.appearance = appearance
            let app = XCUIApplication()
            app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-cloud-confirmation", "--ui-test-probe-id", UUID().uuidString,
                "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
            app.launch()
            XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 20))
            XCTAssertTrue(app.tabBars.buttons["설정"].wait(for: \.isHittable, toEqual: true, timeout: 10))
            app.tabBars.buttons["설정"].tap()
            app.buttons["데이터 관리"].tap()
            let local = app.buttons["remove-local-history"]
            XCTAssertTrue(local.wait(for: \.isHittable, toEqual: true, timeout: 5))
            XCTAssertGreaterThanOrEqual(local.frame.height, 44)
            local.tap()
            XCTAssertTrue(app.alerts.buttons["취소"].wait(for: \.isHittable, toEqual: true, timeout: 5))
            let localShot = XCTAttachment(screenshot: app.screenshot())
            localShot.name = "local-confirmation-\(appearance.rawValue)-largest-text"
            localShot.lifetime = .keepAlways; add(localShot)
            app.alerts.buttons["취소"].tap()
            XCTAssertTrue(app.alerts.firstMatch.wait(for: \.exists, toEqual: false, timeout: 5))
            let cloud = app.buttons["delete-cloud-history"]
            XCTAssertTrue(cloud.wait(for: \.isEnabled, toEqual: true, timeout: 5))
            // SwiftUI can report offscreen Form rows as hittable behind the fixed header.
            // Scroll in small steps until the button's center is inside the content viewport.
            let top = app.navigationBars.firstMatch.frame.maxY + 12
            let bottom = app.tabBars.firstMatch.frame.minY - 12
            for _ in 0..<16 {
                let center = cloud.frame.midY
                if cloud.isHittable && center > top && center < bottom { break }
                let origin = app.coordinate(withNormalizedOffset: .zero)
                let start = origin.withOffset(CGVector(dx: app.frame.midX, dy: (top + bottom) / 2))
                let distance = (bottom - top) * 0.3 * (center < top ? 1 : -1)
                start.press(forDuration: 0.05, thenDragTo: start.withOffset(CGVector(dx: 0, dy: distance)))
            }
            XCTAssertTrue(cloud.isHittable)
            XCTAssertGreaterThan(cloud.frame.midY, top)
            XCTAssertLessThan(cloud.frame.midY, bottom)
            cloud.tap()
            let cloudReady = app.alerts.buttons["iCloud 기록 삭제"].wait(for: \.isHittable, toEqual: true, timeout: 5)
            let cloudShot = XCTAttachment(screenshot: app.screenshot())
            cloudShot.name = "cloud-confirmation-\(appearance.rawValue)-largest-text"
            cloudShot.lifetime = .keepAlways; add(cloudShot)
            XCTAssertTrue(cloudReady, app.debugDescription)
            XCTAssertTrue(app.alerts.staticTexts["현재 iCloud 계정의 학습 기록과 이 기기의 해당 프로필 기록을 삭제합니다. 다른 기기도 다음 동기화 때 반영됩니다. 자동 동기화는 꺼집니다."].exists)
            app.alerts.buttons["취소"].tap()
            app.tabBars.buttons["책장"].tap()
            let download = app.buttons["download-hosted-morning-notes-v1"]
            for _ in 0..<8 where !download.isHittable { app.swipeUp() }
            XCTAssertTrue(download.isHittable)
            download.tap()
            let manage = app.buttons["manage-hosted-morning-notes-v1"]
            XCTAssertTrue(app.buttons["book-hosted-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 10))
            XCTAssertTrue(manage.waitForExistence(timeout: 10))
            for _ in 0..<4 where !manage.isHittable { app.swipeUp() }
            XCTAssertTrue(manage.isHittable)
            manage.tap()
            app.buttons["삭제하기"].tap()
            XCTAssertTrue(app.alerts["다운로드를 삭제할까요?"].waitForExistence(timeout: 5))
            XCTAssertTrue(app.alerts.buttons["취소"].isHittable)
            XCTAssertTrue(app.alerts.buttons["다운로드 삭제"].isHittable)
            let downloadShot = XCTAttachment(screenshot: app.screenshot())
            downloadShot.name = "download-confirmation-\(appearance.rawValue)-largest-text"
            downloadShot.lifetime = .keepAlways; add(downloadShot)
            app.alerts.buttons["취소"].tap()
            XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
            app.terminate()
        }
    }
    @MainActor func testDeveloperToolsUseIsolatedFixturesWithoutChangingProductProgress() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 20))
        let settingsReady = app.tabBars.buttons["설정"].wait(for: \.isHittable, toEqual: true, timeout: 10)
        if !settingsReady {
            let screen = XCTAttachment(screenshot: app.screenshot())
            screen.name = "diagnostic-settings-unreachable"
            screen.lifetime = .keepAlways; add(screen)
            let hierarchy = XCTAttachment(string: app.debugDescription)
            hierarchy.name = "diagnostic-settings-hierarchy"
            hierarchy.lifetime = .keepAlways; add(hierarchy)
        }
        XCTAssertTrue(settingsReady)
        app.tabBars.buttons["설정"].tap()
        app.buttons["개발 도구"].tap()
        app.buttons["문장 분석 실험"].tap()
        XCTAssertTrue(app.buttons["analysis-sentence-1:0"].waitForExistence(timeout: 10))
        app.buttons["diagnostic-close"].tap()
        app.buttons["오디오 · 모니터링 실험"].tap()
        XCTAssertTrue(app.buttons["media-main"].waitForExistence(timeout: 10))
        XCTAssertEqual(app.staticTexts["media-xp"].label, "XP: 0")
        app.buttons["diagnostic-close"].tap()
        app.buttons["다운로드 미리보기"].tap()
        let download = app.buttons["download-hosted-morning-notes-v1"]
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 10))
        download.tap()
        let cancel = app.buttons["다운로드 취소"]
        XCTAssertTrue(cancel.wait(for: \.isHittable, toEqual: true, timeout: 5))
        cancel.tap()
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 5))
        app.buttons["저장 확인 오류 보기"].tap()
        let retry = app.buttons["저장 상태 다시 확인"]
        XCTAssertTrue(retry.wait(for: \.isHittable, toEqual: true, timeout: 5))
        retry.tap()
        download.tap()
        XCTAssertTrue(app.buttons["book-hosted-morning-notes-v1"].waitForExistence(timeout: 15))
        app.buttons["편집 상태 보기"].tap()
        app.buttons["미리보기 다운로드 삭제"].tap()
        XCTAssertTrue(download.waitForExistence(timeout: 5))
        app.buttons["diagnostic-close"].tap()
        app.tabBars.buttons["책장"].tap()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
        XCTAssertFalse(app.buttons["book-hosted-morning-notes-v1"].exists)
    }
    @MainActor func testSampleAndDownloadEstimateDoNotGrantXP() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services",
            "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 20))
        XCTAssertEqual(app.staticTexts["book-kind-morning-notes-v1"].label, "샘플")
        XCTAssertEqual(app.staticTexts["book-kind-hosted-morning-notes-v1"].label, "샘플")
        let estimate = app.staticTexts["book-xp-hosted-morning-notes-v1"]
        XCTAssertTrue(estimate.exists)
        XCTAssertTrue(estimate.label.contains("1,728"))
        XCTAssertTrue(estimate.label.contains("추가 사이클 제외"))
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
        XCTAssertFalse(app.buttons["book-hosted-morning-notes-v1"].exists)
        XCTAssertTrue(app.buttons["download-hosted-morning-notes-v1"].exists)
        XCTAssertFalse(app.buttons["구매 확인"].exists)
    }
    @MainActor func testServiceSettingsRemainReachableWithLargestText() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString,
            "-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityXXXL"]
        app.launch()
        // The enlarged card extends below the fold; this journey opens Settings,
        // so bootstrap accessibility readiness does not require tapping its play button.
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].waitForExistence(timeout: 20))
        let settings = app.tabBars.buttons["설정"]
        XCTAssertTrue(settings.wait(for: \.isHittable, toEqual: true, timeout: 10))
        settings.tap()
        XCTAssertFalse(app.buttons["구매 복원"].exists)
        let cloud = app.buttons["iCloud 동기화"]
        XCTAssertTrue(cloud.wait(for: \.isHittable, toEqual: true, timeout: 5))
        cloud.tap()
        let sync = app.switches["icloud-sync-toggle"]
        XCTAssertTrue(sync.waitForExistence(timeout: 5))
        XCTAssertEqual(sync.value as? String, "0")
        XCTAssertFalse(sync.isEnabled, "An unconfigured fixture cannot enable iCloud")
        XCTAssertFalse(app.buttons["한 번만 동기화"].exists)
        XCTAssertFalse(app.buttons["계정 다시 확인"].exists)
    }
    @MainActor func testDownloadAndRemovalUseNormalBookControls() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let download = app.buttons["download-hosted-morning-notes-v1"]
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 20))
        download.tap()
        let book = app.buttons["book-hosted-morning-notes-v1"]
        XCTAssertTrue(book.wait(for: \.isHittable, toEqual: true, timeout: 10))
        app.buttons["manage-hosted-morning-notes-v1"].tap()
        app.buttons["삭제하기"].tap()
        XCTAssertTrue(app.alerts["다운로드를 삭제할까요?"].waitForExistence(timeout: 3))
        app.alerts.buttons["다운로드 삭제"].tap()
        XCTAssertTrue(download.wait(for: \.isHittable, toEqual: true, timeout: 10))
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].exists)
    }
    @MainActor func testLocalResetClearsConfirmedProgressButKeepsDownloadedBookAfterRelaunch() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        let bundled = app.buttons["book-morning-notes-v1"]
        XCTAssertTrue(bundled.wait(for: \.isHittable, toEqual: true, timeout: 20))
        bundled.tap()
        app.buttons["stage-1"].tap()
        let main = app.buttons["player-main"]
        XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 20))
        main.tap()
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: "확인한 반복 1/3", timeout: 5))
        app.exitLearningThroughOptions()
        app.tabBars.buttons["책장"].tap()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "1 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["다구간 학습 사이즈"].tap()
        let grouping = app.segmentedControls.buttons["3구간"]
        XCTAssertTrue(grouping.wait(for: \.isHittable, toEqual: true, timeout: 5))
        grouping.tap()
        XCTAssertTrue(grouping.wait(for: \.isSelected, toEqual: true, timeout: 5))
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        app.navigationBars["학습 설정"].buttons["BackButton"].tap()
        app.tabBars.buttons["책장"].tap()
        app.buttons["download-hosted-morning-notes-v1"].tap()
        let hosted = app.buttons["book-hosted-morning-notes-v1"]
        XCTAssertTrue(hosted.wait(for: \.isHittable, toEqual: true, timeout: 10))

        hosted.tap()
        app.buttons["stage-1"].tap()
        for confirmed in 1...2 {
            XCTAssertTrue(main.wait(for: \.isEnabled, toEqual: true, timeout: 20))
            main.tap()
            XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: "확인한 반복 \(confirmed)/3", timeout: 5))
        }
        app.exitLearningThroughOptions()
        app.tabBars.buttons["책장"].tap()
        app.terminate()
        app.launch()
        XCTAssertTrue(hosted.wait(for: \.isHittable, toEqual: true, timeout: 20))
        XCTAssertEqual(app.buttons["header-xp"].label, "3 / 100 XP")
        XCTAssertFalse(main.exists, "Relaunch must not auto-confirm or reopen a player")
        hosted.tap()
        app.buttons["stage-1"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: "확인한 반복 2/3", timeout: 10))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "3 / 100 XP", timeout: 5))
        app.tabBars.buttons["설정"].tap()
        app.buttons["학습 설정"].tap()
        app.buttons["다구간 학습 사이즈"].tap()
        XCTAssertTrue(grouping.wait(for: \.isSelected, toEqual: true, timeout: 5))
        app.navigationBars["다구간 학습 사이즈"].buttons["BackButton"].tap()
        app.navigationBars["학습 설정"].buttons["BackButton"].tap()
        app.buttons["데이터 관리"].tap()
        app.buttons["remove-local-history"].tap()
        XCTAssertTrue(app.alerts.buttons["이 기기 기록 삭제"].wait(for: \.isHittable, toEqual: true, timeout: 5))
        app.alerts.buttons["이 기기 기록 삭제"].tap()
        app.tabBars.buttons["책장"].tap()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 10))
        XCTAssertTrue(hosted.exists)
        app.terminate()
        app.launch()
        XCTAssertTrue(hosted.waitForExistence(timeout: 20))
        XCTAssertEqual(app.buttons["header-xp"].label, "0 / 100 XP")
        XCTAssertFalse(main.exists, "Reset/relaunch must not reopen a player")
        let settings = app.tabBars.buttons["설정"]
        XCTAssertTrue(settings.wait(for: \.isHittable, toEqual: true, timeout: 10))
        settings.tap()
        app.buttons["iCloud 동기화"].tap()
        XCTAssertTrue(app.switches["icloud-sync-toggle"].waitForExistence(timeout: 5))
        XCTAssertEqual(app.switches["icloud-sync-toggle"].value as? String, "0")
        app.tabBars.buttons["책장"].tap()
        bundled.tap()
        app.buttons["stage-1"].tap()
        XCTAssertTrue(app.descendants(matching: .any)["cycle-timeline"].wait(for: \.label, toEqual: "확인한 반복 0/3", timeout: 10))
        app.exitLearningThroughOptions()
        XCTAssertTrue(app.buttons["header-xp"].wait(for: \.label, toEqual: "0 / 100 XP", timeout: 5))
    }
    @MainActor func testLocalAndCloudDeletionHaveSeparateScopedConfirmations() {
        continueAfterFailure = false
        let app = XCUIApplication()
        app.launchArguments = ["--ui-test-product", "--ui-test-services", "--ui-test-probe-id", UUID().uuidString]
        app.launch()
        XCTAssertTrue(app.buttons["book-morning-notes-v1"].wait(for: \.isHittable, toEqual: true, timeout: 20))
        app.tabBars.buttons["설정"].tap()
        app.buttons["데이터 관리"].tap()
        let local = app.buttons["remove-local-history"]
        XCTAssertTrue(local.waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["delete-cloud-history"].exists)
        XCTAssertFalse(app.buttons["delete-cloud-history"].isEnabled)
        local.tap()
        XCTAssertTrue(app.buttons["이 기기 기록 삭제"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["현재 프로필의 학습 기록만 삭제합니다. 다운로드한 도서와 iCloud 기록은 남고, 자동 동기화는 꺼집니다."].exists)
        app.alerts.buttons["취소"].tap()
        XCTAssertTrue(app.buttons["이 기기 기록 삭제"].waitForNonExistence(timeout: 3))
        XCTAssertTrue(local.isEnabled)
    }
}
