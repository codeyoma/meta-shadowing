import AppFoundation
import SwiftUI

struct AnalysisDictionaryButton: View {
    let model: AnalysisModel
    let flow: LearningFlow
    var body: some View {
        if let sentence = model.selectedSentence, let index = model.selectedToken {
            let term = sentence.tokens[index].text
            if DictionaryWords.ranges(term) == [NSRange(location: 0, length: term.utf16.count)] {
                Button {
                    Task { await flow.lookupAnalysis(term: term, sentenceID: sentence.id, token: index) }
                } label: {
                    Label("사전 보기", systemImage: "book").frame(maxWidth: .infinity, minHeight: 44)
                }.buttonStyle(.bordered).disabled(flow.analysisDictionary.busy)
                    .accessibilityIdentifier("analysis-dictionary")
                if flow.analysisDictionary.failed { Text("사전을 열지 못했어요. 다시 시도해 주세요.").foregroundStyle(.secondary) }
            }
        }
    }
}
