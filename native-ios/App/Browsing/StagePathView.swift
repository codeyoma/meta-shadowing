import AppFoundation
import LearningDomain
import SwiftUI

/// One scrolling book detail. Selected-family rows remain eager for accessibility.
struct StagePathView: View {
    let summary: BookStudySummary
    let open: (Int) -> Void
    @State private var selection: StageDetailSelection
    init(summary: BookStudySummary, open: @escaping (Int) -> Void) {
        self.summary = summary; self.open = open
        selection = StageDetailSelection(continuationStage: StageDetailSummary(summary: summary, verifiedTestAccess: Self.testAccess).continuationStage)
    }
    static var testAccess: Bool {
        #if DEBUG
        true
        #else
        false
        #endif
    }
    var body: some View {
        let detail = StageDetailSummary(summary: summary, verifiedTestAccess: Self.testAccess)
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                StageDetailHeader(summary: summary)
                VStack(alignment: .leading, spacing: 20) {
                    StageOverviewCard(summary: summary, detail: detail, open: open)
                    if !summary.available {
                        Label("자료를 열 수 없어요. 책장에서 다시 시도해 주세요. 학습 기록은 그대로 있어요.",
                              systemImage: "exclamationmark.triangle")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    StagePracticeCard(summary: summary, detail: detail, selection: $selection, open: open)
                }.padding(.horizontal, 16)
            }.padding(.bottom, 24)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .ignoresSafeArea(.container, edges: .top)
        .navigationBarTitleDisplayMode(.inline)
        .toolbarBackgroundVisibility(.hidden, for: .navigationBar)
        .scrollEdgeEffectHidden(true, for: .top)
    }
}

private struct StagePracticeCard: View {
    let summary: BookStudySummary
    let detail: StageDetailSummary
    @Binding var selection: StageDetailSelection
    let open: (Int) -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    var body: some View {
        VStack(spacing: 0) {
            StageFamilyView(family: selection.family, completed: detail.completed(in: selection.family), selection: $selection)
                .padding(16)
            ForEach(selection.family.stages, id: \.self) { stage in
                StagePracticeRow(stage: stage, summary: summary, prominent: stage == detail.continuationStage,
                    expanded: selection.expandedStage == stage, reduceMotion: reduceMotion,
                    open: { open(stage) }, toggle: { selection.toggleGuide(stage) })
                if stage != selection.family.stages.last { Divider() }
            }
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .compositingGroup().clipShape(.rect(cornerRadius: 26))
        .accessibilityElement(children: .contain).accessibilityIdentifier("stage-practice-card")
    }
}

struct StageRow: View {
    let stage: Int
    let completions: Int
    let checkpoint: StageStudySummary?
    let enabled: Bool
    let open: () -> Void
    var tapFeedback: BrowsingTapFeedback = .light
    var displayTitle: String? = nil
    var prominent = true
    var expanded = false
    var toggle: (() -> Void)? = nil
    @ScaledMetric(relativeTo: .body) private var symbolSize = 44
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var resuming: StageStudySummary? { checkpoint.flatMap { $0.complete ? nil : $0 } }
    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
            : AnyLayout(HStackLayout(spacing: 16))
        layout {
            Button(action: activate) {
                Image(systemName: enabled ? (stage >= 11 ? "text.word.spacing" : "play.fill") : "lock.fill")
                    .font(.body.weight(.semibold))
                    .frame(width: symbolSize, height: symbolSize)
                    .foregroundStyle(enabled ? BrandStyle.ink : Color.secondary)
                    .background(enabled && prominent ? AnyShapeStyle(BrandStyle.yellow) : AnyShapeStyle(.quaternary), in: .circle)
                    .contentShape(.circle)
            }
            .buttonStyle(.plain).disabled(!enabled)
            .accessibilityIdentifier("stage-\(stage)")
            .accessibilityLabel("스테이지 \(stage), \(StageMethod.title(stage))")
            .accessibilityValue(accessibilityValue)
            if let toggle {
                Button(action: toggle) { details }
                    .buttonStyle(.plain)
                    .accessibilityLabel("스테이지 \(stage) 학습 방법")
                    .accessibilityValue(expanded ? "펼쳐짐" : "접힘")
                    .accessibilityIdentifier("stage-guide-\(stage)")
            } else {
                details
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }
    private var details: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 12))
            : AnyLayout(HStackLayout(spacing: 8))
        return HStack(spacing: 12) {
            layout {
                VStack(alignment: .leading, spacing: 2) {
                    Text(displayTitle ?? String(localized: "스테이지 \(stage)")).font(.body)
                    if let resuming {
                        Label("\(resuming.unit + 1)/\(resuming.unitCount) · 이어하기", systemImage: "arrow.uturn.forward")
                            .font(.subheadline).foregroundStyle(.tint)
                    } else if !enabled {
                        Text("잠김").font(.subheadline).foregroundStyle(.secondary)
                    }
                }.frame(maxWidth: .infinity, alignment: .leading)
                StageCompletion(completions: completions)
            }
            if toggle != nil {
                Image(systemName: "chevron.down")
                    .font(.footnote.weight(.semibold)).foregroundStyle(.secondary)
                    .rotationEffect(.degrees(expanded ? 180 : 0))
                    .accessibilityHidden(true)
            }
        }
        .frame(maxWidth: .infinity, minHeight: symbolSize, alignment: .leading)
        .contentShape(.rect)
    }
    func activate() { tapFeedback.perform(enabled: enabled, open) }
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
        HStack(spacing: 4) {
            ForEach(1...3, id: \.self) { run in
                Image(systemName: completions >= run ? "checkmark.circle.fill" : "checkmark.circle")
                    .foregroundStyle(completions >= run ? AnyShapeStyle(BrandStyle.green) : AnyShapeStyle(.tertiary))
            }
        }.font(.subheadline).fixedSize().accessibilityHidden(true)
    }
}

enum StageMethod {
    static func title(_ stage: Int) -> String {
        let names = [String(localized: "자막 쉐도잉"), String(localized: "자막 쉐도잉"), String(localized: "무자막 쉐도잉"), String(localized: "다구간 쉐도잉"), String(localized: "다구간 무자막"), String(localized: "속사포 영한"), String(localized: "속사포 한영"), String(localized: "속사포 한글")]
        return (1...16).contains(stage) ? names[(stage - 1) / 2] : String(localized: "학습")
    }
}
