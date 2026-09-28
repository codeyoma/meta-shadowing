import LearningReference
import SwiftUI

struct SentenceRelationGraphView: View {
    let sentence: AnalysisSentence
    let selected: Int?
    let select: (Int?) -> Void
    @State private var boxes: [Int: CGRect] = [:]
    @ScaledMetric private var arcHeight: CGFloat = 96
    var body: some View {
        let projection = SentenceRelations.project(sentence, selected: selected)
        VStack(alignment: .leading, spacing: 12) {
            Text("화살표는 역할을 하는 단어에서 연결된 중심어를 향해요.").font(.caption).foregroundStyle(.secondary)
            ScrollView(.horizontal) {
                VStack(spacing: 8) {
                    Canvas { context, size in
                        for edge in SentenceRelations.project(sentence, selected: nil).edges {
                            guard let from = boxes[edge.dependent], let to = boxes[edge.head] else { continue }
                            let start = CGPoint(x: from.midX, y: size.height)
                            let end = CGPoint(x: to.midX, y: size.height)
                            let rise = min(size.height - 8, 20 + abs(end.x - start.x) * 0.2)
                            var path = Path()
                            path.move(to: start)
                            path.addCurve(to: end, control1: CGPoint(x: start.x, y: size.height - rise),
                                          control2: CGPoint(x: end.x, y: size.height - rise))
                            let active = selected == edge.dependent || selected == edge.head
                            context.stroke(path, with: .color(active ? .accentColor : .secondary.opacity(0.5)), lineWidth: active ? 2.5 : 1)
                            var arrow = Path()
                            arrow.move(to: CGPoint(x: end.x - 4, y: end.y - 7)); arrow.addLine(to: end)
                            arrow.addLine(to: CGPoint(x: end.x + 4, y: end.y - 7))
                            context.stroke(arrow, with: .color(active ? .accentColor : .secondary), lineWidth: 2)
                        }
                    }.frame(height: arcHeight).accessibilityHidden(true)
                    HStack(alignment: .top, spacing: 12) {
                        ForEach(Array(sentence.tokens.enumerated()), id: \.element.offset) { index, token in
                            Button { select(index) } label: {
                                VStack(spacing: 6) {
                                    Text(token.text).font(.title3).underline(selected == index)
                                    Text(AnalysisVocabulary.pos(token.pos)).font(.caption)
                                    Text(AnalysisVocabulary.pos(token.pos, english: true)).font(.caption)
                                }.fixedSize().padding(8).frame(minWidth: 44, minHeight: 64)
                                    .foregroundStyle(projection.connected.contains(index) ? Color.accentColor : .primary)
                                    .background(selected == index ? Color.accentColor.opacity(0.12) : .clear, in: .rect(cornerRadius: 8))
                            }.buttonStyle(.plain)
                                .accessibilityLabel("단어 \(index + 1): \(token.text), \(AnalysisVocabulary.pos(token.pos))")
                                .accessibilityAddTraits(selected == index ? .isSelected : [])
                                .accessibilityIdentifier("analysis-token-\(index)")
                                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named("analysis-tokens")) } action: { box in
                                    if boxes[index] != box { boxes[index] = box }
                                }
                        }
                    }.coordinateSpace(name: "analysis-tokens")
                }.fixedSize(horizontal: true, vertical: false).padding(.bottom, 12)
            }.scrollIndicators(.visible).accessibilityIdentifier("analysis-graph")
        }.padding().background(.background, in: .rect(cornerRadius: 16))
    }
}
