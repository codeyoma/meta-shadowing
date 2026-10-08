import SwiftUI

/// The shared playback-speed control: a native slider in quarter steps with
/// system tick marks at 0.25×, 1×, 2× and 3× and the live rate on the right.
struct RateEditorView: View {
    let rate: Double
    let change: (Double) -> Void
    @State private var draft: Double
    init(rate: Double, change: @escaping (Double) -> Void) {
        self.rate = rate; self.change = change; draft = rate
    }
    var body: some View {
        Section {
            HStack {
                // Stepped sliders draw a tick at every step; explicit ticks keep only the four marks.
                Slider(value: Binding(get: { draft }, set: { draft = Self.quarterStep($0) }), in: 0.25...3,
                       label: { Text("재생 속도") },
                       ticks: { SliderTick(0.25); SliderTick(1.0); SliderTick(2.0); SliderTick(3.0) },
                       onEditingChanged: { editing in if !editing { change(draft) } })
                    .accessibilityValue(Text("\(draft.formatted())배속"))
                Text("\(draft.formatted())×").monospacedDigit().frame(minWidth: 45)
            }
        }.onChange(of: rate) { _, value in draft = value }
    }
    static func quarterStep(_ value: Double) -> Double {
        min(3, max(0.25, (value * 4).rounded() / 4))
    }
}
