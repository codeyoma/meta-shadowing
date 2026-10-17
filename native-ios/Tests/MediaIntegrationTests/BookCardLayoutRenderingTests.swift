import AppleServices
import LearningPersistence
import SwiftUI
import UIKit
import XCTest
@testable import AppFoundation
@testable import MetaShadowingNative

@MainActor final class BookCardLayoutRenderingTests: XCTestCase {
    func testShortAndLongTitlesReserveTheSameTwoLineCardHeight() {
        for width in [136.0, 177.0, 196.0] {
            for textSize in [DynamicTypeSize.large, .xxxLarge] {
                let baseline = height(title: "Two\nlines", width: width, textSize: textSize)
                for title in ["Short", "A long book title that extends beyond two lines"] {
                    XCTAssertEqual(height(title: title, width: width, textSize: textSize), baseline, accuracy: 0.5,
                                   "Title length must not change card height at width \(width), \(textSize)")
                }
            }
        }
    }

    func testDownloadRecoveryReusesTheSentenceCountRowWithoutChangingHeight() throws {
        let root = URL.temporaryDirectory.appending(path: UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let sample = Bundle.main.bundleURL.appending(path: "sample")
        let (package, _) = try ServiceTestAssets.package(root: sample)
        let store = SQLiteLearningStore(root: root)
        let services = ProductServicesModel(
            profiles: ProductProfileOwner(store: store, catalog: BundledProductCatalog(root: sample)),
            store: store, delivery: try ContentDelivery(root: root.appending(path: "content"), packages: [package]),
            transport: ServiceTestCloud(available: false), packages: [package])
        let download = try XCTUnwrap(services.downloads[package.descriptor.key])

        for width in [136.0, 177.0, 196.0] {
            for textSize in [DynamicTypeSize.large, .xxxLarge] {
                let baseline = height(width: width, textSize: textSize)
                for state in ["idle", "unavailable", "failed", "downloading", "missing"] {
                    download.status = DeliveryStatus(phase: state, progress: 0.5)
                    download.failed = state == "failed"
                    download.busy = state == "downloading"
                    let actual = height(width: width, textSize: textSize, available: false,
                                        services: state == "missing" ? nil : services, key: package.descriptor.key)
                    XCTAssertEqual(actual, baseline, accuracy: 0.5,
                                   "\(state) must reuse one information row at width \(width), \(textSize)")
                }
            }
        }
    }

    func testAccessibilityTextCanGrowToKeepLongTitlesAndRecoveryReadable() {
        let short = height(width: 288, textSize: .accessibility5)
        let long = height(title: "A long book title that needs more than two lines", width: 288, textSize: .accessibility5)
        XCTAssertGreaterThan(long, short, "The single-column accessibility layout must not truncate long titles")
        XCTAssertGreaterThan(height(width: 288, textSize: .accessibility5, available: false), short,
                             "Recovery instructions remain readable at accessibility sizes")
    }

    private func height(title: String = "Short", width: CGFloat, textSize: DynamicTypeSize,
                        available: Bool = true, services: ProductServicesModel? = nil, key: String = "card") -> CGFloat {
        let summary = BookStudySummary(book: CatalogBook(id: key, book: "card", language: "english",
                                                        title: title, sentenceCount: 560),
                                       completedRuns: [:], checkpoints: [:], available: available)
        let host = UIHostingController(rootView: BookCardView(summary: summary, services: services, select: {})
            .environment(\.dynamicTypeSize, textSize).environment(\.locale, Locale(identifier: "ko_KR")))
        let size = host.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude))
        XCTAssertEqual(size.width, width, accuracy: 0.5)
        XCTAssertGreaterThan(size.height, 0)
        return size.height
    }
}
