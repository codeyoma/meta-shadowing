import CoreGraphics
import LearningReference

/// Drawing values are computed during the view update, before Canvas renders.
nonisolated struct SentenceRelationCurve: Identifiable {
    let edge: RelationEdge
    let start: CGPoint
    let end: CGPoint
    let control1: CGPoint
    let control2: CGPoint
    var id: Int { edge.id }
    func point(at fraction: CGFloat) -> CGPoint {
        let remaining = 1 - fraction
        let a = remaining * remaining * remaining
        let b = 3 * remaining * remaining * fraction
        let c = 3 * remaining * fraction * fraction
        let d = fraction * fraction * fraction
        return CGPoint(x: a * start.x + b * control1.x + c * control2.x + d * end.x,
                       y: a * start.y + b * control1.y + c * control2.y + d * end.y)
    }
}

nonisolated enum SentenceRelationGeometry {
    static func labelPositions(curves: [SentenceRelationCurve], sizes: [Int: CGSize]) -> [Int: CGPoint] {
        var positions: [Int: CGPoint] = [:]
        var occupied: [CGRect] = []
        // Short arcs have fewer usable positions. Lay them out first, independently of selection.
        let ordered = curves.sorted {
            let lhs = abs($0.end.x - $0.start.x), rhs = abs($1.end.x - $1.start.x)
            return lhs == rhs ? $0.id < $1.id : lhs < rhs
        }
        let fractions: [CGFloat] = [0.5, 0.45, 0.55, 0.4, 0.6, 0.35, 0.65, 0.3, 0.7, 0.25, 0.75, 0.2, 0.8]
        for curve in ordered {
            guard let size = sizes[curve.id] else { continue }
            var best: CGRect?
            var leastOverlap = CGFloat.infinity
            for fraction in fractions {
                let point = curve.point(at: fraction)
                let frame = CGRect(x: point.x - size.width / 2, y: max(0, point.y - size.height - 4),
                                   width: size.width, height: size.height)
                let padded = frame.insetBy(dx: -3, dy: -2)
                let overlap = occupied.reduce(CGFloat.zero) { total, other in
                    let intersection = padded.intersection(other)
                    return total + (intersection.isNull ? 0 : intersection.width * intersection.height)
                }
                if overlap < leastOverlap { best = frame; leastOverlap = overlap }
                if overlap == 0 { break }
            }
            if let best {
                positions[curve.id] = CGPoint(x: best.midX, y: best.midY)
                occupied.append(best.insetBy(dx: -3, dy: -2))
            }
        }
        return positions
    }

    static func curves(edges: [RelationEdge], boxes: [Int: CGRect], height: CGFloat) -> [SentenceRelationCurve] {
        var connections: [Int: [(edgeID: Int, peer: Int)]] = [:]
        for edge in edges {
            connections[edge.dependent, default: []].append((edge.id, edge.head))
            connections[edge.head, default: []].append((edge.id, edge.dependent))
        }
        var ports: [Int: [Int: CGFloat]] = [:]
        // Departures and arrivals share one allocation, so neither can occupy the other's port.
        for (word, incident) in connections {
            guard let box = boxes[word] else { continue }
            let ordered = incident.sorted {
                let left = boxes[$0.peer]?.midX ?? CGFloat($0.peer)
                let right = boxes[$1.peer]?.midX ?? CGFloat($1.peer)
                return left == right ? $0.edgeID < $1.edgeID : left < right
            }
            let inset = min(8, box.width / 4)
            let width = box.width - 2 * inset
            for (index, connection) in ordered.enumerated() {
                ports[word, default: [:]][connection.edgeID] = box.minX + inset
                    + width * (CGFloat(index) + 0.5) / CGFloat(ordered.count)
            }
        }
        return edges.compactMap { edge in
            guard let from = boxes[edge.dependent], let to = boxes[edge.head] else { return nil }
            let start = CGPoint(x: ports[edge.dependent]?[edge.id] ?? from.midX, y: height)
            let end = CGPoint(x: ports[edge.head]?[edge.id] ?? to.midX, y: height)
            let rise = min(height - 8, 20 + abs(end.x - start.x) * 0.2)
            return SentenceRelationCurve(edge: edge, start: start, end: end,
                control1: CGPoint(x: start.x, y: height - rise),
                control2: CGPoint(x: end.x, y: height - rise))
        }
    }
}
