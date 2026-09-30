#if DEBUG
import SwiftUI

struct DeveloperDownloadLabView: View {
    @State private var model: DeveloperDownloadLabModel
    @State private var resetConfirmation = false
    @Environment(\.scenePhase) private var scenePhase

    // Each diagnostic route owns this model once; a parent redraw does not replace its storage.
    init(root: URL) { _model = State(initialValue: DeveloperDownloadLabModel(root: root)) }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("격리된 내부 검증입니다. 전송만 합성하며 실제 파일 검증·설치·SQLite를 사용합니다.").font(.footnote)
                    Text("실제 iCloud: 연결 안 함").font(.caption).accessibilityIdentifier("lab-sync")
                }
                Section("느린 다운로드 · 약 10초") {
                    DeveloperLabTransferControls(model: model)
                }
                Section("합성 기록 · 로컬 백업") {
                    DeveloperLabHistoryControls(model: model, resetConfirmation: $resetConfirmation)
                }
                Section("검증 결과") {
                    Text(model.result.label).accessibilityIdentifier("lab-result")
                    Text("Apple-hosted·CloudKit 서비스 통과 결과가 아닙니다.").font(.caption).foregroundStyle(.secondary)
                }
            }
            .navigationTitle("다운로드·복원 검증")
            .alert("테스트 기록을 삭제할까요?", isPresented: $resetConfirmation) {
                Button("테스트 기록 삭제", role: .destructive) { Task { await model.resetHistory() } }
                Button("취소", role: .cancel) { }
            } message: {
                Text("이 격리된 검증 저장소의 합성 기록만 삭제합니다. 실제 기기·iCloud 기록과 다운로드는 삭제하지 않습니다.")
            }
        }
        .task(id: scenePhase) {
            if scenePhase == .active { await model.open() }
            else { resetConfirmation = false; await model.close() }
        }
        .onDisappear { Task { await model.close() } }
    }
}

private struct DeveloperLabTransferControls: View {
    let model: DeveloperDownloadLabModel
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ProgressView(value: model.status.progress)
            HStack {
                Text(model.status.progress, format: .percent.precision(.fractionLength(0))).monospacedDigit()
                Spacer()
                Text(model.installed ? "설치: 검증됨" : "설치: 없음").accessibilityIdentifier("lab-installed")
            }.font(.caption)
            Text(model.paused ? "전송: 일시정지" : "전송: \(model.status.phase)").font(.caption).accessibilityIdentifier("lab-paused")
            HStack {
                Button("다운로드·재시도") { model.startDownload() }.accessibilityIdentifier("lab-download")
                    .disabled(!model.ready || model.downloading || model.historyBusy || model.installed)
                Button("취소") { Task { await model.cancelDownload() } }.accessibilityIdentifier("lab-cancel")
                    .disabled(!model.downloading)
            }
            HStack {
                if model.paused {
                    Button("전송 재개") { Task { await model.resumeTransfer() } }.accessibilityIdentifier("lab-resume")
                } else {
                    Button("전송 일시정지") { Task { await model.pauseTransfer() } }.accessibilityIdentifier("lab-pause")
                }
                Button("오류 주입") { Task { await model.failTransfer() } }.accessibilityIdentifier("lab-fail")
            }.disabled(!model.downloading)
            if model.installed {
                Button("테스트 다운로드 제거") { Task { await model.removeDownload() } }.accessibilityIdentifier("lab-remove")
                    .disabled(model.historyBusy)
            }
        }.buttonStyle(.bordered).controlSize(.regular)
    }
}

private struct DeveloperLabHistoryControls: View {
    let model: DeveloperDownloadLabModel
    @Binding var resetConfirmation: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("합성 테스트 XP: \(model.xp)").accessibilityIdentifier("lab-xp")
            Text("체크포인트: \(model.hasCheckpoint ? "있음" : "없음") · 로컬 백업: \(model.hasBackup ? "있음" : "없음")").font(.caption)
            Button("합성 기록·백업 준비") { Task { await model.prepareHistory() } }.accessibilityIdentifier("lab-seed")
                .disabled(model.xp != 0)
            HStack {
                Button("테스트 기록 초기화", role: .destructive) { resetConfirmation = true }.accessibilityIdentifier("lab-reset")
                Button("로컬 백업 복원") { Task { await model.restoreHistory() } }.accessibilityIdentifier("lab-restore")
                    .disabled(!model.hasBackup)
            }
            Button("저장소 다시 열어 검증") { Task { await model.reopenHistory() } }.accessibilityIdentifier("lab-reopen")
        }.buttonStyle(.bordered).disabled(!model.ready || model.historyBusy || model.downloading)
    }
}
#endif
