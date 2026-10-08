import AppFoundation
import SwiftUI

/// Transfer and stage progress share one place; ready bytes do not imply ready learning.
struct BookCardProgress: View {
    let summary: BookStudySummary
    let download: DownloadModel?
    var body: some View {
        HStack {
            if let download, download.busy {
                ProgressView(value: download.status.progress)
                    .tint(BrandStyle.yellow)
                    .accessibilityLabel("다운로드 진행률")
                    .accessibilityIdentifier("download-progress-\(summary.id)")
                Text(download.status.progress, format: .percent.precision(.fractionLength(0)))
                    .font(.caption.bold()).monospacedDigit().foregroundStyle(.primary)
            } else {
                ProgressView(value: Double(summary.completedStages), total: 16)
                    .tint(BrandStyle.green)
                    .accessibilityLabel("완료한 스테이지")
                    .accessibilityValue("\(summary.completedStages)/16")
                    .accessibilityIdentifier("stage-progress-\(summary.id)")
                Text("\(summary.completedStages)/16").font(.caption.bold()).monospacedDigit().foregroundStyle(.primary)
            }
        }
    }
}
