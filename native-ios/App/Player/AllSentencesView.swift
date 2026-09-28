import LearningDomain
import LearningMedia
import SwiftUI

struct AllSentencesView: View {
    let flow: LearningFlow
    let session: LearningSession
    @State private var selecting = false
    @State private var userScrolled = false
    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    ForEach(session.plan.sources, id: \.index) { source in
                        Button {
                            guard let runtime = flow.runtime, !selecting else { return }
                            selecting = true
                            Task {
                                let result = await runtime.coordinator.editWhilePaused(.selectSource(source.index))
                                selecting = false
                                if !result.controller.saveFailed { flow.dismissOptions() }
                            }
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                Text("\(source.index + 1). \(source.text)")
                                Text(source.translation).font(.subheadline).foregroundStyle(.secondary)
                            }.padding().frame(maxWidth: .infinity, alignment: .leading)
                                .background(session.currentSources.contains(source.index) ? Color.accentColor.opacity(0.1) : Color.clear,
                                            in: .rect(cornerRadius: 12))
                        }.buttonStyle(.plain).id(source.index).accessibilityIdentifier("source-\(source.index)")
                    }
                }.padding()
            }
            .simultaneousGesture(DragGesture().onChanged { _ in userScrolled = true })
            .task {
                await Task.yield()
                if !userScrolled { proxy.scrollTo(session.currentSources.lowerBound, anchor: .center) }
            }
        }.disabled(selecting).navigationTitle("전체 문장")
    }
}
