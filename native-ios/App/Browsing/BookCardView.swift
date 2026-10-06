import AppFoundation
import SwiftUI

/// One tappable book. Tapping the artwork or details repeats the primary action;
/// VoiceOver reads the details and reaches that action through its labeled button.
struct BookCardView: View {
    let summary: BookStudySummary
    var services: ProductServicesModel? = nil
    let select: () -> Void
    @State private var removal: ServiceConfirmation?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var download: DownloadModel? { services?.downloads[summary.id] }
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            details
                .onTapGesture(perform: primaryAction)
                .accessibilityElement(children: .contain)
            Group {
                if let services, let download {
                    BookDownloadActions(services: services, download: download, summary: summary,
                                        select: select, remove: requestRemoval)
                } else {
                    BookStudyButton(summary: summary, select: select)
                }
            }.padding([.horizontal, .bottom], 12)
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .compositingGroup().clipShape(.rect(cornerRadius: 16))
        .contentShape(.contextMenuPreview, .rect(cornerRadius: 16))
        .contextMenu {
            if summary.available { Button("학습하기", systemImage: "play.fill", action: select) }
            if summary.available, download != nil {
                Button("다운로드 삭제", systemImage: "trash", role: .destructive, action: requestRemoval)
            }
        }
        .alert("다운로드를 삭제할까요?", item: $removal) { request in
            Button("다운로드 삭제", role: .destructive) { Task { await services?.perform(request) } }
            Button("취소", role: .cancel) { }
        } message: { _ in Text("\(summary.book.title)의 다운로드만 삭제합니다. 학습 기록은 남습니다.") }
    }
    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            ZStack(alignment: .topTrailing) {
                // The name-only SwiftUI initializer rendered this loose PNG blank on iOS 27.
                Image(uiImage: UIImage(named: "morning-notes") ?? UIImage()).resizable().scaledToFit()
                    .accessibilityHidden(true) // Only the artwork is decorative; tags are siblings.
                BookTagsView(book: summary.book).padding(8)
            }
            VStack(alignment: .leading, spacing: 8) {
                let title = Text(summary.book.title).font(.headline)
                if dynamicTypeSize.isAccessibilitySize { title.fixedSize(horizontal: false, vertical: true) }
                else { title.lineLimit(2, reservesSpace: true) }
                Text("총 \(summary.book.sentenceCount)문장").font(.caption).foregroundStyle(.secondary)
                HStack {
                    ProgressView(value: Double(summary.completedStages), total: 16).tint(BrandStyle.green)
                    Text("\(summary.completedStages)/16").font(.caption.bold()).monospacedDigit()
                }
                if !summary.available && download == nil {
                    Label("자료를 열 수 없어요. 학습 기록은 그대로 있어요.", systemImage: "exclamationmark.triangle")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }.padding(.horizontal, 12)
        }.contentShape(.rect)
    }
    private func primaryAction() {
        if summary.available { select() }
        else if let services, let download, !download.busy { services.download(download.key) }
    }
    private func requestRemoval() {
        guard let services, let download else { return }
        removal = services.confirmation(.removeDownload(download.key))
    }
}

/// The labeled primary action for an installed or bundled book.
struct BookStudyButton: View {
    let summary: BookStudySummary
    let select: () -> Void
    var body: some View {
        Button(action: select) {
            Label("학습하기", systemImage: "play.fill").frame(maxWidth: .infinity)
        }
        .buttonStyle(.primaryAction)
        .disabled(!summary.available)
        .accessibilityLabel("\(summary.book.title) 학습하기")
        .accessibilityValue("완료한 스테이지 \(summary.completedStages)/16")
        .accessibilityIdentifier("book-\(summary.id)")
    }
}
