import AppFoundation
import LearningDomain
import LearningMedia
import SwiftUI

struct LearningContentView: View {
    let session: LearningSession
    let motion: LearningMotionState
    let preferences: LearningPreferences
    let flow: LearningFlow?
    @State private var originalVisible: Bool
    init(session: LearningSession, motion: LearningMotionState, preferences: LearningPreferences, flow: LearningFlow? = nil) {
        self.session = session; self.motion = motion; self.preferences = preferences
        self.flow = flow
        originalVisible = !((try? StagePolicy.forStage(session.plan.scope.stage).firstWordHints) ?? false)
    }
    var body: some View {
        let displayPreferences = preferences.displayedForVideo(flow?.video != nil)
        if session.isSilent {
            SilentLearningContent(session: session, motion: motion, preferences: displayPreferences, flow: flow)
        } else {
            VStack(alignment: .trailing, spacing: 8) {
                if (try? StagePolicy.forStage(session.plan.scope.stage).firstWordHints) == true {
                    Toggle("자막 보기", isOn: $originalVisible).frame(minHeight: 44).toggleStyle(.switch)
                        .accessibilityIdentifier("subtitle-toggle")
                }
                if let presentation = try? LearningUnitPresentation.make(session: session,
                    revealOriginal: originalVisible, elapsedSeconds: 0) {
                    LearningTextBlock(presentation: presentation, preferences: displayPreferences, session: session, flow: flow)
                }
            }
        }
    }
}
private struct SilentLearningContent: View {
    let session: LearningSession
    let motion: LearningMotionState
    let preferences: LearningPreferences
    let flow: LearningFlow?
    var body: some View {
        if let presentation = try? LearningUnitPresentation.make(session: session,
            revealOriginal: false, elapsedSeconds: motion.elapsedSeconds) {
            LearningTextBlock(presentation: presentation, preferences: preferences, session: session, flow: flow)
        }
    }
}
struct LearningTextBlock: View {
    let presentation: LearningUnitPresentation
    let preferences: LearningPreferences
    var session: LearningSession? = nil
    var flow: LearningFlow? = nil
    var body: some View {
        LearningTextLayout(items: presentation.bubbles, speechView: preferences.speechView,
                           identifierPrefix: "learning") { bubble in
            lines(bubble.lines)
        }
    }
    private func lines(_ values: [LearningTextLine]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            ForEach(values) { line in
                LearningLineView(line: line, preferences: preferences, session: session, flow: flow)
            }
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}
private struct LearningLineView: View {
    let line: LearningTextLine
    let preferences: LearningPreferences
    let session: LearningSession?
    let flow: LearningFlow?
    @State private var active = true
    var body: some View {
        ZStack(alignment: .topLeading) {
            if lookupText != nil, line.spans.allSatisfy(\.visible) {
                PlayerDictionaryText(text: line.spans.map(\.text).joined(), lookup: lookup)
                    .frame(maxWidth: .infinity, alignment: .leading).accessibilityHidden(true)
            } else {
                Text(attributed).frame(maxWidth: .infinity, alignment: .leading).accessibilityHidden(true)
                if let hint = line.hint {
                    PlayerDictionaryText(text: hint, lookup: lookup).accessibilityHidden(true)
                }
            }
        }
        .modifier(LearningTextFont(preferences: preferences, original: line.kind == .target))
        .textSelection(.disabled)
        .accessibilityRepresentation {
            Text(line.accessibleText).accessibilityActions {
                ForEach(Array(Set(PlayerDictionaryWords.terms(lookupText ?? ""))).sorted(), id: \.self) { term in
                    Button("사전 보기: \(term)") { lookup(term) }
                }
            }
        }
        .accessibilityHidden(line.accessibleText.isEmpty)
        .accessibilityIdentifier("learning-line-\(line.id)")
        .onAppear { active = true }
        .onDisappear { active = false }
        .onChange(of: lookupText) { _, _ in flow?.playerDictionary.cancel() }
    }
    private var lookupText: String? {
        guard let session else { return nil }
        return PlayerDictionaryWords.visibleText(line: line, session: session)
    }
    private func lookup(_ term: String) {
        guard let flow, let text = lookupText, PlayerDictionaryWords.terms(text).contains(term) else { return }
        Task { await flow.lookupPlayer(term: term, permitsWord: { active && lookupText == text }) }
    }
    private var attributed: AttributedString {
        var result = AttributedString()
        for span in line.spans {
            var value = AttributedString(span.text)
            value.foregroundColor = span.visible ? Color.primary : Color.clear
            result.append(value)
        }
        return result
    }
}
