import SwiftUI

/// One playback-speed control for settings, lesson sheets and both popover layouts.
struct RateEditorView: View {
    let rate: Double
    let change: (Double) -> Void
    @State private var draft: Double
    init(rate: Double, change: @escaping (Double) -> Void) {
        self.rate = rate; self.change = change; draft = rate
    }
    var body: some View {
        Section {
            HStack(spacing: 12) {
                Slider(value: Binding(get: { draft }, set: { draft = Self.quarterStep($0) }), in: 0.25...3, step: 0.25,
                       label: { Text("재생 속도") },
                       onEditingChanged: { editing in if !editing { change(draft) } })
                    .accessibilityValue(Text("\(draft.formatted())배속"))
                    .frame(maxWidth: .infinity)
                    .playerLayoutFrame("rate-slider")
                    .overlay(alignment: .bottom) { tickMarks.offset(y: 14) }
                    .accessibilityAdjustableAction { direction in
                        switch direction {
                        case .increment: draft = Self.quarterStep(draft + 0.25)
                        case .decrement: draft = Self.quarterStep(draft - 0.25)
                        @unknown default: return
                        }
                        change(draft)
                    }
                // Reserve four numeric characters plus the multiplier at the current text size.
                // The live label overlays this fixed sample, so changing rate cannot move the track.
                Text("\(0.25.formatted())×")
                    .hidden().frame(minWidth: 45).fixedSize()
                    .overlay(alignment: .trailing) {
                        Text("\(draft.formatted())×")
                            .lineLimit(1).minimumScaleFactor(0.5)
                            .accessibilityIdentifier("rate-current-value")
                    }
                    .monospacedDigit().font(.body.weight(.medium))
                    .playerLayoutFrame("rate-current-value")
            }.padding(.bottom, 14)
        }.onChange(of: rate) { _, value in draft = value }
    }
    private var tickMarks: some View {
        HStack(alignment: .top, spacing: 0) {
            ForEach(1...12, id: \.self) { step in
                if step > 1 { Spacer(minLength: 0) }
                Capsule()
                    .fill(Double(step) / 4 == draft ? Color.accentColor : Color.secondary)
                    .frame(width: 2, height: step.isMultiple(of: 4) || step == 1 ? 10 : 6)
                    .playerLayoutFrame("rate-tick-\(step)")
            }
        }.padding(.horizontal, 12).frame(height: 10).accessibilityHidden(true).allowsHitTesting(false)
    }
    static func quarterStep(_ value: Double) -> Double {
        min(3, max(0.25, (value * 4).rounded() / 4))
    }
}
