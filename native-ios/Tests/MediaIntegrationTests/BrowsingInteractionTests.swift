import SwiftUI
import UIKit
import XCTest
@testable import MetaShadowingNative

@MainActor final class BrowsingInteractionTests: XCTestCase {
    func testUserTabSelectionEmitsOnceButProgrammaticSelectionIsQuiet() {
        let generator = ImpactRecorder(style: .light)
        let feedback = BrowsingTapFeedback(generator: generator)
        var selected = 0
        let source = Binding(get: { selected }, set: { selected = $0 })
        let userSelection = feedback.selection(source)
        for tab in [1, 2, 0] { userSelection.wrappedValue = tab }
        XCTAssertEqual(selected, 0)
        XCTAssertEqual(generator.impacts, 3)
        source.wrappedValue = 1 // Library Learn routes to Stages without another tap.
        XCTAssertEqual(selected, 1)
        XCTAssertEqual(generator.impacts, 3)
    }

    func testStageActivationEmitsBeforeOpeningAndLockedStageDoesNothing() {
        let generator = ImpactRecorder(style: .light)
        let feedback = BrowsingTapFeedback(generator: generator)
        var opens = 0
        let open = {
            XCTAssertEqual(generator.impacts, 1)
            opens += 1
        }
        StageRow(stage: 1, completions: 1, checkpoint: nil, enabled: true,
                 open: open, tapFeedback: feedback).activate()
        XCTAssertEqual(opens, 1)
        XCTAssertEqual(generator.impacts, 1)
        StageRow(stage: 2, completions: 0, checkpoint: nil, enabled: false,
                 open: open, tapFeedback: feedback).activate()
        XCTAssertEqual(opens, 1)
        XCTAssertEqual(generator.impacts, 1)
    }

    func testThreeCompletionMarksReflectConfirmedRunsInBothThemes() async throws {
        for dark in [false, true] {
            for completions in 0...4 {
                let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
                let window = UIWindow(windowScene: scene)
                window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
                window.windowLevel = .alert
                window.overrideUserInterfaceStyle = dark ? .dark : .light
                let controller = UIHostingController(rootView:
                    StageRow(stage: 1, completions: completions, checkpoint: nil, enabled: true, open: {})
                        .frame(width: 390, height: 80)
                        .frame(maxHeight: .infinity, alignment: .top)
                        .background(dark ? Color.black : Color.white).ignoresSafeArea())
                window.rootViewController = controller
                window.isHidden = false
                defer { window.isHidden = true; window.rootViewController = nil }
                controller.view.layoutIfNeeded()
                try await Task.sleep(for: .milliseconds(60))
                let format = UIGraphicsImageRendererFormat(); format.scale = 1
                let image = UIGraphicsImageRenderer(bounds: controller.view.bounds, format: format).image { _ in
                    controller.view.drawHierarchy(in: controller.view.bounds, afterScreenUpdates: true)
                }
                let marks = try completionMarks(image, dark: dark)
                XCTAssertEqual(marks.all, 3, "Always render three separated check circles: \(completions), dark=\(dark)")
                XCTAssertEqual(marks.green, min(completions, 3), "One green check per completed full run")
                let attachment = XCTAttachment(image: image)
                attachment.name = "Stage checks - \(completions) - \(dark ? "dark" : "light")"
                attachment.lifetime = .keepAlways
                add(attachment)
            }
        }
    }

    private func completionMarks(_ image: UIImage, dark: Bool) throws -> (all: Int, green: Int) {
        let cgImage = try XCTUnwrap(image.cgImage)
        let width = cgImage.width, height = cgImage.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        try bytes.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        var all = 0, green = 0, previousInk = false, previousGreen = false
        for x in 270..<width {
            var inkColumn = false, greenColumn = false
            for y in 0..<80 {
                let offset = (y * width + x) * 4
                let r = Int(bytes[offset]), g = Int(bytes[offset + 1]), b = Int(bytes[offset + 2])
                if dark ? max(r, g, b) > 30 : min(r, g, b) < 225 { inkColumn = true }
                if g > r + 25 && g > b + 25 { greenColumn = true }
            }
            if inkColumn && !previousInk { all += 1 }
            if greenColumn && !previousGreen { green += 1 }
            previousInk = inkColumn; previousGreen = greenColumn
        }
        return (all, green)
    }
}

@MainActor private final class ImpactRecorder: UIImpactFeedbackGenerator {
    var impacts = 0
    override func impactOccurred() { impacts += 1 }
}
