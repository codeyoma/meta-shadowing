import LearningDomain
import SwiftUI

struct PreviewLessonView: View {
    let lesson: PreviewLesson

    var body: some View {
        List {
            Section {
                ForEach(lesson.sentences) { sentence in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(sentence.source).font(.headline)
                        Text(sentence.translation).foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("sentence-\(sentence.id)")
                }
            } footer: {
                Text("샘플 문장만 표시해요. 재생·녹음·학습 진행 저장은 후속 단계에서 연결해요.")
            }
        }
        .navigationTitle(lesson.title)
        .navigationBarTitleDisplayMode(.inline)
    }
}
