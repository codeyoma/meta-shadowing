import AppFoundation
import LearningMedia
import LearningPersistence
import SwiftUI
import UIKit
import XCTest
@testable import MetaShadowingNative

@MainActor final class LaunchInteractionTests: XCTestCase {
    func testArtworkOwnsHitTestingUntilItIsRemoved() async throws {
        for textSize in [DynamicTypeSize.large, .accessibility5] {
            try await verifyLaunchProtection(textSize: textSize)
        }
    }

    private func verifyLaunchProtection(textSize: DynamicTypeSize) async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let model = ProductModel(workspace: ProductWorkspace(store: SQLiteLearningStore(root: root),
            catalog: UnavailableLaunchCatalog(), profileID: "launch-hit-testing"))
        await model.activate()
        XCTAssertTrue(model.failed)
        let playback = LaunchPlayback(clock: MediaClock(now: { 0 }, sleep: { _ in
            try await Task.sleep(for: .seconds(60))
        }))
        playback.begin(reduceMotion: false)
        playback.startWhenReady(reduceMotion: false)
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.windowLevel = .alert
        let controller = UIHostingController(rootView: LaunchGateView(model: model, playback: playback)
            .environment(\.scenePhase, .active)
            .environment(\.dynamicTypeSize, textSize))
        window.rootViewController = controller
        window.isHidden = false
        defer {
            playback.interrupt()
            model.deactivate()
            window.isHidden = true
            window.rootViewController = nil
        }
        for _ in 0..<100 where canvas(in: controller.view) == nil {
            try await Task.sleep(for: .milliseconds(20))
        }
        controller.view.layoutIfNeeded()
        let artwork = try XCTUnwrap(canvas(in: controller.view))
        XCTAssertNotEqual(playback.phase, .finished)
        let points = [CGPoint(x: 12, y: 12), CGPoint(x: 201, y: 437), CGPoint(x: 390, y: 862)]
        for point in points {
            let hit = try XCTUnwrap(window.hitTest(point, with: nil))
            XCTAssertTrue(hit === artwork || hit.isDescendant(of: artwork),
                          "The visible launch artwork must intercept touches across the window")
        }
        playback.interrupt()
        for _ in 0..<100 where canvas(in: controller.view) != nil {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertNil(canvas(in: controller.view), "Finished artwork must leave the hit-test hierarchy")
        XCTAssertNotNil(window.hitTest(CGPoint(x: 201, y: 536), with: nil))
        XCTAssertTrue(model.failed, "Dismissing launch must not retry or discard the load failure")
        XCTAssertNil(model.snapshot)
    }

    private func canvas(in view: UIView) -> LaunchCanvas? {
        if let canvas = view as? LaunchCanvas { return canvas }
        return view.subviews.lazy.compactMap { self.canvas(in: $0) }.first
    }
}

private actor UnavailableLaunchCatalog: ProductCatalog {
    func books() async throws -> [CatalogBook] { throw ProductError.invalidContent }
    func materials(packageKey: String) async throws -> BookMaterials { throw ProductError.invalidContent }
    func permitsPractice(packageKey: String) async -> Bool { false }
}
