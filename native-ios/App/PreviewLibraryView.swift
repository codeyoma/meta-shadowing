import LearningDomain
import SwiftUI

struct PreviewLibraryView: View {
    let library: PreviewLibrary

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(library.lessons) { lesson in
                        NavigationLink(value: lesson) {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(lesson.title).font(.headline)
                                Text("총 \(lesson.sentences.count)문장")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityIdentifier("lesson-\(lesson.id)")
                    }
                } header: {
                    Text("개발용 샘플")
                } footer: {
                    Text("Swift 네이티브 기반을 확인하는 화면이에요. 실제 도서와 학습 기록은 불러오지 않아요.")
                }
            }
            .navigationTitle("도서 목록")
            .navigationDestination(for: PreviewLesson.self) { lesson in
                PreviewLessonView(lesson: lesson)
            }
        }
    }
}
