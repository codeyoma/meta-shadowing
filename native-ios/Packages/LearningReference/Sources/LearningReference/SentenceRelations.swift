public struct RelationEdge: Identifiable, Equatable, Sendable {
    public var id: Int { dependent }
    public let dependent: Int
    public let head: Int
    public let label: String
    public var name: String { AnalysisVocabulary.relation(label) }
    public var explanation: String { AnalysisVocabulary.explanation(label) }
}
public struct RelationSelection: Equatable, Sendable {
    public let edges: [RelationEdge]
    public let connected: [Int]
    public let root: Bool
}
public enum SentenceRelations {
    public static func project(_ sentence: AnalysisSentence, selected: Int?) -> RelationSelection {
        if let selected, !sentence.tokens.indices.contains(selected) {
            return RelationSelection(edges: [], connected: [], root: false)
        }
        var edges: [RelationEdge] = []
        var connected = Set(selected.map { [$0] } ?? [])
        for (index, token) in sentence.tokens.enumerated() {
            guard sentence.tokens.indices.contains(token.head), token.head != index, token.relation != "ROOT",
                  selected == nil || selected == index || selected == token.head else { continue }
            edges.append(RelationEdge(dependent: index, head: token.head, label: token.relation))
            if selected != nil { connected.insert(index); connected.insert(token.head) }
        }
        let root = selected.map { sentence.tokens[$0].relation == "ROOT" && sentence.tokens[$0].head == $0 } ?? false
        return RelationSelection(edges: edges, connected: connected.sorted(), root: root)
    }
}
