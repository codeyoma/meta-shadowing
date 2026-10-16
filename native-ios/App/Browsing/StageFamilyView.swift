import AppFoundation
import LearningDomain
import SwiftUI

struct StageDetailSelection {
    var family: StageFamily
    var expandedStage: Int?
    init(continuationStage: Int?) { family = .containing(continuationStage ?? 1) }
    mutating func select(_ next: StageFamily) { family = next; expandedStage = nil }
    mutating func toggleGuide(_ stage: Int) { expandedStage = expandedStage == stage ? nil : stage }
}

struct StageFamilyView: View {
    let family: StageFamily
    let completed: Int
    @Binding var selection: StageDetailSelection
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        VStack(spacing: 20) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(family.title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
                    Text(family.subtitle).font(.subheadline).foregroundStyle(.secondary)
                }.frame(maxWidth: .infinity, alignment: .leading)
                StageFamilyRing(completed: completed, total: family.stages.count)
            }
            if dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 8) {
                    ForEach(StageFamily.allCases) { family in
                        Button { selection.select(family) } label: {
                            Text(family.title).frame(maxWidth: .infinity, minHeight: 44)
                        }.buttonStyle(.bordered)
                            .accessibilityAddTraits(selection.family == family ? .isSelected : [])
                            .accessibilityIdentifier("stage-family-\(family.rawValue)")
                    }
                }
            } else {
                Picker("학습 종류", selection: Binding(get: { selection.family }, set: { selection.select($0) })) {
                    ForEach(StageFamily.allCases) { family in
                        Text(family.title).tag(family).accessibilityIdentifier("stage-family-\(family.rawValue)")
                    }
                }.pickerStyle(.segmented).controlSize(.large).frame(minHeight: 44)
                    .background(Color(uiColor: .systemGroupedBackground), in: .capsule)
            }
        }
    }
}

private struct StageFamilyRing: View {
    let completed: Int
    let total: Int
    var body: some View {
        ZStack {
            Circle().stroke(.quaternary, lineWidth: 5)
            Circle().trim(from: 0, to: Double(completed) / Double(total))
                .stroke(BrandStyle.yellow, style: StrokeStyle(lineWidth: 5, lineCap: .round)).rotationEffect(.degrees(-90))
            Text("\(completed)/\(total)").font(.caption.bold()).monospacedDigit()
        }.frame(width: 48, height: 48)
            .accessibilityElement(children: .ignore).accessibilityLabel("완료한 스테이지")
            .accessibilityValue("\(completed)/\(total)").accessibilityIdentifier("stage-family-progress")
    }
}

struct StagePracticeRow: View {
    let stage: Int
    let summary: BookStudySummary
    let prominent: Bool
    let expanded: Bool
    let reduceMotion: Bool
    let open: () -> Void
    let toggle: () -> Void
    static let disclosureAnimation = Animation.timingCurve(0.23, 1, 0.32, 1, duration: 0.2)
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            StageRow(stage: stage, completions: summary.completedRuns[stage, default: 0], checkpoint: summary.checkpoints[stage],
                enabled: summary.available && StageProgress.canOpen(stage: stage, completedRuns: summary.completedRuns,
                    verifiedTestAccess: StagePathView.testAccess), open: open,
                displayTitle: StageFamily.rowTitle(stage), prominent: prominent, expanded: expanded, toggle: disclose)
            if expanded, let guide = try? LearningGuideContent(stage: stage) {
                VStack(spacing: 0) {
                    Divider()
                    VStack(alignment: .leading, spacing: 12) {
                        Text("학습 방법 안내").font(.headline)
                        Text(guide.practice).accessibilityIdentifier("stage-guidance-\(stage)")
                        if let grouping = guide.grouping { Text(grouping) }
                        Text(guide.confirmation)
                        Text(guide.rewards).foregroundStyle(.secondary)
                    }.font(.subheadline).fixedSize(horizontal: false, vertical: true).padding(16)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color(uiColor: .tertiarySystemFill))
                        .background(Color(uiColor: .systemGroupedBackground))
                }.transition(.opacity.animation(Self.disclosureAnimation))
            }
        }.background(Color(uiColor: .secondarySystemGroupedBackground)).clipped()
    }
    func disclose() {
        withAnimation(reduceMotion ? nil : Self.disclosureAnimation) { toggle() }
    }
}
