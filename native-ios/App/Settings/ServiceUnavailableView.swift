import SwiftUI

struct ServiceUnavailableView: View {
    let title: String
    let ticket: String
    var body: some View {
        ContentUnavailableView(title, systemImage: "wrench.and.screwdriver",
            description: Text("네이티브 연결을 준비하고 있어요 (\(ticket)). 현재 자료와 학습 기록은 변경하지 않아요."))
            .navigationTitle(title)
    }
}
