import AppFoundation
import LearningPersistence
import SwiftUI
import UIKit
import XCTest
@testable import MetaShadowingNative

@MainActor final class BookshelfSelectionRenderingTests: XCTestCase {
    func testPendingSelectionKeepsBookshelfUndimmed() async throws {
        for dark in [false, true] {
            try await checkPendingSelection(dark: dark)
        }
    }

    private func checkPendingSelection(dark: Bool) async throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let catalog = HeldBookshelfCatalog()
        let store = SQLiteLearningStore(root: root)
        let model = ProductModel(workspace: ProductWorkspace(store: store, catalog: catalog, profileID: "bookshelf"))
        await model.activate()
        let committed = try XCTUnwrap(model.snapshot)
        XCTAssertTrue(try XCTUnwrap(committed.books.first).available)

        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 874)
        window.windowLevel = .alert
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        let controller = UIHostingController(rootView: ProductTabsView(model: model))
        window.rootViewController = controller
        window.isHidden = false
        defer {
            model.deactivate()
            window.isHidden = true
            window.rootViewController = nil
        }
        controller.view.layoutIfNeeded()
        try await Task.sleep(for: .milliseconds(250))
        // Exclude the native navigation and tab bars; sample the actual bookshelf content.
        let frame = CGRect(x: 0, y: 180, width: controller.view.bounds.width,
                           height: controller.view.bounds.height - 300).integral
        let before = try capture(controller.view, frame: frame)
        XCTAssertGreaterThan(colorfulness(before.bytes), 1, "The book artwork must actually render before comparison")

        await catalog.holdNextSelection()
        let selection = Task { await model.select(language: "english", packageKey: "morning-notes-v1") }
        defer { selection.cancel() }
        for _ in 0..<100 {
            if await catalog.selectionEntered { break }
            try await Task.sleep(for: .milliseconds(10))
        }
        let entered = await catalog.selectionEntered
        XCTAssertTrue(entered, "The model must start a real asynchronous selection")
        guard entered else { return }
        XCTAssertTrue(model.busy)
        XCTAssertEqual(model.snapshot, committed, "The committed snapshot stays visible during selection")
        try await Task.sleep(for: .milliseconds(200))
        let pending = try capture(controller.view, frame: frame)
        attach(before.image, name: "Bookshelf before selection - \(dark ? "dark" : "light")")
        attach(pending.image, name: "Bookshelf pending selection - \(dark ? "dark" : "light")")
        XCTAssertLessThan(meanDifference(before.bytes, pending.bytes), 0.5,
                          "Pending selection must not gray or dim the rendered Bookshelf card")

        let pendingPreferences = try await store.preferences(profileID: "bookshelf")
        XCTAssertNil(pendingPreferences.libraryPackageKey)
        await catalog.releaseSelection()
        let selected = await selection.value
        XCTAssertTrue(selected)
        XCTAssertFalse(model.busy)
        XCTAssertEqual(model.snapshot?.preferences.libraryPackageKey, "morning-notes-v1")
        let savedPreferences = try await store.preferences(profileID: "bookshelf")
        XCTAssertEqual(savedPreferences.libraryPackageKey, "morning-notes-v1")
        XCTAssertEqual(model.snapshot?.progress.xp, 0, "Book selection never awards practice")
    }

    private func capture(_ view: UIView, frame: CGRect) throws -> (image: UIImage, bytes: [UInt8]) {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let image = UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
        }
        let cropped = try XCTUnwrap(image.cgImage?.cropping(to: frame))
        var bytes = [UInt8](repeating: 0, count: cropped.width * cropped.height * 4)
        try bytes.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: cropped.width, height: cropped.height,
                bitsPerComponent: 8, bytesPerRow: cropped.width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(cropped, in: CGRect(x: 0, y: 0, width: cropped.width, height: cropped.height))
        }
        return (UIImage(cgImage: cropped), bytes)
    }

    private func meanDifference(_ first: [UInt8], _ second: [UInt8]) -> Double {
        guard first.count == second.count else { return .infinity }
        return Double(zip(first, second).reduce(0) { $0 + abs(Int($1.0) - Int($1.1)) }) / Double(first.count)
    }

    private func colorfulness(_ bytes: [UInt8]) -> Double {
        let total = stride(from: 0, to: bytes.count, by: 4).reduce(0) { sum, index in
            let red = Int(bytes[index]), green = Int(bytes[index + 1]), blue = Int(bytes[index + 2])
            return sum + max(red, green, blue) - min(red, green, blue)
        }
        return Double(total) / Double(bytes.count / 4)
    }

    private func attach(_ image: UIImage, name: String) {
        let attachment = XCTAttachment(image: image)
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}

private actor HeldBookshelfCatalog: ProductCatalog {
    private let base = BundledProductCatalog(root: Bundle.main.bundleURL.appending(path: "sample"))
    private var hold = false
    private var continuation: CheckedContinuation<Void, Never>?
    private(set) var selectionEntered = false

    func holdNextSelection() { hold = true }
    func books() async throws -> [CatalogBook] {
        if hold {
            hold = false
            selectionEntered = true
            await withTaskCancellationHandler {
                await withCheckedContinuation { continuation = $0 }
            } onCancel: {
                Task { await self.releaseSelection() }
            }
        }
        return try await base.books()
    }
    func releaseSelection() { continuation?.resume(); continuation = nil }
    func materials(packageKey: String) async throws -> BookMaterials { try await base.materials(packageKey: packageKey) }
    func permitsPractice(packageKey: String) async -> Bool { await base.permitsPractice(packageKey: packageKey) }
}
