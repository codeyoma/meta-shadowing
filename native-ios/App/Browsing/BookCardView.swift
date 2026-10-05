import AppFoundation
import SwiftUI

struct BookCardView: View {
    let summary: BookStudySummary
    var services: ProductServicesModel? = nil
    let select: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            // The name-only SwiftUI initializer rendered this loose PNG blank on iOS 27.
            Image(uiImage: UIImage(named: "morning-notes") ?? UIImage()).resizable().scaledToFit()
                .accessibilityHidden(true)
                .overlay(alignment: .topTrailing) {
                    BookTagsView(book: summary.book).padding(8)
                }
            VStack(alignment: .leading, spacing: 8) {
                let title = Text(summary.book.title).font(.system(.headline, design: .rounded))
                if dynamicTypeSize.isAccessibilitySize { title.fixedSize(horizontal: false, vertical: true) }
                else { title.lineLimit(2, reservesSpace: true) }
                Text("총 \(summary.book.sentenceCount)문장").font(.caption).foregroundStyle(.secondary)
                HStack {
                    ProgressView(value: Double(summary.completedStages), total: 16).tint(BrandStyle.green)
                    Text("\(summary.completedStages)/16").font(.caption.bold()).monospacedDigit()
                }.accessibilityElement(children: .ignore)
                    .accessibilityLabel("완료한 스테이지 \(summary.completedStages)/16")
                if let services, let download = services.downloads[summary.id] {
                    BookDownloadActions(services: services, download: download, summary: summary, select: select)
                } else {
                    Button(action: select) { Image(systemName: "play.fill").font(.subheadline).frame(maxWidth: .infinity) }
                        .buttonStyle(.primaryAction)
                        .accessibilityLabel("\(summary.book.title) 스테이지 선택")
                        .accessibilityIdentifier("book-\(summary.id)")
                }
                if !summary.available && services?.downloads[summary.id] == nil {
                    Label("자료를 확인해 주세요", systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.padding(12)
        }.background(Color(uiColor: .secondarySystemGroupedBackground))
            .compositingGroup().clipShape(.rect(cornerRadius: 16))
    }
}
