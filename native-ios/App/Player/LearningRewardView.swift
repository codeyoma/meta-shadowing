import AppFoundation
import SwiftUI

/// A transient receipt of a durable write. This view never changes learning progress.
struct LearningRewardView: View {
    let feedback: CommittedLearningFeedback
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = true
    @State private var raised = false
    private var announcement: String {
        var parts: [String] = []
        if feedback.xpAward > 0 { parts.append(String(localized: "\(feedback.xpAward) XP 획득")) }
        if feedback.completedRun { parts.append(String(localized: "학습 완료!")) }
        return parts.joined(separator: ", ")
    }
    var body: some View {
        Group {
            if visible {
                VStack(spacing: 8) {
                    if feedback.xpAward > 0 {
                        Text("+\(feedback.xpAward) XP").font(.title2.bold())
                            .accessibilityLabel("\(feedback.xpAward) XP 획득")
                            .accessibilityIdentifier("player-xp-receipt")
                    }
                    if feedback.completedRun {
                        Text("학습 완료!").font(.headline)
                            .accessibilityIdentifier("player-completion-receipt")
                    }
                }
                .padding().foregroundStyle(BrandStyle.ink)
                .background(BrandStyle.yellow, in: .rect(cornerRadius: 20))
                .offset(y: reduceMotion || !raised ? 0 : -12)
                .transition(.opacity)
            }
        }
        .allowsHitTesting(false)
        .task {
            AccessibilityNotification.Announcement(announcement).post()
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.3)) { raised = true }
            do { try await Task.sleep(for: .seconds(2)) } catch { return }
            withAnimation(reduceMotion ? nil : .easeOut(duration: 0.2)) { visible = false }
        }
    }
}
