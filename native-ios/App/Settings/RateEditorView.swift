import SwiftUI

struct RateEditorView: View {
    let rate: Double
    let change: (Double) -> Void
    @State private var draft: Double
    init(rate: Double, change: @escaping (Double) -> Void) {
        self.rate = rate; self.change = change; draft = rate
    }
    var body: some View {
        Section("배속") {
            HStack {
                Slider(value: $draft, in: 0.25...3, step: 0.25) { editing in
                    if !editing { change(draft) }
                }.accessibilityLabel("재생 속도")
                Text("\(draft.formatted())×").monospacedDigit().frame(minWidth: 45)
            }
            HStack { Text("0.25×"); Spacer(); Text("1×"); Spacer(); Text("2×"); Spacer(); Text("3×") }
                .font(.caption).foregroundStyle(.secondary)
        }.onChange(of: rate) { _, value in draft = value }
    }
}
