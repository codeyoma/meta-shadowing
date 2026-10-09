import SwiftUI
import Testing
import UIKit
import XCTest
import Vision
@testable import LearningReference
@testable import MetaShadowingNative

@MainActor final class SentenceGraphRenderingTests: XCTestCase {
    func testArrowsRenderOnFirstLayoutWithoutSelectingAToken() async throws {
        try await checkGraph(checkLabels: false)
    }

    func testRelationsAreWrittenAboveArcsBeforeSelection() async throws {
        try await checkGraph(checkLabels: true)
    }

    private func checkGraph(checkLabels: Bool) async throws {
        let sentence = AnalysisSentence(id: "initial", sourceIndex: 0, text: "We must learn", tokens: [
            AnalysisToken(text: "We", offset: 0, pos: "PRON", head: 2, relation: "NSUBJ"),
            AnalysisToken(text: "must", offset: 3, pos: "VERB", head: 2, relation: "AUX"),
            AnalysisToken(text: "learn", offset: 8, pos: "VERB", head: 2, relation: "ROOT")
        ])
        let scene = try XCTUnwrap(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.windowLevel = .alert
        window.overrideUserInterfaceStyle = .light
        let host = UIHostingController(rootView:
            SentenceRelationGraphView(sentence: sentence, selected: nil, select: { _ in
                XCTFail("Initial arrows must not depend on a token interaction")
            })
            .environment(\.dynamicTypeSize, .large)
            .frame(width: 360).frame(maxHeight: .infinity, alignment: .top)
            .background(Color.white).ignoresSafeArea())
        window.rootViewController = host
        window.isHidden = false
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.layoutIfNeeded()

        // Allow normal layout to settle, without changing any graph state or selection.
        var image = capture(host.view)
        let deadline = ContinuousClock.now + .seconds(2)
        while try ink(in: image, area: CGRect(x: 32, y: 65, width: 300, height: 75)) < 50,
              ContinuousClock.now < deadline {
            try await Task.sleep(for: .milliseconds(30))
            image = capture(host.view)
        }
        let attachment = XCTAttachment(image: image)
        attachment.name = "Unselected graph on first layout"
        attachment.lifetime = .keepAlways
        add(attachment)
        XCTAssertGreaterThan(try ink(in: image, area: CGRect(x: 32, y: 65, width: 300, height: 75)), 50,
                             "The arc region must contain visible relations before any tap")
        if checkLabels {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]
            let rendered = try XCTUnwrap(capture(host.view, scale: 3).cgImage)
            // Limit OCR to the arc labels, excluding the much larger token/POS text below.
            request.regionOfInterest = CGRect(x: 0, y: 1 - 140 / host.view.bounds.height,
                width: 1, height: 75 / host.view.bounds.height)
            try VNImageRequestHandler(cgImage: rendered).perform([request])
            let labels = (request.results ?? []).compactMap { $0.topCandidates(1).first?.string.lowercased() }
            XCTAssertTrue(labels.contains { $0.contains("nsubj") }, "The subject label must visibly render on its arc: \(labels)")
            XCTAssertTrue(labels.contains { $0.contains("aux") }, "The auxiliary label must visibly render on its arc: \(labels)")
        }
    }

    private func capture(_ view: UIView, scale: CGFloat = 1) -> UIImage {
        let format = UIGraphicsImageRendererFormat(); format.scale = scale
        return UIGraphicsImageRenderer(bounds: view.bounds, format: format).image { _ in
            view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
        }
    }

    private func ink(in image: UIImage, area: CGRect) throws -> Int {
        let cgImage = try XCTUnwrap(image.cgImage)
        let width = cgImage.width, height = cgImage.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        try pixels.withUnsafeMutableBytes { buffer in
            let context = try XCTUnwrap(CGContext(data: buffer.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(cgImage, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        var count = 0
        for y in Int(area.minY)..<min(height, Int(area.maxY)) {
            for x in Int(area.minX)..<min(width, Int(area.maxX)) {
                let offset = (y * width + x) * 4
                if min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 220 { count += 1 }
            }
        }
        return count
    }
}

@Suite(.serialized) @MainActor struct SentenceArrowheadRenderingTests {
    @Test(arguments: [false, true], [false, true])
    func destinationTipsHaveFilledTriangularSilhouettes(selected: Bool, dark: Bool) async throws {
        let sentence = AnalysisSentence(id: "tips", sourceIndex: 0, text: "We learn", tokens: [
            AnalysisToken(text: "We", offset: 0, pos: "PRON", head: 1, relation: "NSUBJ"),
            AnalysisToken(text: "learn", offset: 3, pos: "VERB", head: 1, relation: "ROOT")
        ])
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 390, height: 844)
        window.windowLevel = .alert
        window.overrideUserInterfaceStyle = dark ? .dark : .light
        let host = UIHostingController(rootView:
            SentenceRelationGraphView(sentence: sentence, selected: selected ? 1 : nil, select: { _ in })
                .environment(\.dynamicTypeSize, .large)
                .environment(\.colorScheme, dark ? .dark : .light)
                .tint(.red)
                .frame(width: 360).frame(maxHeight: .infinity, alignment: .top)
                .background(dark ? Color.black : .white).ignoresSafeArea())
        window.rootViewController = host
        window.isHidden = false
        defer { window.isHidden = true; window.rootViewController = nil }
        host.view.layoutIfNeeded()

        // Inspect the real Canvas, not a separately reconstructed test arrow.
        let deadline = ContinuousClock.now + .seconds(2)
        var tipWidth: Int?
        repeat {
            let format = UIGraphicsImageRendererFormat()
            format.scale = 3
            let image = UIGraphicsImageRenderer(bounds: host.view.bounds, format: format).image { _ in
                host.view.drawHierarchy(in: host.view.bounds, afterScreenUpdates: true)
            }
            tipWidth = try filledTipPixelWidth(image, dark: dark)
            if tipWidth != nil || ContinuousClock.now >= deadline {
                Attachment.record(image, named: "Arrow tip selected-\(selected) dark-\(dark)")
                break
            }
            try await Task.sleep(for: .milliseconds(30))
        } while ContinuousClock.now < deadline
        let width = try #require(tipWidth,
            "Destination arrowheads must have a solid interior, not an open V (selected: \(selected), dark: \(dark))")
        #expect(width <= 3,
            "At 3x, the last visible tip row must taper to at most one point; the shaft must not leave a flat end (selected: \(selected), dark: \(dark))")
    }

    private func filledTipPixelWidth(_ image: UIImage, dark: Bool) throws -> Int? {
        let bitmap = try #require(image.cgImage)
        let width = bitmap.width, height = bitmap.height
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        try pixels.withUnsafeMutableBytes { buffer in
            let context = try #require(CGContext(data: buffer.baseAddress, width: width, height: height,
                bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo.byteOrder32Big.rawValue | CGImageAlphaInfo.premultipliedLast.rawValue))
            context.draw(bitmap, in: CGRect(x: 0, y: 0, width: width, height: height))
        }
        func ink(_ x: Int, _ y: Int) -> Bool {
            let offset = (y * width + x) * 4
            let channels = pixels[offset..<(offset + 3)]
            return dark ? channels.max()! > 100 : channels.min()! < 180
        }
        // At 3x, a downward solid tip has a broad filled base, narrowing toward
        // its point. Sample away from the central shaft and both sloping edges.
        // Hollow chevrons and the thin curved shaft cannot fill this interior.
        for y in (65 * 3)..<(140 * 3) {
            for x in (40 * 3)..<(320 * 3) {
                let baseFilled = (-9...9).allSatisfy { ink(x + $0, y) && ink(x + $0, y + 1) }
                guard baseFilled else { continue }
                let middleFilled = (-5...5).allSatisfy { ink(x + $0, y + 6) }
                if middleFilled && ink(x, y + 15)
                    && !ink(x - 12, y + 6) && !ink(x + 12, y + 6) {
                    // The word starts well below this band. Find the last visible
                    // row of this isolated tip, including any protruding shaft.
                    let columns = (x - 15)...(x + 15)
                    let lastRow = ((y + 12)...(y + 28)).last { row in
                        columns.contains { ink($0, row) }
                    }
                    return lastRow.map { row in columns.filter { ink($0, row) }.count }
                }
            }
        }
        return nil
    }
}
