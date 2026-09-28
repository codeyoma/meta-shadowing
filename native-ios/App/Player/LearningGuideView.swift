import SwiftUI
struct LearningGuideView: View {
    let stage: Int
    var body: some View {
        List {
            Text("Lv \((stage + 1) / 2)")
            Text(StageMethod.title(stage))
        }.navigationTitle("학습 안내")
    }
}
