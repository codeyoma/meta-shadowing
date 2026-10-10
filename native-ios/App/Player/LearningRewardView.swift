import AppFoundation
import SwiftUI

/// A transient receipt of a durable write. This view never changes learning progress.
struct LearningRewardView: View {
    let feedback: CommittedLearningFeedback
    let actionFrame: CGRect
    var overVideo = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var visible = true
    @State private var raised = false
    @State private var opacity = 1.0
    @State private var receiptSize: CGSize = .zero
    // One random seed per command identity; playback updates never reroll the receipt.
    @State private var horizontalFraction = CGFloat.random(in: 0...1)
    @State private var verticalFraction = CGFloat.random(in: 0...1)
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
                .foregroundStyle(overVideo ? Color.white : Color.primary)
                .shadow(color: .black.opacity(overVideo ? 0.9 : 0), radius: 2, y: 1)
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("player-reward-burst")
                // Measure text so the transparent toast can stay inside the content area.
                .onGeometryChange(for: CGSize.self) { $0.size } action: { receiptSize = $0 }
                .frame(maxWidth: max(0, geometry.size.width - 32))
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
        Self.toastPosition(in: size, receipt: receiptSize, actionFrame: actionFrame,
                           anchor: UnitPoint(x: horizontalFraction, y: verticalFraction),
                           lift: reduceMotion || !raised ? 0 : rise)
    }

    static func toastPosition(in size: CGSize, receipt: CGSize, actionFrame: CGRect,
                              anchor: UnitPoint, lift: CGFloat) -> CGPoint {
        let halfWidth = min(receipt.width, size.width) / 2
        let halfHeight = min(receipt.height, size.height) / 2
        let minX = min(size.width / 2, halfWidth + 16)
        let maxX = max(minX, size.width - halfWidth - 16)
        // Keep the top tools and bottom cycle/action strip clear. Clamp again if completion
        // changes the viewport while a landscape receipt is still fading.
        let top = min(80, size.height * 0.2)
        let bottom = min(size.height - 16, max(top + receipt.height, actionFrame.minY - 80))
        let minY = min(size.height - halfHeight, top + halfHeight)
        let maxY = max(minY, min(size.height - halfHeight, bottom - halfHeight))
        return CGPoint(x: minX + (maxX - minX) * min(1, max(0, anchor.x)),
                       y: max(minY, minY + (maxY - minY) * min(1, max(0, anchor.y)) - lift))
    }
}
