import AppFoundation
import SwiftUI

/// App Store-style acquisition: a labeled download, determinate progress that
/// also cancels, an actionable retry and removal from the manage menu.
struct BookDownloadActions: View {
    let services: ProductServicesModel
    let download: DownloadModel
    let summary: BookStudySummary
    let select: () -> Void
    let remove: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if download.busy {
                HStack(spacing: 12) {
                    Button { Task { await services.cancelDownload(download.key) } } label: {
                        DownloadProgressRing(progress: download.status.progress)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("다운로드 취소")
                    .accessibilityValue(Text(download.status.progress, format: .percent.precision(.fractionLength(0))))
                    Text(download.status.progress, format: .percent.precision(.fractionLength(0)))
                        .font(.subheadline).monospacedDigit().foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }.frame(maxWidth: .infinity, minHeight: 50)
            } else if summary.available {
                HStack(spacing: 8) {
                    BookStudyButton(summary: summary, select: select)
                    Menu {
                        Button("다운로드 삭제", systemImage: "trash", role: .destructive, action: remove)
                    } label: {
                        Image(systemName: "ellipsis").frame(minWidth: 44, minHeight: 44).contentShape(.rect)
                    }
                    .accessibilityLabel("도서 관리")
                    .accessibilityIdentifier("manage-\(download.key)")
                }
            } else {
                Button { services.download(download.key) } label: {
                    Label(download.failed ? "다시 시도" : "다운로드",
                          systemImage: download.failed ? "arrow.clockwise" : "icloud.and.arrow.down")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.primaryAction)
                .accessibilityLabel(download.failed ? "다운로드 다시 시도" : "다운로드")
                .accessibilityIdentifier("download-\(download.key)")
                if download.failed || download.status.phase == "unavailable" {
                    Text("자료를 받을 수 없어요. 연결과 서비스 설정을 확인해 주세요.").font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }
}

/// A determinate ring around a stop glyph, matching the system download control.
struct DownloadProgressRing: View {
    let progress: Double
    @ScaledMetric(relativeTo: .body) private var size = 32
    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: 3)
            Circle().trim(from: 0, to: max(0.02, min(1, progress)))
                .stroke(.tint, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                .rotationEffect(.degrees(-90))
            Image(systemName: "stop.fill").font(.system(size: size * 0.32)).foregroundStyle(.tint)
        }
        .frame(width: size, height: size)
        .frame(minWidth: 44, minHeight: 44)
        .contentShape(.rect)
        .animation(.linear(duration: 0.2), value: progress)
    }
}
