import AppFoundation
import LearningReference
import SwiftUI

struct AnalysisDetailView: View {
    let model: AnalysisModel
    let sentenceID: String
    let flow: LearningFlow
    var body: some View {
        Group {
            if let sentence = model.selectedSentence, sentence.id == sentenceID {
                ScrollView {
                    VStack(alignment: .leading, spacing: 32) {
                        HStack(alignment: .center) {
                            Text(sentence.text).font(.title2).frame(maxWidth: .infinity, alignment: .leading)
                            SentenceCopyButton(text: sentence.text)
                        }.padding().background(.background, in: .rect(cornerRadius: 16))
                        SentenceRelationGraphView(sentence: sentence, selected: model.selectedToken, select: model.selectToken)
                        AnalysisRelationsView(sentence: sentence, selected: model.selectedToken)
                        AnalysisDictionaryButton(model: model, flow: flow)
                    }.padding()
                }.background(Color(uiColor: .systemGroupedBackground)).accessibilityIdentifier("analysis-detail-scroll")
            } else { ContentUnavailableView("문장 분석을 사용할 수 없어요", systemImage: "text.magnifyingglass") }
        }
        .navigationTitle("문장 관계")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("닫기") { flow.dismissOptions() }.accessibilityIdentifier("options-close")
            }
        }
        .background { DictionaryHost(presenter: flow.analysisPresenter).frame(width: 0, height: 0) }
        .onChange(of: model.selectedToken) { _, _ in flow.analysisDictionary.cancel() }
        .onAppear { model.selectSentence(sentenceID) }
        .onDisappear { flow.analysisDictionary.cancel(); model.selectSentence(nil) }
    }
}
private struct AnalysisRelationsView: View {
    let sentence: AnalysisSentence
    let selected: Int?
    var body: some View {
        let relations = SentenceRelations.project(sentence, selected: selected)
        VStack(alignment: .leading, spacing: 16) {
            if selected == nil { Text("단어를 선택하면 연결 관계를 볼 수 있어요.").foregroundStyle(.secondary) }
            else {
                if relations.root { Text("문장의 중심어 (root)입니다.") }
                ForEach(relations.edges) { edge in
                    VStack(alignment: .leading, spacing: 8) {
                        Text("\(sentence.tokens[edge.dependent].text) → \(sentence.tokens[edge.head].text): \(edge.name) (\(AnalysisVocabulary.englishRelation(edge.label)))").bold()
                        Text(edge.explanation)
                    }.padding().frame(maxWidth: .infinity, alignment: .leading)
                        .background(.background, in: .rect(cornerRadius: 16))
                }
            }
        }
    }
}
