import AppFoundation
import LearningDomain
import LearningPersistence
import SwiftUI
import UIKit
import XCTest
@testable import LearningMedia
@testable import MetaShadowingNative

@MainActor final class PlayerLayoutRenderingTests: XCTestCase {
    func testRateLabelReservesFourNumericCharactersWithoutMovingSliderOrTicks() async throws {
        continueAfterFailure = false
        for compact in [false, true] {
            for largeText in [false, true] {
                var baseline: [CGRect]?
                for rate in [1.0, 0.25, 0.5, 1.25, 2.0, 2.75, 3.0] {
                    var preferences = LearningPreferences.fresh
                    preferences.rate = rate
                    let measurements = PlayerLayoutMeasurements()
                    let ids = ["rate-slider", "rate-current-value"] + (1...12).map { "rate-tick-\($0)" }
                    let view = PreferenceEditorView(option: .rate, preferences: preferences, compact: compact) { _ in true }
                        .environment(\.dynamicTypeSize, largeText ? .accessibility5 : .large)
                    try await withView(view, measurements: measurements, required: ids) { _ in
                        let frames = try ids.map { try frame($0, in: measurements) }
                        if let baseline {
                            for (index, current) in frames.enumerated() {
                                XCTAssertEqual(current.minX, baseline[index].minX, accuracy: 0.5, "\(ids[index]) at \(rate)×")
                                XCTAssertEqual(current.width, baseline[index].width, accuracy: 0.5, "\(ids[index]) at \(rate)×")
                            }
                        } else { baseline = frames }
                    }
                }
            }
        }
    }

    func testRateDragSnapsToQuarterStepsAndClampsAtBothEnds() {
        for (input, expected) in [(-1.0, 0.25), (0.36, 0.25), (0.38, 0.5), (0.74, 0.75),
                                  (1.12, 1.0), (1.13, 1.25), (1.63, 1.75), (2.87, 2.75), (4.0, 3.0)] {
            XCTAssertEqual(RateEditorView.quarterStep(input), expected, "Input: \(input)")
        }
    }

    func testRateValueRendersRightOfSliderWithQuarterTicksBelowInBothEditors() async throws {
        for compact in [false, true] {
            for largeText in [false, true] {
                let measurements = PlayerLayoutMeasurements()
                let ids = ["rate-slider", "rate-current-value"] + (1...12).map { "rate-tick-\($0)" }
                let view = PreferenceEditorView(option: .rate, preferences: .fresh, compact: compact) { _ in true }
                    .environment(\.dynamicTypeSize, largeText ? .accessibility5 : .large)
                try await withView(view, measurements: measurements, required: ids) { host in
                    let slider = try frame("rate-slider", in: measurements)
                    let value = try frame("rate-current-value", in: measurements)
                    XCTAssertGreaterThanOrEqual(slider.width + value.width + 12, host.view.bounds.width - 80,
                                                "The track and value must fill the row, including at large text sizes")
                    XCTAssertGreaterThan(value.minX, slider.maxX)
                    XCTAssertEqual(value.midY, slider.midY, accuracy: 1)
                    XCTAssertTrue(host.view.bounds.contains(value))
                    var previousX = slider.minX - 1
                    for step in 1...12 {
                        let tick = try frame("rate-tick-\(step)", in: measurements)
                        XCTAssertGreaterThanOrEqual(tick.minY, slider.maxY)
                        XCTAssertLessThanOrEqual(tick.maxX, slider.maxX)
                        XCTAssertGreaterThan(tick.minX, previousX)
                        XCTAssertTrue(host.view.bounds.contains(tick))
                        let ink = try pixels(host.view, crop: tick)
                        XCTAssertTrue(stride(from: 0, to: ink.bytes.count, by: 4).contains {
                            ink.bytes[$0] < 210 && ink.bytes[$0 + 1] < 210 && ink.bytes[$0 + 2] < 210
                        }, "Quarter-step marker must actually be visible")
                        previousX = tick.minX
                    }
                }
            }
        }
    }

    func testFooterDoesNotReserveBlankSpaceAboveCycles() async throws {
        try await withPlayer(mode: "audio", largeText: false) { player in
            let runtime = try XCTUnwrap(player.flow.runtime)
            let measurements = PlayerLayoutMeasurements()
            let view = LearningControlsView(runtime: runtime, onActionFrameChange: { _ in })
                .fixedSize(horizontal: false, vertical: true).playerLayoutFrame("footer")
            try await withView(view, measurements: measurements, required: ["footer", "cycle-timeline", "player-main"]) { _ in
                let footer = try frame("footer", in: measurements)
                let timeline = try frame("cycle-timeline", in: measurements)
                XCTAssertLessThanOrEqual(timeline.minY - footer.minY, 4,
                                         "Content should reach the cycle strip, without a permanent XP slot")
                XCTAssertGreaterThanOrEqual(try frame("player-main", in: measurements).height, 44)
            }
        }
    }

    func testGroupedHeaderKeepsSixCircularControlsSeparatedAboveProgress() async throws {
        continueAfterFailure = false
        for width in [320.0, 402.0] {
            for largeText in [false, true] {
                try await withPlayer(mode: "video", largeText: largeText, stage: 7, width: width, rate: 2.75) { player in
                    XCTAssertEqual(player.flow.runtime?.controls.session.rate, 2.75)
                    let ids = ["player-options", "player-level", "player-speed", "player-font", "player-group", "player-analysis"]
                    let frames = try ids.map { try player.frame($0) }
                    for frame in frames {
                        XCTAssertEqual(frame.width, 44, accuracy: 0.5)
                        XCTAssertEqual(frame.height, 44, accuracy: 0.5)
                        XCTAssertTrue(player.window.bounds.contains(frame))
                        XCTAssertEqual(frame.midY, frames[0].midY, accuracy: 1)
                        XCTAssertLessThan(frame.maxY, try player.frame("player-progress").minY)
                    }
                    for index in 1..<frames.count {
                        XCTAssertGreaterThanOrEqual(frames[index].minX - frames[index - 1].maxX, 4)
                        XCTAssertEqual(frames[index].minX - frames[index - 1].maxX,
                                       frames[1].minX - frames[0].maxX, accuracy: 0.5)
                    }
                    let image = UIGraphicsImageRenderer(bounds: player.window.bounds).image { _ in
                        player.window.drawHierarchy(in: player.window.bounds, afterScreenUpdates: true)
                    }
                    let attachment = XCTAttachment(image: image)
                    attachment.name = "Grouped header - width \(Int(width)), largest text \(largeText), rate 2.75"
                    attachment.lifetime = .keepAlways
                    add(attachment)
                }
            }
        }
    }

    func testFullscreenCaptionSizesRenderIndependentlyFromPortraitSizes() async throws {
        let session = try session(sourceCount: 1)
        func measure(_ value: LearningPreferences, fullscreen: Bool) async throws -> [CGRect] {
            let measurements = PlayerLayoutMeasurements()
            var result: [CGRect] = []
            let ids = ["learning-line-0-0-target", "learning-line-0-0-translation"]
            try await withView(LearningContentView(session: session, motion: LearningMotionState(), preferences: value,
                                                   fullscreenCaptions: fullscreen),
                               measurements: measurements, required: ids) { _ in
                result = try ids.map { try frame($0, in: measurements) }
            }
            return result
        }
        var value = LearningPreferences.fresh
        let normal = try await measure(value, fullscreen: false)
        let fullscreen = try await measure(value, fullscreen: true)
        value.fullscreenOriginalTextSize = 40; value.fullscreenTranslationTextSize = 36
        let enlarged = try await measure(value, fullscreen: true)
        let unchangedNormal = try await measure(value, fullscreen: false)
        value.originalTextSize = 32; value.translationTextSize = 30
        let unchangedFullscreen = try await measure(value, fullscreen: true)
        for index in 0..<2 {
            XCTAssertGreaterThan(enlarged[index].height, fullscreen[index].height * 1.5)
            XCTAssertEqual(unchangedNormal[index].height, normal[index].height, accuracy: 1)
            XCTAssertEqual(unchangedFullscreen[index].height, enlarged[index].height, accuracy: 1)
        }
    }

    func testHeaderShowsOptionsAboveFullWidthProgressWithoutBookTitle() async throws {
        continueAfterFailure = false
        for mode in ["audio", "long", "video"] {
            for largeText in [false, true] {
                try await withPlayer(mode: mode, largeText: largeText) { player in
                    let options = try player.frame("player-options")
                    let progress = try player.frame("player-progress")
                    let level = try player.frame("player-level")
                    let analysis = try player.frame("player-analysis")
                    let counter = try player.frame("player-counter")
                    XCTAssertLessThan(options.midX, player.window.bounds.midX)
                    XCTAssertEqual(options.midY, level.midY, accuracy: 1)
                    XCTAssertNil(player.measurements.frames["player-book-title"], "The reading area must not reserve a book-title row")
                    XCTAssertEqual(progress.minX, options.minX, accuracy: 2)
                    XCTAssertLessThanOrEqual(progress.maxX, player.window.bounds.maxX)
                    XCTAssertGreaterThan(progress.width, player.window.bounds.width * 0.6)
                    XCTAssertGreaterThan(progress.minY, level.maxY)
                    XCTAssertLessThan(progress.maxX, counter.minX)
                    XCTAssertEqual(counter.maxX, analysis.maxX, accuracy: 2)
                    for identifier in ["player-options", "player-level", "player-speed", "player-font", "player-analysis"] {
                        let frame = try player.frame(identifier)
                        XCTAssertEqual(frame.width, 44, accuracy: 0.5, identifier)
                        XCTAssertEqual(frame.height, 44, accuracy: 0.5, identifier)
                        XCTAssertEqual(frame.midY, options.midY, accuracy: 1)
                        XCTAssertLessThan(frame.maxY, progress.minY)
                    }
                    XCTAssertEqual(player.flow.runtime?.controls.xp, 0)
                    let saved = try await player.model.workspace.load()
                    XCTAssertEqual(saved.progress.xp, 0, "Rendering the new header must not earn credit")
                }
            }
        }
    }

    func testShortContentCentersBetweenActualFixedBars() async throws {
        for mode in ["audio", "video"] {
            for largeText in [false, true] {
                try await withPlayer(mode: mode, largeText: largeText) { player in
                    let original = try player.frame("learning-line-0-0-target")
                    let translation = try player.frame("learning-line-0-0-translation")
                    let text = original.union(translation)
                    let upper = try player.frame(mode == "video" ? "lesson-video" : "player-progress-row")
                    let timeline = try player.frame("cycle-timeline")
                    XCTAssertGreaterThan(text.minY, upper.maxY)
                    XCTAssertLessThan(text.maxY, timeline.minY)
                    XCTAssertEqual(text.midY, (upper.maxY + timeline.minY) / 2, accuracy: 24,
                                   "Actual player content must center between bars: \(mode), largeText=\(largeText)")
                }
            }
        }
    }

    func testProgressWidthSurvivesCounterDigitBoundary() async throws {
        let session = try session(sourceCount: 12)
        var frames: [CGRect] = []
        for source in [8, 9] {
            let selected = try LearningReducer.reduce(session, event: .selectSource(source)).session
            let measurements = PlayerLayoutMeasurements()
            try await withView(PlayerProgressView(session: selected),
                               measurements: measurements, required: ["player-progress", "player-counter"]) { _ in
                frames.append(try frame("player-progress", in: measurements))
            }
        }
        XCTAssertEqual(frames[0].width, frames[1].width, accuracy: 1)
        XCTAssertEqual(frames[0].minX, frames[1].minX, accuracy: 1)
    }

    func testCompletedSentenceProgressUsesPrimaryPixels() async throws {
        var session = try session(sourceCount: 2)
        for _ in 0..<3 {
            for event in [LearningEvent.resume, .playbackEnded, .confirm] {
                session = try LearningReducer.reduce(session, event: event).session
            }
        }
        session = try LearningReducer.reduce(session, event: .next).session
        XCTAssertEqual(session.unit, 1)
        XCTAssertEqual(session.units[0].confirmed, 3)
        let measurements = PlayerLayoutMeasurements()
        try await withView(PlayerProgressView(session: session),
                           measurements: measurements, required: ["player-progress"]) { host in
            let pixels = try pixels(host.view, crop: frame("player-progress", in: measurements))
            let primary = stride(from: 0, to: pixels.bytes.count, by: 4).filter {
                pixels.bytes[$0] > 230 && pixels.bytes[$0 + 1] > 150
                    && pixels.bytes[$0 + 1] < 225 && pixels.bytes[$0 + 2] < 75
            }.count
            XCTAssertGreaterThan(primary, pixels.width, "Completed progress must draw primary yellow, not the dark tint")
        }
    }

    func testActiveRingFitsInsideEveryTimelineNode() async throws {
        var session = try session(sourceCount: 2)
        for ordinal in 0..<3 {
            for event in [LearningEvent.resume, .playbackEnded] {
                session = try LearningReducer.reduce(session, event: event).session
            }
            XCTAssertEqual(session.current.confirmed, ordinal)
            let measurements = PlayerLayoutMeasurements()
            try await withView(CycleTimelineView(session: session, motion: LearningMotionState()).padding(),
                               measurements: measurements, required: ["cycle-timeline"]) { host in
                let pixels = try pixels(host.view, crop: frame("cycle-timeline", in: measurements))
                let width = pixels.width, height = pixels.height
                func green(_ x: Int, _ y: Int) -> Bool {
                    let index = (y * width + x) * 4
                    let red = Int(pixels.bytes[index]), green = Int(pixels.bytes[index + 1]), blue = Int(pixels.bytes[index + 2])
                    return green > 80 && green > red + 20 && green > blue + 20
                }
                let columns = (ordinal * width / 3)..<((ordinal + 1) * width / 3)
                XCTAssertTrue(columns.contains { x in
                    (0..<height).contains { y in abs(y - height / 2) > height / 4 && green(x, y) }
                }, "The active ring must actually render at node \(ordinal)")
                XCTAssertFalse(columns.contains { green($0, 0) || green($0, height - 1) },
                               "The stroke must not touch the clipped top/bottom edge")
                if ordinal == 0 || ordinal == 2 {
                    let edge = ordinal == 0 ? 0 : width - 1
                    XCTAssertFalse((0..<height).contains { green(edge, $0) })
                }
            }
            session = try LearningReducer.reduce(session, event: .confirm).session
        }
    }

    @MainActor private struct Player {
        let flow: LearningFlow
        let model: ProductModel
        let window: UIWindow
        let measurements: PlayerLayoutMeasurements
        func frame(_ identifier: String) throws -> CGRect {
            try PlayerLayoutRenderingTests.frame(identifier, in: measurements)
        }
    }

    private func withPlayer(mode: String, largeText: Bool, stage: Int = 1, width: CGFloat = 402, rate: Double = 1,
                            body: (Player) async throws -> Void) async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: mode), profileID: "layout")
        let model = ProductModel(workspace: workspace)
        await model.activate()
        if rate != 1 {
            var preferences = LearningPreferences.fresh
            preferences.rate = rate
            let saved = await model.saveLearningPreferences(preferences)
            XCTAssertTrue(saved)
        }
        let flow = LearningFlow(workspace: workspace)
        await flow.open(packageKey: "ui-fixture-v1", stage: stage, startWhenPresented: true)
        flow.suspend()
        let measurements = PlayerLayoutMeasurements()
        let view = LearningPlayerView(route: .init(packageKey: "ui-fixture-v1", stage: stage, flow: flow), model: model)
            .environment(\.dynamicTypeSize, largeText ? .accessibility5 : .large)
        let required = ["player-options", "player-progress", "player-counter", "player-level",
                        "player-speed", "player-analysis", "cycle-timeline", "player-main",
                        "learning-line-0-0-target", "learning-line-0-0-translation"] + (mode == "video" ? ["lesson-video"] : [])
        do {
            try await withView(view, measurements: measurements, required: required, width: width) { host in
                let window = try XCTUnwrap(host.view.window)
                try await body(Player(flow: flow, model: model, window: window, measurements: measurements))
            }
        } catch {
            await flow.close(); model.deactivate()
            throw error
        }
        await flow.close(); model.deactivate()
    }

    private func withView<Content: View>(_ view: Content, measurements: PlayerLayoutMeasurements,
                                        required: [String], width: CGFloat = 402,
                                        body: (UIViewController) async throws -> Void) async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: width, height: 874)
        window.windowLevel = .alert
        window.overrideUserInterfaceStyle = .light
        let host = UIHostingController(rootView: view.environment(\.playerLayoutMeasurements, measurements))
        window.rootViewController = host
        window.isHidden = false
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.layoutIfNeeded()
        let deadline = ContinuousClock.now + .seconds(5)
        var previous: [String: CGRect] = [:], stable = 0
        while ContinuousClock.now < deadline {
            let current = measurements.frames
            let ready = required.allSatisfy { current[$0].map { !$0.isEmpty } ?? false }
            stable = ready && current == previous ? stable + 1 : 0
            if stable >= 2 { break }
            previous = current
            try await Task.sleep(for: .milliseconds(20))
        }
        for identifier in required { _ = try Self.frame(identifier, in: measurements) }
        XCTAssertGreaterThanOrEqual(stable, 2, "Actual player geometry must settle before it is compared")
        try await body(host)
    }

    private static func frame(_ identifier: String, in measurements: PlayerLayoutMeasurements) throws -> CGRect {
        let value = try XCTUnwrap(measurements.frames[identifier], "Missing rendered element: \(identifier)")
        XCTAssertGreaterThan(value.width, 0, identifier)
        XCTAssertGreaterThan(value.height, 0, identifier)
        return value
    }
    private func frame(_ identifier: String, in measurements: PlayerLayoutMeasurements) throws -> CGRect {
        try Self.frame(identifier, in: measurements)
    }

    private func session(sourceCount: Int) throws -> LearningSession {
        let scope = try LearningScope(profileID: "layout", packageKey: "layout-v1", language: "english", book: "layout", stage: 1)
        let sources = (0..<sourceCount).map { LearningSource(index: $0, text: "One", translation: "하나") }
        let plan = try LearningPlan.make(scope: scope, runID: "layout", sources: sources, groupSize: 2)
        return try .start(plan: plan, preferences: .fresh)
    }

    private func pixels(_ view: UIView, crop: CGRect) throws -> (bytes: [UInt8], width: Int, height: Int) {
        let format = UIGraphicsImageRendererFormat()
        format.scale = view.traitCollection.displayScale
        let image = UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
        }
        let pixelCrop = CGRect(x: crop.minX * format.scale, y: crop.minY * format.scale,
                               width: crop.width * format.scale, height: crop.height * format.scale).integral
        let cgImage = try XCTUnwrap(image.cgImage?.cropping(to: pixelCrop))
        let width = cgImage.width, height = cgImage.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        try bytes.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        return (bytes, width, height)
    }
}
