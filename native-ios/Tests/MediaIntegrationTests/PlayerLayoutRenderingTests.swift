import AppFoundation
import LearningDomain
import LearningPersistence
import SwiftUI
import UIKit
import XCTest
@testable import LearningMedia
@testable import MetaShadowingNative

@MainActor final class PlayerLayoutRenderingTests: XCTestCase {
    func testHeaderGeometryAcrossTitleLengthsAndTextSizes() async throws {
        for mode in ["audio", "long"] {
            for largeText in [false, true] {
                try await withPlayer(mode: mode, largeText: largeText) { player in
                    let title = try player.frame("player-book-title")
                    let options = try player.frame("player-options")
                    let progress = try player.frame("player-progress")
                    let level = try player.frame("player-level")
                    let analysis = try player.frame("player-analysis")
                    let counter = try player.frame("player-counter")
                    XCTAssertLessThan(options.midX, player.window.bounds.midX)
                    XCTAssertGreaterThanOrEqual(progress.minY, title.maxY)
                    XCTAssertGreaterThan(progress.minX, options.maxX)
                    XCTAssertLessThanOrEqual(progress.maxX, player.window.bounds.maxX)
                    XCTAssertLessThan(progress.maxY, level.minY)
                    XCTAssertEqual(title.midX, player.window.bounds.midX, accuracy: 2)
                    XCTAssertEqual(counter.maxX, analysis.maxX, accuracy: 2)
                    for identifier in ["player-level", "player-speed", "player-analysis"] {
                        let frame = try player.frame(identifier)
                        XCTAssertGreaterThanOrEqual(frame.width, 44, identifier)
                        XCTAssertGreaterThanOrEqual(frame.height, 44, identifier)
                    }
                    XCTAssertEqual(player.flow.runtime?.controls.xp, 0)
                    let saved = try await player.model.workspace.load()
                    XCTAssertEqual(saved.progress.xp, 0, "Rendering any title/text-size variant must not earn credit")
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
                    let upper = try player.frame(mode == "video" ? "lesson-video" : "player-level")
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
            try await withView(PlayerTitleView(title: "Morning Notes", session: selected, openOptions: {}),
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
        try await withView(PlayerTitleView(title: "Progress", session: session, openOptions: {}),
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

    private func withPlayer(mode: String, largeText: Bool,
                            body: (Player) async throws -> Void) async throws {
        let root = try MediaFixtureFactory.root()
        defer { try? FileManager.default.removeItem(at: root) }
        let workspace = ProductWorkspace(store: SQLiteLearningStore(root: root.appending(path: "store")),
            catalog: ProductTestCatalog(root: root.appending(path: "assets"), mode: mode), profileID: "layout")
        let model = ProductModel(workspace: workspace)
        await model.activate()
        let flow = LearningFlow(workspace: workspace)
        await flow.open(packageKey: "ui-fixture-v1", stage: 1, startWhenPresented: true)
        flow.suspend()
        let measurements = PlayerLayoutMeasurements()
        let view = LearningPlayerView(route: .init(packageKey: "ui-fixture-v1", stage: 1, flow: flow), model: model)
            .environment(\.dynamicTypeSize, largeText ? .accessibility5 : .large)
        let required = ["player-book-title", "player-options", "player-progress", "player-counter", "player-level",
                        "player-speed", "player-analysis", "cycle-timeline", "player-main",
                        "learning-line-0-0-target", "learning-line-0-0-translation"] + (mode == "video" ? ["lesson-video"] : [])
        do {
            try await withView(view, measurements: measurements, required: required) { host in
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
                                        required: [String], body: (UIViewController) async throws -> Void) async throws {
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
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
