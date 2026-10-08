import Testing
@testable import LearningReference
@testable import MetaShadowingNative
import CoreGraphics

struct SentenceRelationPortTests {
    @Test(arguments: [1, 3])
    func incomingAndOutgoingEdgesShareDistinctEvenlySpacedPorts(incomingCount: Int) throws {
        let incoming = [0, 1, 3].prefix(incomingCount).map {
            RelationEdge(dependent: $0, head: 2, label: "DET")
        }
        let outgoing = RelationEdge(dependent: 2, head: 4, label: "POBJ")
        let curves = SentenceRelationGeometry.curves(edges: incoming + [outgoing], boxes: boxes, height: 96)
        let departure = try #require(curves.first { $0.edge.dependent == 2 })
        let arrivals = curves.filter { $0.edge.head == 2 }.map(\.end.x)
        let ports = (arrivals + [departure.start.x]).sorted()
        // Word 2's padded span is 208...272. Divide it among all incident edges.
        let expected: [CGFloat] = incomingCount == 1 ? [224, 256] : [216, 232, 248, 264]
        #expect(ports == expected)
        #expect(!arrivals.contains(departure.start.x))
        #expect(departure.end.x == 440, "Keep the dependent-to-head direction")
    }

    @Test(arguments: [[0, 1, 2, 3], [3, 2, 1, 0], [2, 0, 3, 1]])
    func mixedPortsRemainStableWhenEdgeOrderChanges(order: [Int]) throws {
        let edges = [
            RelationEdge(dependent: 0, head: 2, label: "NSUBJ"),
            RelationEdge(dependent: 1, head: 2, label: "AUX"),
            RelationEdge(dependent: 2, head: 4, label: "POBJ"),
            RelationEdge(dependent: 3, head: 2, label: "DET")
        ]
        let curves = SentenceRelationGeometry.curves(edges: order.map { edges[$0] }, boxes: boxes, height: 96)
        let starts: [Int: CGFloat] = [0: 40, 1: 140, 2: 264, 3: 340]
        let ends: [Int: CGFloat] = [0: 216, 1: 232, 2: 440, 3: 248]
        #expect(curves.count == 4)
        for curve in curves {
            #expect(curve.start.x == starts[curve.id])
            #expect(curve.end.x == ends[curve.id])
        }
    }

    @Test func arrivalAndDepartureTowardTheSameSideHaveSeparatePorts() throws {
        let edges = [RelationEdge(dependent: 1, head: 2, label: "DET"),
                     RelationEdge(dependent: 2, head: 0, label: "POBJ")]
        let curves = SentenceRelationGeometry.curves(edges: edges, boxes: boxes, height: 96)
        let arrival = try #require(curves.first { $0.edge.dependent == 1 })
        let departure = try #require(curves.first { $0.edge.dependent == 2 })
        #expect(departure.start.x == 224)
        #expect(arrival.end.x == 256)
        #expect(departure.end.x == 40)
    }

    private var boxes: [Int: CGRect] {
        Dictionary(uniqueKeysWithValues: (0...4).map {
            ($0, CGRect(x: $0 * 100, y: 0, width: 80, height: 60))
        })
    }
}
