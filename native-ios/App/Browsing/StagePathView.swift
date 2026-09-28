import AppFoundation
import LearningDomain
import SwiftUI

struct StagePathView: View {
    let summary: BookStudySummary
    let open: (Int) -> Void
    static var testAccess: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(summary.book.title).font(.title2.bold())
                    Text("\(summary.book.sentenceCount)문장").font(.caption).foregroundStyle(.secondary)
                    ProgressView(value: Double(summary.completedStages), total: 16)
                    Text("\(summary.completedStages)/16 스테이지 완료").font(.caption)
                    if !summary.available {
                        Label("자료를 확인할 수 없어요. 도서 목록에서 다시 시도해 주세요.", systemImage: "exclamationmark.triangle")
                    }
                }.padding().background(.regularMaterial, in: .rect(cornerRadius: 20))
                VStack(spacing: 12) {
                    ForEach(1...16, id: \.self) { stage in
                        StageRow(stage: stage, completions: summary.completedRuns[stage, default: 0],
                            checkpoint: summary.checkpoints[stage],
                            enabled: summary.available && StageProgress.canOpen(stage: stage,
                                completedRuns: summary.completedRuns, verifiedTestAccess: Self.testAccess)) { open(stage) }
                    }
                }
            }.padding(16)
        }.navigationTitle("스테이지").background(Color(uiColor: .systemGroupedBackground))
    }
}
struct StageRow: View {
    let stage: Int
    let completions: Int
    let checkpoint: StageStudySummary?
    let enabled: Bool
    let open: () -> Void
    var body: some View {
        Button(action: open) {
            HStack(spacing: 16) {
                Image(systemName: enabled ? (stage >= 11 ? "text.word.spacing" : "play.fill") : "lock.fill")
                    .frame(width: 44, height: 44).background(BrandStyle.yellow, in: .circle).foregroundStyle(BrandStyle.ink)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Stage \(stage) · \(StageMethod.title(stage))").font(.headline)
                    HStack(spacing: 4) {
                        ForEach(0..<3, id: \.self) { index in Image(systemName: index < completions ? "star.fill" : "star") }
                    }.font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
                    if let checkpoint, !checkpoint.complete {
                        Text("\(checkpoint.unit + 1)/\(checkpoint.unitCount) · 이어하기").font(.caption)
                    }
                }
                Spacer(minLength: 0)
            }.padding().frame(maxWidth: .infinity, alignment: .leading)
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
        }.buttonStyle(.plain).disabled(!enabled).accessibilityIdentifier("stage-\(stage)")
            .accessibilityLabel("Stage \(stage), \(StageMethod.title(stage)), 완료 \(completions)/3")
    }
}
enum StageMethod {
    static func title(_ stage: Int) -> String {
        let names = ["자막 쉐도잉", "자막 쉐도잉", "무자막 쉐도잉", "다구간 쉐도잉", "다구간 무자막", "속사포 영한", "속사포 한영", "속사포 한글"]
        return (1...16).contains(stage) ? names[(stage - 1) / 2] : "학습"
    }
}
