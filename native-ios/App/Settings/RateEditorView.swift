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
                    .overlay(alignment: .bottom) { markers.offset(y: 8) }
                Text("\(draft.formatted())×").monospacedDigit().frame(minWidth: 45)
            }.padding(.bottom, 8)
        }.onChange(of: rate) { _, value in draft = value }
    }
    private var markers: some View {
        GeometryReader { geometry in
            ForEach([0.25, 1, 2, 3], id: \.self) { value in
                Circle().fill(.secondary).frame(width: 4, height: 4)
                    .position(x: geometry.size.width * (value - 0.25) / 2.75, y: 2)
            }
        }
        .frame(height: 4).padding(.horizontal, 14)
        .accessibilityHidden(true).allowsHitTesting(false)
    }
}
