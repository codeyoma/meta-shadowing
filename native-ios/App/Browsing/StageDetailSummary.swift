import AppFoundation
import Foundation
import LearningDomain

nonisolated enum StageFamily: Int, CaseIterable, Identifiable {
    case shadowing, grouped, crazySpeaking
    var id: Int { rawValue }
    var stages: [Int] {
        switch self {
        case .shadowing: Array(1...6)
        case .grouped: Array(7...10)
        case .crazySpeaking: Array(11...16)
        }
    }
    static func containing(_ stage: Int) -> Self {
        stage < 7 ? .shadowing : stage < 11 ? .grouped : .crazySpeaking
    }
    var title: String {
        switch self {
        case .shadowing: String(localized: "쉐도잉")
        case .grouped: String(localized: "다구간 쉐도잉")
        case .crazySpeaking: String(localized: "크레이지 스피킹")
        }
    }
    var subtitle: String {
        switch self {
        case .shadowing: String(localized: "문장을 듣고 따라 말하며 반복해요.")
        case .grouped: String(localized: "여러 구간을 한 묶음으로 이어서 연습해요.")
        case .crazySpeaking: String(localized: "음성 없이 단어를 보며 직접 말해요.")
        }
    }
    static func rowTitle(_ stage: Int) -> String {
        switch stage {
        case 1...2: String(localized: "쉐도잉 \(stage)")
        case 3...4: String(localized: "순간암기 \(stage - 2)")
        case 5...6: String(localized: "무자막 순간 \(stage - 4)")
        case 7...8: String(localized: "다구간 쉐도잉 \(stage - 6)")
        case 9...10: String(localized: "다구간 무자막 \(stage - 8)")
        case 11...12: String(localized: "속사포 영한 \(stage - 10)")
        case 13...14: String(localized: "속사포 한영 \(stage - 12)")
        default: String(localized: "속사포 한글 \(stage - 14)")
        }
    }
}

nonisolated struct StageDetailSummary {
    let continuationStage: Int?
    let isReview: Bool
    let unit: Int
    let unitCount: Int
    let completedPercentage: Int
    private let runs: [Int: Int]

    init(summary: BookStudySummary, verifiedTestAccess: Bool) {
        runs = summary.completedRuns
        let completed = (1...16).filter { summary.completedRuns[$0, default: 0] >= 3 }.count
        completedPercentage = Int((Double(completed) * 100 / 16).rounded())
        isReview = completed == 16
        let eligible = (1...16).filter {
            summary.available && StageProgress.canOpen(stage: $0, completedRuns: summary.completedRuns,
                                                       verifiedTestAccess: verifiedTestAccess)
        }
        if !isReview, let latest = summary.recentStages.first(where: {
            eligible.contains($0) && summary.checkpoints[$0]?.complete == false
        }) {
            continuationStage = latest
        } else {
            continuationStage = eligible.first { summary.completedRuns[$0, default: 0] < 3 } ?? eligible.first
        }
        let stage = continuationStage ?? 1
        if let saved = summary.checkpoints[stage], !saved.complete, !isReview {
            unit = saved.unit + 1; unitCount = saved.unitCount
        } else {
            unit = 1; unitCount = max(1, summary.plannedUnitCounts[stage] ?? summary.book.sentenceCount)
        }
    }
    func completed(in family: StageFamily) -> Int { family.stages.filter { runs[$0, default: 0] >= 3 }.count }
}

nonisolated struct StudyTimeText {
    let milliseconds: Int64
    var compact: String {
        let minutes = max(0, milliseconds) / 60_000
        if milliseconds <= 0 { return String(localized: "0분") }
        if minutes == 0 { return String(localized: "1분 미만") }
        if minutes < 60 { return String(localized: "\(minutes)분") }
        return String(localized: "\(minutes / 60)시간 \(minutes % 60)분")
    }
    var accessibility: String {
        let seconds = Double(max(0, milliseconds) % 60_000) / 1_000
        return String(localized: "\(max(0, milliseconds) / 3_600_000)시간 \((max(0, milliseconds) / 60_000) % 60)분 \(seconds.formatted(.number.precision(.fractionLength(0...3))))초")
    }
}
