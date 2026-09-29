import AppFoundation
import SwiftUI

struct BookDownloadActions: View {
    let services: ProductServicesModel
    let download: DownloadModel
    let summary: BookStudySummary
    let select: () -> Void
    @State private var removal: ServiceConfirmation?
    var body: some View {
        VStack(spacing: 8) {
            if download.paid && (services.ownershipState.ownership != .owned || services.ownershipState.entitlementIssue != .none) {
                NavigationLink { PurchaseRestoreView(services: services) } label: { Label("구매 확인", systemImage: "lock") }
            } else if download.busy {
                HStack {
                    ProgressView(value: download.status.progress)
                    Text(download.status.progress, format: .percent.precision(.fractionLength(0))).font(.caption).monospacedDigit()
                    Button { Task { await services.cancelDownload(download.key) } } label: { Image(systemName: "xmark.circle") }
                        .accessibilityLabel("다운로드 취소").frame(minWidth: 44, minHeight: 44)
                }
            } else if summary.available {
                Button(action: select) { Image(systemName: "play.fill") }
                    .buttonStyle(LearningActionStyle()).accessibilityLabel("\(summary.book.title) 스테이지 선택")
                    .accessibilityIdentifier("book-\(summary.id)")
                Menu {
                    Button("다운로드 삭제", role: .destructive) { removal = services.confirmation(.removeDownload(download.key)) }
                } label: { Label("도서 관리", systemImage: "ellipsis") }.font(.caption)
                    .accessibilityIdentifier("manage-\(download.key)")
            } else {
                Button { services.download(download.key) } label: {
                    Image(systemName: download.failed ? "arrow.clockwise" : "arrow.down.to.line")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }.accessibilityLabel(download.failed ? "다운로드 다시 시도" : "다운로드")
                    .accessibilityIdentifier("download-\(download.key)")
                if download.failed || download.status.phase == "unavailable" {
                    Text("자료를 받을 수 없어요. 연결과 서비스 설정을 확인해 주세요.").font(.caption).foregroundStyle(.secondary)
                }
            }
        }.alert("다운로드를 삭제할까요?", item: $removal) { request in
            Button("다운로드 삭제", role: .destructive) { Task { await services.perform(request) } }
            Button("취소", role: .cancel) { }
        } message: { _ in Text("\(summary.book.title)의 다운로드만 삭제합니다. 학습 기록과 구매 내역은 남습니다.") }
    }
}
