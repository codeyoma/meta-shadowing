import AppFoundation
import SwiftUI

struct BookCardView: View {
    let summary: BookStudySummary
    let select: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image("morning-notes").resizable().scaledToFit()
                .overlay(alignment: .topTrailing) {
                    Label("샘플", systemImage: "book").font(.caption.bold())
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(.regularMaterial, in: .capsule).padding(8)
                }.accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                Text(summary.book.title).font(.system(.headline, design: .rounded)).lineLimit(2, reservesSpace: true)
                Text("총 \(summary.book.sentenceCount)문장").font(.caption).foregroundStyle(.secondary)
                HStack {
                    ProgressView(value: Double(summary.completedStages), total: 16).tint(BrandStyle.green)
                    Text("\(summary.completedStages)/16").font(.caption.bold()).monospacedDigit()
                }.accessibilityElement(children: .ignore)
                    .accessibilityLabel("완료한 스테이지 \(summary.completedStages)/16")
                Button(action: select) { Image(systemName: "play.fill").font(.subheadline) }
                    .buttonStyle(LearningActionStyle())
                    .accessibilityLabel("\(summary.book.title) 스테이지 선택")
                    .accessibilityIdentifier("book-\(summary.id)")
                if !summary.available {
                    Label("자료를 확인해 주세요", systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.padding(12)
        }.background(Color(uiColor: .secondarySystemGroupedBackground))
            .compositingGroup().clipShape(.rect(cornerRadius: 16))
    }
}
