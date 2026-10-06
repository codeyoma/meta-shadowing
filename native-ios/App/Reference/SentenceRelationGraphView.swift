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
        let allEdges = SentenceRelations.project(sentence, selected: nil).edges
        VStack(alignment: .leading, spacing: 12) {
            Text("화살표는 역할을 하는 단어에서 연결된 중심어를 향해요.").font(.caption).foregroundStyle(.secondary)
            RelationGraphScroll {
                VStack(spacing: 8) {
                    Canvas { context, size in
                        for edge in allEdges {
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
                                    .foregroundStyle(selected == index ? BrandStyle.ink : projection.connected.contains(index) ? Color.accentColor : .primary)
                                    .background(selected == index ? BrandStyle.yellow : .clear, in: .rect(cornerRadius: 8))
                            }.buttonStyle(.plain)
                                .accessibilityLabel("단어 \(index + 1): \(token.text), \(AnalysisVocabulary.pos(token.pos))")
                                .accessibilityValue(selected != index && projection.connected.contains(index) ? "선택한 단어와 직접 연결됨" : "")
                                .accessibilityHint("이 단어의 관계 보기")
                                .accessibilityAddTraits(selected == index ? .isSelected : [])
                                .accessibilityIdentifier("analysis-token-\(index)")
                                .onGeometryChange(for: CGRect.self) { $0.frame(in: .named("analysis-tokens")) } action: { box in
                                    if boxes[index] != box { boxes[index] = box }
                                }
                        }
                    }.coordinateSpace(name: "analysis-tokens")
                }.fixedSize(horizontal: true, vertical: false).padding(.bottom, 12)
            }
        }.padding().background(.background, in: .rect(cornerRadius: 16))
    }
}

/// Own scroll updates below the graph's invalidation boundary. The cue never fades while idle.
private struct RelationGraphScroll<Content: View>: View {
    @ViewBuilder let content: Content
    @State private var geometry = GraphScrollGeometry()
    var body: some View {
        VStack(spacing: 4) {
            ScrollView(.horizontal) { content }
                .scrollIndicators(.hidden)
                .accessibilityIdentifier("analysis-graph")
                .onScrollGeometryChange(for: GraphScrollGeometry.self) { value in
                    GraphScrollGeometry(viewport: value.containerSize.width, content: value.contentSize.width,
                        offset: value.contentOffset.x + value.contentInsets.leading)
                } action: { _, value in geometry = value }
            if geometry.overflows {
                GeometryReader { track in
                    let width = min(track.size.width, max(24, track.size.width * geometry.viewport / geometry.content))
                    Capsule().fill(.quaternary)
                        .overlay(alignment: .leading) {
                            Capsule().fill(.secondary).frame(width: width)
                                .offset(x: geometry.fraction * (track.size.width - width))
                        }
                }.frame(height: 4).allowsHitTesting(false)
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("그래프 가로 위치")
                    .accessibilityValue("\(Int(geometry.fraction * 100))%")
                    .accessibilityIdentifier("analysis-scroll-position")
            }
        }
    }
}
private nonisolated struct GraphScrollGeometry: Equatable {
    var viewport: CGFloat = 0
    var content: CGFloat = 0
    var offset: CGFloat = 0
    var overflows: Bool { viewport > 0 && content > viewport }
    var fraction: CGFloat { overflows ? min(1, max(0, offset / (content - viewport))) : 0 }
}
