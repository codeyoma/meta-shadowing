import AppFoundation
import SwiftUI

/// Download-only management shared by the bookshelf and book's stage detail.
struct BookManagementMenu: View {
    let summary: BookStudySummary
    let services: ProductServicesModel?
    var prominent = false
    @State private var removal: ServiceConfirmation?
    private var download: DownloadModel? { services?.downloads[summary.id] }
    private var busy: Bool { download?.busy == true }
    var body: some View {
        Menu {
            if busy, let services, let download {
                Button("다운로드 취소", systemImage: "xmark") { Task { await services.cancelDownload(download.key) } }
            }
            Button("삭제하기", systemImage: "trash", role: .destructive, action: requestRemoval)
                .disabled(!summary.available || download == nil || busy || services?.actionBusy == true)
        } label: {
            Image(systemName: "ellipsis").font(.body.weight(.semibold))
                .frame(width: prominent ? 44 : 32, height: prominent ? 44 : 32)
                .background(.regularMaterial, in: .circle)
                .overlay { Circle().strokeBorder(.black.opacity(0.25), lineWidth: 1) }
                .frame(width: 44, height: 44).contentShape(.rect)
        }.buttonStyle(.plain).foregroundStyle(.primary)
            .accessibilityLabel("\(summary.book.title) 도서 관리")
            .accessibilityIdentifier("manage-\(summary.id)")
            .alert("다운로드를 삭제할까요?", item: $removal) { request in
                Button("다운로드 삭제", role: .destructive) { Task { await services?.perform(request) } }
                Button("취소", role: .cancel) { }
            } message: { _ in Text("\(summary.book.title)의 다운로드만 삭제합니다. 학습 기록은 남습니다.") }
    }
    private func requestRemoval() {
        guard let services, let download, summary.available, !busy, !services.actionBusy else { return }
        removal = services.confirmation(.removeDownload(download.key))
    }
}
