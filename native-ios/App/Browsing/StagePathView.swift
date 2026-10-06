import AppFoundation
import LearningDomain
import SwiftUI

/// Sixteen stages in inset-grouped sections by level. Rows render eagerly: a
/// lazy list hid the final stages from accessibility on iOS 27.
struct StagePathView: View {
    let summary: BookStudySummary
    let open: (Int) -> Void
    /// Matches the row symbol so separators start at the title, as in system lists.
    @ScaledMetric(relativeTo: .body) private var symbolSize = 44
    static var testAccess: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("\(summary.book.sentenceCount)문장 · \(summary.completedStages)/16 스테이지 완료")
                        .font(.subheadline).foregroundStyle(.secondary)
                    ProgressView(value: Double(summary.completedStages), total: 16).tint(BrandStyle.green)
                        .accessibilityLabel("완료한 스테이지")
                        .accessibilityValue("\(summary.completedStages)/16")
                    if !summary.available {
                        Label("자료를 열 수 없어요. 도서 목록에서 다시 시도해 주세요. 학습 기록은 그대로 있어요.",
                              systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                }.padding(.horizontal, 20)
                ForEach(1...8, id: \.self) { level in
                    StageSection(title: String(localized: "Lv \(level) · \(StageMethod.title(level * 2))")) {
                        ForEach([level * 2 - 1, level * 2], id: \.self) { stage in
                            StageRow(stage: stage, completions: summary.completedRuns[stage, default: 0],
                                checkpoint: summary.checkpoints[stage],
                                enabled: summary.available && StageProgress.canOpen(stage: stage,
                                    completedRuns: summary.completedRuns, verifiedTestAccess: Self.testAccess)) { open(stage) }
                            if stage.isMultiple(of: 2) == false { Divider().padding(.leading, symbolSize + 32) }
                        }
                    }
                }
            }.padding(.vertical, 16)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle(summary.book.title)
    }
}

/// An eager stand-in for an inset-grouped list section.
private struct StageSection<Rows: View>: View {
    let title: String
    @ViewBuilder let rows: Rows
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title).font(.footnote).foregroundStyle(.secondary).padding(.horizontal, 36)
                .accessibilityAddTraits(.isHeader)
            VStack(spacing: 0) { rows }
                .background(Color(uiColor: .secondarySystemGroupedBackground), in: .rect(cornerRadius: 26))
                .padding(.horizontal, 16)
        }
    }
}

struct StageRow: View {
    let stage: Int
    let completions: Int
    let checkpoint: StageStudySummary?
    let enabled: Bool
    let open: () -> Void
    @ScaledMetric(relativeTo: .body) private var symbolSize = 44
    private var resuming: StageStudySummary? { checkpoint.flatMap { $0.complete ? nil : $0 } }
    var body: some View {
        Button(action: open) {
            HStack(spacing: 16) {
                Image(systemName: enabled ? (stage >= 11 ? "text.word.spacing" : "play.fill") : "lock.fill")
                    .font(.body.weight(.semibold))
                    .frame(width: symbolSize, height: symbolSize)
                    .foregroundStyle(enabled ? BrandStyle.ink : Color.secondary)
                    .background(enabled ? AnyShapeStyle(BrandStyle.yellow) : AnyShapeStyle(.quaternary), in: .circle)
                VStack(alignment: .leading, spacing: 2) {
                    Text("스테이지 \(stage)").font(.body)
                    if let resuming {
                        Label("\(resuming.unit + 1)/\(resuming.unitCount) · 이어하기", systemImage: "arrow.uturn.forward")
                            .font(.subheadline).foregroundStyle(.tint)
                    } else if !enabled {
                        Text("잠김").font(.subheadline).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 8)
                StageCompletion(completions: completions)
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!enabled)
        .accessibilityIdentifier("stage-\(stage)")
        .accessibilityLabel("스테이지 \(stage), \(StageMethod.title(stage))")
        .accessibilityValue(accessibilityValue)
    }
    private var accessibilityValue: String {
        var parts = [String(localized: "완료 \(min(completions, 3))/3")]
        if let resuming { parts.append(String(localized: "\(resuming.unit + 1)/\(resuming.unitCount) 이어하기")) }
        if !enabled { parts.append(String(localized: "잠김")) }
        return parts.joined(separator: ", ")
    }
}

/// Confirmed runs out of three; a stage is complete after three.
private struct StageCompletion: View {
    let completions: Int
    var body: some View {
        let done = completions >= 3
        HStack(spacing: 4) {
            Image(systemName: done ? "checkmark.circle.fill" : "checkmark.circle")
                .foregroundStyle(done ? AnyShapeStyle(BrandStyle.green) : AnyShapeStyle(.tertiary))
            Text("\(min(completions, 3))/3").monospacedDigit().foregroundStyle(.secondary)
        }.font(.subheadline).accessibilityHidden(true)
    }
}

enum StageMethod {
    static func title(_ stage: Int) -> String {
        let names = [String(localized: "자막 쉐도잉"), String(localized: "자막 쉐도잉"), String(localized: "무자막 쉐도잉"), String(localized: "다구간 쉐도잉"), String(localized: "다구간 무자막"), String(localized: "속사포 영한"), String(localized: "속사포 한영"), String(localized: "속사포 한글")]
        return (1...16).contains(stage) ? names[(stage - 1) / 2] : String(localized: "학습")
    }
}
