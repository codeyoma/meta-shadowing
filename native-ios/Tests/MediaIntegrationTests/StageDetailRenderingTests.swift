import AppFoundation
import Observation
import SwiftUI
import UIKit
import XCTest
@testable import MetaShadowingNative

@MainActor final class StageDetailRenderingTests: XCTestCase {
    private func summary(title: String = "Morning Notes") -> BookStudySummary {
        BookStudySummary(book: CatalogBook(id: "morning-notes-v1", book: "morning-notes", language: "english", title: title, sentenceCount: 12),
            completedRuns: [1: 3], checkpoints: [:], available: true, studyMilliseconds: 9_360_000, plannedUnitCounts: [2: 12])
    }
    func testStatisticsStayWithinSmallWidthAndGrowAtLargestText() {
        for width in [288.0, 358.0, 398.0] {
            let normal = UIHostingController(rootView: StageStatisticsView(summary: summary(), percentage: 6))
            let large = UIHostingController(rootView: StageStatisticsView(summary: summary(), percentage: 6).dynamicTypeSize(.accessibility5))
            let a = normal.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
            let b = large.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
            XCTAssertEqual(a.width, width, accuracy: 0.5)
            XCTAssertEqual(b.width, width, accuracy: 0.5)
            XCTAssertGreaterThanOrEqual(a.height, 70)
            XCTAssertGreaterThan(b.height, a.height)
        }
    }
    func testOverlappingHeaderReservesLongTitleAndAccessibilityHeight() {
        let longTitle = "Morning Notes · A long book title that wraps naturally · 긴 제목도 끝까지 읽을 수 있어요"
        for width in [288.0, 358.0, 398.0] {
            let proposal = CGSize(width: width, height: .greatestFiniteMagnitude)
            let short = UIHostingController(rootView: StageDetailHeader(summary: summary()))
            let long = UIHostingController(rootView: StageDetailHeader(summary: summary(title: longTitle)))
            let large = UIHostingController(rootView: StageDetailHeader(summary: summary(title: longTitle))
                .dynamicTypeSize(.accessibility5))
            let shortSize = short.sizeThatFits(in: proposal)
            let longSize = long.sizeThatFits(in: proposal)
            let largeSize = large.sizeThatFits(in: proposal)
            for size in [shortSize, longSize, largeSize] {
                XCTAssertEqual(size.width, width, accuracy: 0.5)
                XCTAssertTrue(size.height.isFinite)
            }
            XCTAssertGreaterThan(longSize.height, shortSize.height + 40,
                                 "Wrapped title lines must reserve space before statistics")
            XCTAssertGreaterThan(largeSize.height, longSize.height + 40,
                                 "Accessibility text must grow the header, not be clipped in an overlay")
        }
    }
    func testDisclosureDoesNotLaunchOrHaptic() {
        var launches = 0, disclosures = 0
        let row = StagePracticeRow(stage: 1, summary: summary(), prominent: true, expanded: false, reduceMotion: false,
                                  open: { launches += 1 }, toggle: { disclosures += 1 })
        row.disclose()
        XCTAssertEqual(disclosures, 1)
        XCTAssertEqual(launches, 0)
    }
    func testAccordionMotionRetargetsAndHonorsReducedMotion() async throws {
        for reduced in [false, true] {
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(x: 0, y: 0, width: 320, height: 600)
            window.windowLevel = .alert
            window.overrideUserInterfaceStyle = .light
            let state = AccordionRenderState()
            let fixture = AccordionRenderFixture(state: state, summary: summary(), reduceMotion: reduced)
            let host = UIHostingController(rootView: fixture
                .dynamicTypeSize(.large).ignoresSafeArea())
            window.rootViewController = host; window.isHidden = false
            defer { window.isHidden = true; window.rootViewController = nil }
            host.view.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(80))
            let closed = try accordionMarkerY(host.view)
            fixture.row.disclose()
            try await Task.sleep(for: .milliseconds(40))
            let opening = try accordionMarkerY(host.view)
            let openingImage = accordionImage(host.view)
            var openingFrames = [(height: opening, image: openingImage)]
            // Sample several display frames: a cold hosting view can miss the first render tick.
            for _ in 0..<5 {
                try await Task.sleep(for: .milliseconds(16))
                let image = accordionImage(host.view)
                openingFrames.append((try accordionMarkerY(image), image))
            }
            try await Task.sleep(for: .milliseconds(240))
            let opened = try accordionMarkerY(host.view)
            XCTAssertGreaterThan(opened, closed + 100, "The real guidance must expand before measuring motion")
            if reduced {
                XCTAssertEqual(openingFrames.last?.height, opened, "Reduce Motion reaches the expanded layout")
                XCTAssertTrue(openingFrames.allSatisfy { $0.height == closed || $0.height == opened },
                    "Reduce Motion changes height without travel")
                let settled = try backgroundPixel(accordionImage(host.view), x: 2, y: 90)
                let fadingFrames = try openingFrames.filter { frame in
                    guard frame.height == opened else { return false }
                    return Int(try backgroundPixel(frame.image, x: 2, y: 90)[0]) > Int(settled[0]) + 1
                }
                XCTAssertFalse(fadingFrames.isEmpty,
                    "Reduce Motion retains the guidance fade instead of instantly replacing its surface")
            } else {
                XCTAssertTrue(openingFrames.contains { $0.height > closed + 2 && $0.height < opened - 2 },
                    "Expansion passes through intermediate visible heights, not an instant jump")
            }
            fixture.row.disclose()
            try await Task.sleep(for: .milliseconds(40))
            let closing = try accordionMarkerY(host.view)
            if reduced {
                XCTAssertEqual(closing, closed, accuracy: 1, "Reduce Motion also avoids collapse travel")
            } else {
                XCTAssertGreaterThan(closing, closed + 2, "Collapse passes through an intermediate visible height")
                XCTAssertLessThan(closing, opened - 2, "Collapse begins immediately")
                fixture.row.disclose()
                try await Task.sleep(for: .milliseconds(240))
                XCTAssertEqual(try accordionMarkerY(host.view), opened, accuracy: 1,
                    "Reversing during collapse settles at the expanded height")
                fixture.row.disclose()
            }
            try await Task.sleep(for: .milliseconds(240))
            XCTAssertEqual(try accordionMarkerY(host.view), closed, accuracy: 1,
                "Collapse releases its layout space")
        }
    }
    private func accordionMarkerY(_ view: UIView) throws -> Int {
        try accordionMarkerY(accordionImage(view))
    }
    private func accordionMarkerY(_ image: UIImage) throws -> Int {
        for y in 0..<Int(image.size.height) {
            let pixel = try backgroundPixel(image, x: 2, y: y)
            if pixel[0] > 200 && pixel[1] < 100 && pixel[2] < 100 { return y }
        }
        XCTFail("Missing layout marker below the real accordion")
        return -1
    }
    private func accordionImage(_ view: UIView) -> UIImage {
        let format = UIGraphicsImageRendererFormat(); format.scale = 1
        return UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: false)
        }
    }
    func testRowsStayRaisedAndGuidanceMatchesUnselectedFamilySurface() async throws {
        for dark in [false, true] {
            for expanded in [false, true] {
                let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
                let window = UIWindow(windowScene: scene)
                window.frame = CGRect(x: 0, y: 0, width: 320, height: 600)
                window.windowLevel = .alert
                window.overrideUserInterfaceStyle = dark ? .dark : .light
                let host = UIHostingController(rootView: VStack(spacing: 0) {
                    StageFamilyView(family: .shadowing, completed: 0,
                        selection: .constant(StageDetailSelection(continuationStage: 1))).frame(height: 140)
                    StagePracticeRow(stage: 1, summary: summary(), prominent: true,
                        expanded: expanded, reduceMotion: false, open: {}, toggle: {})
                        .frame(maxHeight: .infinity, alignment: .top)
                }.dynamicTypeSize(.large)
                    .background(Color(uiColor: .systemGroupedBackground)).ignoresSafeArea())
                window.rootViewController = host; window.isHidden = false
                defer { window.isHidden = true; window.rootViewController = nil }
                host.view.layoutIfNeeded()
                try await Task.sleep(for: .milliseconds(60))
                let format = UIGraphicsImageRendererFormat(); format.scale = 1
                let image = UIGraphicsImageRenderer(bounds: host.view.bounds, format: format).image { _ in
                    host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
                }
                let row = try backgroundPixel(image, x: 2, y: 142)
                if !dark {
                    XCTAssertTrue(row.allSatisfy { $0 >= 250 }, "Every light-mode row stays white, expanded=\(expanded)")
                }
                if expanded {
                    let selector = try XCTUnwrap(familySelector(in: host.view))
                    let bounds = selector.convert(selector.bounds, to: host.view)
                    let unselected = try backgroundPixel(image, x: Int(bounds.midX), y: Int(bounds.minY + 5))
                    for x in [2, 317] {
                        let guide = try backgroundPixel(image, x: x, y: 230)
                        for (guideChannel, selectorChannel) in zip(guide, unselected) {
                            XCTAssertEqual(Int(guideChannel), Int(selectorChannel), accuracy: 3,
                                "Full-width guidance matches the unselected selector surface, dark=\(dark)")
                        }
                        if !dark {
                            XCTAssertGreaterThan(zip(row, guide).map { Int($0) - Int($1) }.min() ?? 0, 5,
                                "Light-mode guidance remains darker than the white row surface")
                        }
                    }
                }
            }
        }
    }
    private func familySelector(in view: UIView) -> UISegmentedControl? {
        if let selector = view as? UISegmentedControl { return selector }
        return view.subviews.lazy.compactMap { self.familySelector(in: $0) }.first
    }
    private func backgroundPixel(_ image: UIImage, x: Int, y: Int) throws -> [UInt8] {
        let crop = try XCTUnwrap(image.cgImage?.cropping(to: CGRect(x: x, y: y, width: 1, height: 1)))
        var pixel = [UInt8](repeating: 0, count: 4)
        try pixel.withUnsafeMutableBytes { bytes in
            let context = try XCTUnwrap(CGContext(data: bytes.baseAddress, width: 1, height: 1,
                bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(crop, in: CGRect(x: 0, y: 0, width: 1, height: 1))
        }
        return Array(pixel.prefix(3))
    }
    func testCoverBottomBlendsIntoPageInBothThemes() async throws {
        for dark in [false, true] {
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(x: 0, y: 0, width: 320, height: 600)
            window.windowLevel = .alert
            window.overrideUserInterfaceStyle = dark ? .dark : .light
            let host = UIHostingController(rootView: StageDetailHeader(summary: summary())
                .frame(maxHeight: .infinity, alignment: .top)
                .background(Color(uiColor: .systemGroupedBackground)).ignoresSafeArea())
            window.rootViewController = host; window.isHidden = false
            defer { window.isHidden = true; window.rootViewController = nil }
            host.view.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(60))
            let format = UIGraphicsImageRendererFormat(); format.scale = 1
            let image = UIGraphicsImageRenderer(bounds: host.view.bounds, format: format).image { _ in
                host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
            }
            let cgImage = try XCTUnwrap(image.cgImage)
            let crop = try XCTUnwrap(cgImage.cropping(to: CGRect(x: 2, y: 235, width: 1, height: 1)))
            var pixel = [UInt8](repeating: 0, count: 4)
            try pixel.withUnsafeMutableBytes { bytes in
                let context = try XCTUnwrap(CGContext(data: bytes.baseAddress, width: 1, height: 1,
                    bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(),
                    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
                context.draw(crop, in: CGRect(x: 0, y: 0, width: 1, height: 1))
            }
            let background = UIColor.systemGroupedBackground.resolvedColor(with: host.traitCollection)
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            XCTAssertTrue(background.getRed(&r, green: &g, blue: &b, alpha: &a))
            for (actual, expected) in zip(pixel.prefix(3), [r, g, b]) {
                XCTAssertEqual(Double(actual), Double(expected * 255), accuracy: 6,
                    "The cover must meet the page without a hard cyan edge, dark=\(dark)")
            }
        }
    }
    func testBookChangeResetsFamilyAndDisclosure() {
        var selection = StageDetailSelection(continuationStage: 7)
        XCTAssertEqual(selection.family, .grouped)
        selection.toggleGuide(7)
        XCTAssertEqual(selection.expandedStage, 7)
        selection.select(.crazySpeaking)
        XCTAssertNil(selection.expandedStage)
        let nextBook = StageDetailSelection(continuationStage: 1)
        XCTAssertEqual(nextBook.family, .shadowing)
        XCTAssertNil(nextBook.expandedStage)
    }
    func testCoverStatisticsContinuationAndFamilyOrderInBothThemes() async throws {
        for (width, dark, size) in [(320.0, false, DynamicTypeSize.large), (402.0, true, .large), (320.0, true, .accessibility5)] {
            let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
            let window = UIWindow(windowScene: scene)
            window.frame = CGRect(x: 0, y: 0, width: width, height: 874)
            window.windowLevel = .alert
            window.overrideUserInterfaceStyle = dark ? .dark : .light
            let host = UIHostingController(rootView: NavigationStack {
                StagePathView(summary: summary(title: "Morning Notes · A long book title that wraps naturally"), open: { _ in })
            }.dynamicTypeSize(size))
            window.rootViewController = host; window.isHidden = false
            defer { window.isHidden = true; window.rootViewController = nil }
            host.view.layoutIfNeeded()
            try await Task.sleep(for: .milliseconds(60))
            let image = UIGraphicsImageRenderer(bounds: host.view.bounds).image { _ in
                host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
            }
            XCTAssertGreaterThan(image.size.height, 800)
            let attachment = XCTAttachment(image: image)
            attachment.name = "Stage detail - \(width) - \(dark ? "dark" : "light") - \(size)"
            attachment.lifetime = .keepAlways
            add(attachment)
        }
    }
}

@MainActor @Observable private final class AccordionRenderState {
    var expanded = false
}

private struct AccordionRenderFixture: View {
    let state: AccordionRenderState
    let summary: BookStudySummary
    let reduceMotion: Bool
    var row: StagePracticeRow {
        StagePracticeRow(stage: 1, summary: summary, prominent: true, expanded: state.expanded,
            reduceMotion: reduceMotion, open: {}, toggle: { state.expanded.toggle() })
    }
    var body: some View {
        VStack(spacing: 0) {
            row
            Rectangle().fill(.red).frame(height: 6)
        }.frame(maxHeight: .infinity, alignment: .top)
            .background(Color(uiColor: .systemGroupedBackground))
    }
}
