import AppFoundation
import SwiftUI

struct StageDetailHeader: View {
    let summary: BookStudySummary
    private let coverAspectRatio: CGFloat = 1.35
    private let fadeStart = 0.65
    var body: some View {
        StageCoverTitleLayout(coverAspectRatio: coverAspectRatio, titleStartFraction: (fadeStart + 1) / 2) {
            Rectangle().fill(.clear).aspectRatio(coverAspectRatio, contentMode: .fit)
                .overlay {
                    Image(uiImage: UIImage(named: "morning-notes") ?? UIImage()).resizable().scaledToFill()
                        .saturation(summary.available ? 1 : 0.15)
                        .accessibilityHidden(true)
                }
                .overlay {
                    LinearGradient(stops: [
                        .init(color: .clear, location: fadeStart),
                        .init(color: Color(uiColor: .systemGroupedBackground), location: 1)
                    ], startPoint: .top, endPoint: .bottom)
                    .allowsHitTesting(false)
                }.compositingGroup().clipped()
            Text(summary.book.title).font(.largeTitle.bold()).fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .accessibilityAddTraits(.isHeader).accessibilityIdentifier("stage-book-title")
                .padding(.horizontal, 16)
        }
    }
}

/// Reserves the title's full height while overlapping the midpoint of the cover fade.
private struct StageCoverTitleLayout: Layout {
    let coverAspectRatio: CGFloat
    let titleStartFraction: CGFloat
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
            ?? subviews[1].sizeThatFits(.unspecified).width
        let coverHeight = width / coverAspectRatio
        let titleHeight = subviews[1].sizeThatFits(ProposedViewSize(width: width, height: nil)).height
        return CGSize(width: width, height: max(coverHeight, coverHeight * titleStartFraction + titleHeight))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let coverHeight = bounds.width / coverAspectRatio
        subviews[0].place(at: bounds.origin, anchor: .topLeading,
                          proposal: ProposedViewSize(width: bounds.width, height: coverHeight))
        subviews[1].place(at: CGPoint(x: bounds.minX, y: bounds.minY + coverHeight * titleStartFraction),
                          anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: nil))
    }
}

struct StageStatisticsView: View {
    let summary: BookStudySummary
    let percentage: Int
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 16)) : AnyLayout(HStackLayout(spacing: 8))
        layout {
            StageStatistic(title: "문장", value: "\(summary.book.sentenceCount)")
            if !dynamicTypeSize.isAccessibilitySize { Divider().frame(height: 44).accessibilityHidden(true) }
            StageStatistic(title: "학습한 시간", value: StudyTimeText(milliseconds: summary.studyMilliseconds).compact,
                           fullValue: StudyTimeText(milliseconds: summary.studyMilliseconds).accessibility, identifier: "stage-study-time")
            if !dynamicTypeSize.isAccessibilitySize { Divider().frame(height: 44).accessibilityHidden(true) }
            StageStatistic(title: "완료", value: "\(percentage)%")
        }.padding(16).frame(maxWidth: .infinity)
    }
}

private struct StageStatistic: View {
    let title: LocalizedStringKey
    let value: String
    var fullValue: String? = nil
    var identifier = ""
    var body: some View {
        VStack(spacing: 6) {
            Text(value).font(.title3.bold()).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(Text(title)).accessibilityValue(fullValue ?? value)
                .accessibilityIdentifier(identifier)
            Text(title).font(.caption).foregroundStyle(.secondary).accessibilityHidden(true)
        }.frame(maxWidth: .infinity, minHeight: 44)
    }
}

struct StageContinuationButton: View {
    let summary: BookStudySummary
    let detail: StageDetailSummary
    let open: (Int) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var title: String {
        guard let stage = detail.continuationStage else { return String(localized: "자료를 열 수 없어요") }
        if detail.isReview { return String(localized: "스테이지 \(stage) 다시 연습하기") }
        if summary.checkpoints[stage]?.complete == false { return String(localized: "스테이지 \(stage) 이어하기 · \(detail.unit)/\(detail.unitCount)") }
        return String(localized: "스테이지 \(stage) 시작하기 · \(detail.unit)/\(detail.unitCount)")
    }
    var body: some View {
        Button {
            if let stage = detail.continuationStage { BrowsingTapFeedback.light.perform { open(stage) } }
        } label: {
            Label(title, systemImage: "play.fill").font(.headline)
                .multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
                .padding(.horizontal, 16).padding(.vertical, 10)
                .frame(maxWidth: .infinity, minHeight: 44,
                       maxHeight: dynamicTypeSize.isAccessibilitySize ? nil : .infinity)
        }.buttonStyle(StageContinuationStyle()).disabled(detail.continuationStage == nil)
            .accessibilityIdentifier("stage-continue")
    }
}

private struct StageContinuationStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.foregroundStyle(BrandStyle.ink)
            .background(BrandStyle.yellow.opacity(configuration.isPressed ? 0.8 : 1))
            .opacity(isEnabled ? 1 : 0.5)
    }
}

struct StageOverviewCard: View {
    let summary: BookStudySummary
    let detail: StageDetailSummary
    let open: (Int) -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(spacing: 0)) : AnyLayout(StageOverviewLayout())
        layout {
            StageStatisticsView(summary: summary, percentage: detail.completedPercentage)
            StageContinuationButton(summary: summary, detail: detail, open: open)
        }
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .compositingGroup().clipShape(.rect(cornerRadius: 26))
        .accessibilityElement(children: .contain).accessibilityIdentifier("stage-overview-card")
    }
}

/// A compact 6:4 split grows to fit either section; accessibility text uses a natural stack.
private struct StageOverviewLayout: Layout {
    private let fractions: [CGFloat] = [0.6, 0.4]
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? $0 : nil }
            ?? subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        let requiredHeight = zip(subviews, fractions).map { subview, fraction in
            subview.sizeThatFits(ProposedViewSize(width: width, height: nil)).height / fraction
        }.max() ?? 0
        return CGSize(width: width, height: max(152, requiredHeight))
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var y = bounds.minY
        for (subview, fraction) in zip(subviews, fractions) {
            let rowHeight = bounds.height * fraction
            subview.place(at: CGPoint(x: bounds.midX, y: y + rowHeight / 2),
                          anchor: .center, proposal: ProposedViewSize(width: bounds.width, height: rowHeight))
            y += rowHeight
        }
    }
}
