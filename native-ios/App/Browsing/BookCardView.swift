import AppFoundation
import SwiftUI

/// The card is one native action; its management menu is a separate sibling hit target.
struct BookCardView: View {
    let summary: BookStudySummary
    var services: ProductServicesModel? = nil
    let select: () -> Void
    @State private var removal: ServiceConfirmation?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var download: DownloadModel? { services?.downloads[summary.id] }
    private var busy: Bool { download?.busy == true }
    private var canActivate: Bool {
        !busy && services?.actionBusy != true && (summary.available || download != nil)
    }
    private var actionLabel: String {
        if summary.available { return String(localized: "\(summary.book.title) 학습하기") }
        if download == nil { return String(localized: "\(summary.book.title) 자료 없음") }
        if download?.failed == true { return String(localized: "\(summary.book.title) 다운로드 다시 시도") }
        return String(localized: "\(summary.book.title) 다운로드")
    }
    private var recoveryMessage: String? {
        guard !summary.available else { return nil }
        if download == nil { return String(localized: "자료를 열 수 없어요. 학습 기록은 그대로 있어요.") }
        if !busy && (download?.failed == true || download?.status.phase == "unavailable") {
            return String(localized: "자료를 받을 수 없어요. 연결과 서비스 설정을 확인해 주세요.")
        }
        return nil
    }
    private var progressLabel: String {
        if let download, busy {
            return String(localized: "다운로드 중 \(download.status.progress.formatted(.percent.precision(.fractionLength(0))))")
        }
        let progress = String(localized: "완료한 스테이지 \(summary.completedStages)/16")
        return recoveryMessage.map { "\(progress). \($0)" } ?? progress
    }
    var body: some View {
        ZStack {
            Button(action: primaryAction) { details }
                .buttonStyle(.plain)
                .disabled(!canActivate)
                .accessibilityLabel(actionLabel)
                .accessibilityValue(progressLabel)
                .accessibilityHint("총 \(summary.book.sentenceCount)문장")
                .accessibilityIdentifier("\(summary.available && !busy ? "book" : "download")-\(summary.id)")
            // Match the card's intrinsic size without nesting controls in its button.
            GeometryReader { _ in
                VStack(spacing: 0) {
                    HStack(alignment: .top, spacing: 0) {
                        BookTagsView(book: summary.book)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(4).allowsHitTesting(false)
                        managementMenu
                    }.padding(4)
                    Spacer(minLength: 0)
                    BookCardProgress(summary: summary, download: download)
                        .padding(12).allowsHitTesting(false)
                }
            }
        }
        .alert("다운로드를 삭제할까요?", item: $removal) { request in
            Button("다운로드 삭제", role: .destructive) { Task { await services?.perform(request) } }
            Button("취소", role: .cancel) { }
        } message: { _ in Text("\(summary.book.title)의 다운로드만 삭제합니다. 학습 기록은 남습니다.") }
    }
    private var details: some View {
        VStack(alignment: .leading, spacing: 8) {
            // The name-only SwiftUI initializer rendered this loose PNG blank on iOS 27.
            Image(uiImage: UIImage(named: "morning-notes") ?? UIImage()).resizable().scaledToFit()
                .saturation(summary.available ? 1 : 0.15)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 8) {
                let title = Text(summary.book.title).font(.headline).foregroundStyle(.primary)
                if dynamicTypeSize.isAccessibilitySize { title.fixedSize(horizontal: false, vertical: true) }
                else { title.lineLimit(2, reservesSpace: true) }
                Text("총 \(summary.book.sentenceCount)문장").font(.caption).foregroundStyle(.secondary)
                if let recoveryMessage { Text(recoveryMessage).font(.caption).foregroundStyle(.secondary) }
                // Reserve exactly the visible sibling progress row's Dynamic Type height.
                BookCardProgress(summary: summary, download: download).hidden().accessibilityHidden(true)
            }.padding([.horizontal, .bottom], 12)
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
        .contentShape(.rect(cornerRadius: 16))
    }
    private var managementMenu: some View {
        Menu {
            if busy, let services, let download {
                Button("다운로드 취소", systemImage: "xmark") {
                    Task { await services.cancelDownload(download.key) }
                }
            }
            Button("삭제하기", systemImage: "trash", role: .destructive, action: requestRemoval)
                .disabled(!summary.available || download == nil || busy || services?.actionBusy == true)
        } label: {
            Image(systemName: "ellipsis")
                .font(.body.weight(.semibold))
                .frame(width: 32, height: 32)
                .background(.regularMaterial, in: .circle)
                .overlay { Circle().strokeBorder(.black.opacity(0.25), lineWidth: 1) }
                .frame(width: 44, height: 44).contentShape(.rect)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.primary)
        .accessibilityLabel("\(summary.book.title) 도서 관리")
        .accessibilityIdentifier("manage-\(summary.id)")
    }
    private func primaryAction() {
        guard canActivate else { return }
        if summary.available { select() }
        else if let services, let download { services.download(download.key) }
    }
    private func requestRemoval() {
        guard let services, let download, summary.available, !busy, !services.actionBusy else { return }
        removal = services.confirmation(.removeDownload(download.key))
    }
}
