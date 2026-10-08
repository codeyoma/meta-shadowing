import XCTest
@testable import LearningReference
@testable import MetaShadowingNative

final class SentenceRelationGeometryTests: XCTestCase {
    func testNestedRelationLabelsDoNotOverlapAtNormalOrAccessibilitySizes() {
        let edges = [(0, 7), (1, 6), (2, 3), (3, 4), (4, 5), (5, 6), (6, 7)]
            .map { RelationEdge(dependent: $0.0, head: $0.1, label: "NSUBJ") }
        let boxes = Dictionary(uniqueKeysWithValues: (0...7).map {
            ($0, CGRect(x: $0 * 100, y: 0, width: 80, height: 60))
        })
        for size in [CGSize(width: 35, height: 14), CGSize(width: 90, height: 32)] {
            let curves = SentenceRelationGeometry.curves(edges: edges, boxes: boxes, height: 96 * size.height / 14)
            let sizes = Dictionary(uniqueKeysWithValues: edges.map { ($0.id, size) })
            let positions = SentenceRelationGeometry.labelPositions(curves: curves, sizes: sizes)
            let frames = edges.map { edge in
                let point = positions[edge.id]!
                return CGRect(x: point.x - size.width / 2, y: point.y - size.height / 2,
                              width: size.width, height: size.height)
            }
            for first in frames.indices {
                for second in frames.indices where second > first {
                    XCTAssertFalse(frames[first].intersects(frames[second]), "Labels \(first) and \(second) must not overlap at \(size)")
                }
                XCTAssertGreaterThanOrEqual(frames[first].minY, 0)
                XCTAssertLessThanOrEqual(frames[first].maxY, 96 * size.height / 14)
            }
        }
    }

    func testFourIncomingRelationsLandInFourSeparateTargetSections() {
        let edges = [0, 1, 3, 4].map { RelationEdge(dependent: $0, head: 2, label: "AUX") }
        let boxes = Dictionary(uniqueKeysWithValues: (0...4).map {
            ($0, CGRect(x: $0 * 100, y: 0, width: 80, height: 60))
        })
        let curves = SentenceRelationGeometry.curves(edges: edges, boxes: boxes, height: 96)
        XCTAssertEqual(curves.map(\.edge.dependent), [0, 1, 3, 4])
        // Target content spans x=208...272 after its existing 8pt word padding.
        XCTAssertEqual(curves.map(\.end.x), [216, 232, 248, 264])
        XCTAssertEqual(curves.map(\.start.x), [40, 140, 340, 440])
        XCTAssertEqual(curves.map(\.edge.head), [2, 2, 2, 2], "Do not reverse dependency direction")
    }

    func testRoutingIsStableForEdgeOrderAndUsesTheFullGraph() {
        let edges = [4, 0, 3, 1].map { RelationEdge(dependent: $0, head: 2, label: "NSUBJ") }
        let boxes = Dictionary(uniqueKeysWithValues: (0...4).map {
            ($0, CGRect(x: $0 * 100, y: 0, width: 80, height: 60))
        })
        let curves = SentenceRelationGeometry.curves(edges: edges, boxes: boxes, height: 96)
        let ports = Dictionary(uniqueKeysWithValues: curves.map { ($0.edge.dependent, $0.end.x) })
        XCTAssertEqual(ports, [0: 216, 1: 232, 3: 248, 4: 264])
        XCTAssertTrue(curves.allSatisfy { $0.control2.y < $0.end.y }, "Each arrow approaches its target from above")
    }
}
