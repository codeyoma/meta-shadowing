import AppFoundation
import Foundation
import LearningDomain
import SwiftUI

/// A visit acquires storage authority only when it has measured time to save.
/// The player owns this session; rotating or replacing a video surface does not.
actor LearningStudyTime {
    private let workspace: ProductWorkspace
    private let writerID: UUID
    private let visitID = UUID()
    private var lease: StudyTimeLease?
    init(workspace: ProductWorkspace, writerID: UUID) {
        self.workspace = workspace; self.writerID = writerID
    }
    func write(_ milliseconds: Int64, finishing: Bool) async throws -> StudyTimeReceipt {
        if lease == nil, milliseconds == 0 {
            return StudyTimeReceipt(acceptedMilliseconds: 0, bookMilliseconds: 0, backupRevision: 0, retired: finishing)
        }
        if lease == nil { lease = try await workspace.beginStudyTime(writerID: writerID, visitID: visitID) }
        guard let lease else { throw LearningError.invalidState }
        return try await finishing
            ? workspace.finishStudyTime(lease, cumulativeMilliseconds: milliseconds)
            : workspace.recordStudyTime(lease, cumulativeMilliseconds: milliseconds)
    }
}

struct LearningTimeRecoveryView: View {
    let flow: LearningFlow
    let exit: () async -> Void
    @State private var saving = false
    var body: some View {
        if flow.studyTime?.saveFailed == true {
            VStack(alignment: .leading, spacing: 8) {
                Label("학습 시간을 저장하지 못했어요.", systemImage: "exclamationmark.triangle")
                HStack {
                    Button("다시 저장") {
                        Task {
                            saving = true
                            if await flow.retryStudyTime(), flow.studyExitPending { await exit() }
                            saving = false
                        }
                    }.accessibilityIdentifier("study-time-retry")
                    if flow.studyExitPending {
                        Button("저장하지 않고 나가기", role: .destructive) {
                            Task {
                                saving = true
                                if await flow.requestStudyExit(discardUnsaved: true) { await exit() }
                                saving = false
                            }
                        }.accessibilityIdentifier("study-time-discard")
                    }
                }.buttonStyle(.bordered)
            }.font(.footnote).padding().disabled(saving)
                .accessibilityIdentifier("study-time-save-error")
        }
    }
}
