import AppFoundation
import SwiftUI

struct AnalysisBrowserView: View {
    let flow: LearningFlow
    var body: some View {
        Group {
            if let model = flow.analysis {
                switch model.state {
                case .loading: ProgressView("문장 분석 로딩 중")
                case .unavailable:
                    ContentUnavailableView("문장 분석을 사용할 수 없어요", systemImage: "text.magnifyingglass",
                        description: Text("설치된 분석 자료와 접근 권한을 확인해 주세요."))
                case .ready:
                    List(model.sentences) { sentence in
                        NavigationLink {
                            AnalysisDetailView(model: model, sentenceID: sentence.id, flow: flow)
                        } label: {
                            Text(sentence.text).padding(.vertical, 8)
                        }.accessibilityIdentifier("analysis-sentence-\(sentence.id)")
                    }
                }
            } else { ProgressView("문장 분석 로딩 중") }
        }
        .navigationTitle("문장 분석")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("닫기") { flow.dismissOptions() }.accessibilityIdentifier("options-close")
            }
        }
        .task { if flow.analysis == nil { await flow.loadAnalysis() } }
    }
}
