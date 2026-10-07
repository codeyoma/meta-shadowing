import AppFoundation
import SwiftUI
import UIKit
import XCTest
@testable import MetaShadowingNative

@MainActor final class LearningRewardRenderingTests: XCTestCase {
    func testXPHasNoBackgroundAndFadesWithoutAHold() async throws {
        try await checkReceipt(largeText: false,
                               action: CGRect(x: 16, y: 774, width: 370, height: 50))
    }

    func testDarkRewardUsesWhiteTextAndFadesWithoutAHold() async throws {
        try await checkReceipt(largeText: false,
                               action: CGRect(x: 16, y: 774, width: 370, height: 50), dark: true)
    }

    func testTextOnlyRewardFitsLargestTextAndNarrowRepeatAction() async throws {
        try await checkReceipt(largeText: true,
                               action: CGRect(x: 108, y: 738, width: 278, height: 86))
    }

    func testCompletionMessageRendersAlongsideXPBeforeFading() async throws {
        try await checkReceipt(largeText: false,
                               action: CGRect(x: 16, y: 774, width: 370, height: 50), completedRun: true)
    }

    private func checkReceipt(largeText: Bool, action: CGRect, completedRun: Bool = false,
                              dark: Bool = false) async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.windowLevel = .alert
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        let feedback = CommittedLearningFeedback(commandID: UUID(), kind: .cycle(1), xpAward: 3, completedRun: completedRun)
        let controller = UIHostingController(rootView:
            LearningRewardView(feedback: feedback, actionFrame: action)
                .environment(\.dynamicTypeSize, largeText ? .accessibility5 : .large)
                .background(dark ? Color.black : Color.white).ignoresSafeArea())
        window.rootViewController = controller
        window.isHidden = false
        defer { window.isHidden = true; window.rootViewController = nil }
        controller.view.layoutIfNeeded()

        // Sample the actual hosted SwiftUI view, without slowing the production animation.
        var first = try capture(controller.view, dark: dark)
        for _ in 0..<10 where first.ink == 0 {
            try await Task.sleep(for: .milliseconds(20))
            first = try capture(controller.view, dark: dark)
        }
        XCTAssertGreaterThan(first.ink, 0, "The award must actually render before it disappears")
        XCTAssertEqual(first.coloredPixels, 0, "Reward text must be neutral black/white, not a fixed accent color")
        XCTAssertLessThan(Double(first.inkPixels) / max(1, first.bounds.width * first.bounds.height), 0.65,
                          "Only glyphs should render, without a filled badge background")
        let attachment = XCTAttachment(image: first.image)
        attachment.name = dark ? "XP text - dark" : "XP text - light"
        attachment.lifetime = .keepAlways
        add(attachment)
        XCTAssertEqual(first.lineCount, completedRun ? 2 : 1,
                       "Completion must visibly add its message below XP, not merely disappear from accessibility")
        XCTAssertGreaterThanOrEqual(first.bounds.minX, action.minX)
        XCTAssertLessThanOrEqual(first.bounds.maxX, action.maxX)
        XCTAssertGreaterThanOrEqual(first.bounds.minY, action.minY - 72)
        XCTAssertLessThan(first.bounds.maxY, action.minY)
        try await Task.sleep(for: .milliseconds(180))
        let fading = try capture(controller.view, dark: dark)
        // Per-pixel opacity, not total ink: the simultaneous pop changes the glyph area.
        XCTAssertLessThan(fading.peakInk, first.peakInk * 9 / 10, "Fading must begin immediately, without a visible hold")
        try await Task.sleep(for: .milliseconds(470))
        let gone = try capture(controller.view, dark: dark)
        XCTAssertEqual(gone.ink, 0, "The effect must be gone after its half-second fade")
    }

    private struct Pixels {
        let image: UIImage
        var ink = 0
        var peakInk = 0
        var inkPixels = 0
        var coloredPixels = 0
        var lineCount = 0
        var bounds = CGRect.zero
    }

    private func capture(_ view: UIView, dark: Bool) throws -> Pixels {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
        }
        let cgImage = try XCTUnwrap(image.cgImage)
        let width = cgImage.width, height = cgImage.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        try bytes.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        var result = Pixels(image: image)
        var minX = width, minY = height, maxX = 0, maxY = 0
        var lastInkRow: Int?
        for y in 600..<min(800, height) {
            var rowHasInk = false
            for x in 0..<width {
                let index = (y * width + x) * 4
                let red = Int(bytes[index]), green = Int(bytes[index + 1]), blue = Int(bytes[index + 2])
                let brightest = max(red, green, blue), darkest = min(red, green, blue)
                if brightest - darkest > 5 { result.coloredPixels += 1 }
                let contrast = dark ? brightest : 255 - darkest
                if contrast > 5 {
                    rowHasInk = true
                    result.inkPixels += 1
                    result.ink += contrast
                    result.peakInk = max(result.peakInk, contrast)
                    minX = min(minX, x); maxX = max(maxX, x)
                    minY = min(minY, y); maxY = max(maxY, y)
                }
            }
            if rowHasInk {
                if lastInkRow == nil || y - lastInkRow! > 3 { result.lineCount += 1 }
                lastInkRow = y
            }
        }
        if result.ink > 0 {
            result.bounds = CGRect(x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1)
        }
        return result
    }
}
