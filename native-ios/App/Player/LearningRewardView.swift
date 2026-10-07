import AppFoundation
import SwiftUI

/// A transient receipt of a durable write. This view never changes learning progress.
struct LearningRewardView: View {
    // A compact, non-interactive receipt shares the footer's reserved feedback area.
    static let clearanceHeight: CGFloat = 72
    let feedback: CommittedLearningFeedback
    let actionFrame: CGRect
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = true
    @State private var raised = false
    @State private var opacity = 1.0
    @State private var receiptSize: CGSize = .zero
    // One random seed per command identity; playback updates never reroll the receipt.
    @State private var horizontalFraction = CGFloat.random(in: 0...1)
    @State private var rise = CGFloat.random(in: 6...12)
    private var announcement: String {
        var parts: [String] = []
        if feedback.xpAward > 0 { parts.append(String(localized: "\(feedback.xpAward) XP 획득")) }
        if feedback.completedRun { parts.append(String(localized: "학습 완료!")) }
        return parts.joined(separator: ", ")
    }
    var body: some View {
        GeometryReader { geometry in
            if visible && !actionFrame.isEmpty {
                VStack(spacing: 8) {
                    if feedback.xpAward > 0 {
                        Text("+\(feedback.xpAward) XP").font(.headline.bold())
                            .lineLimit(1).minimumScaleFactor(0.75)
                            .accessibilityLabel("\(feedback.xpAward) XP 획득")
                            .accessibilityIdentifier("player-xp-receipt")
                    }
                    if feedback.completedRun {
                        Text("학습 완료!").font(.headline)
                            .accessibilityIdentifier("player-completion-receipt")
                    }
                }
                // Keep transient decoration compact; the full award is still announced and labeled.
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .padding(.horizontal, 12).padding(.vertical, 8)
                .foregroundStyle(Color.primary)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("player-reward-burst")
                // Measure the receipt, not the flexible proposal, so horizontal jitter has room.
                .onGeometryChange(for: CGSize.self) { $0.size } action: { receiptSize = $0 }
                .frame(maxWidth: max(0, min(actionFrame.width, geometry.size.width) - 16))
                .fixedSize(horizontal: false, vertical: true)
                .scaleEffect(reduceMotion || raised ? 1 : 0.75, anchor: .bottom)
                .position(position(in: geometry.size))
                .opacity(receiptSize == .zero ? 0 : opacity)
            }
        }
        .allowsHitTesting(false)
        .task(id: receiptSize == .zero) {
            // Start once the text has a measured position, not while its initial layout is hidden.
            guard receiptSize != .zero else { return }
            if !announcement.isEmpty { AccessibilityNotification.Announcement(announcement).post() }
            withAnimation(reduceMotion ? nil : .spring(duration: 0.35, bounce: 0.25)) { raised = true }
            withAnimation(.easeOut(duration: 0.5)) { opacity = 0 }
            do { try await Task.sleep(for: .seconds(0.5)) } catch { return }
            visible = false
        }
    }

    private func position(in size: CGSize) -> CGPoint {
        let halfWidth = receiptSize.width / 2, halfHeight = receiptSize.height / 2
        let left = max(8, actionFrame.minX + 8) + halfWidth
        let right = min(size.width - 8, actionFrame.maxX - 8) - halfWidth
        let x = left + max(0, right - left) * horizontalFraction
        let lift = reduceMotion || !raised ? 0 : rise
        return CGPoint(x: x, y: max(halfHeight + 8, actionFrame.minY - 8 - halfHeight - lift))
    }
}
