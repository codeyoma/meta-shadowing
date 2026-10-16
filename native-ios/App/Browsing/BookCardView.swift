import AppFoundation
import SwiftUI

/// The card is one native action; its management menu is a separate sibling hit target.
struct BookCardView: View {
    let summary: BookStudySummary
    var services: ProductServicesModel? = nil
    let select: () -> Void
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
                        BookManagementMenu(summary: summary, services: services)
                    }.padding(4)
                    Spacer(minLength: 0)
                    BookCardProgress(summary: summary, download: download)
                        .padding(12).allowsHitTesting(false)
                }
            }
        }
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
                Text(recoveryMessage ?? String(localized: "총 \(summary.book.sentenceCount)문장"))
                    .font(.caption).foregroundStyle(.secondary)
                    .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 1)
                    .fixedSize(horizontal: false, vertical: true)
                // Reserve exactly the visible sibling progress row's Dynamic Type height.
                BookCardProgress(summary: summary, download: download).hidden().accessibilityHidden(true)
            }.padding([.horizontal, .bottom], 12)
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(.rect(cornerRadius: 16))
        .contentShape(.rect(cornerRadius: 16))
    }
    private func primaryAction() {
        guard canActivate else { return }
        if summary.available { select() }
        else if let services, let download { services.download(download.key) }
    }
}
