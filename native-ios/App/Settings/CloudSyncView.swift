import AppFoundation
import SwiftUI

struct CloudSyncView: View {
    let services: ProductServicesModel
    @State private var confirmation: SyncEnableChoice?
    private var busy: Bool { services.syncState.busy || services.actionBusy }
    var body: some View {
        Form {
            Section {
                Toggle(isOn: Binding(get: { services.syncState.enabled }, set: setSyncEnabled)) {
                    HStack {
                        Text("동기화")
                        if busy { ProgressView().controlSize(.small).accessibilityHidden(true) }
                    }
                }
                .toggleStyle(.switch)
                .accessibilityIdentifier("icloud-sync-toggle")
                .disabled(busy || services.syncState.resetPending || (!services.syncState.enabled && services.syncState.account.scope == nil))
            } footer: {
                if !busy, !services.syncState.enabled, services.syncState.account.scope == nil {
                    Text(accountStatus)
                }
            }
            ServiceStatusView(services: services)
        }.navigationTitle("iCloud 동기화")
            .refreshable { await services.refreshAccount() }
            .confirmationDialog("iCloud 동기화를 켤까요?", item: $confirmation, titleVisibility: .visible) { choice in
                Button("복원하고 동기화 켜기") { Task { await services.perform(choice.restore) } }
                if choice.restore.profileID == "local" {
                    Button("합치고 동기화 켜기") { Task { await services.perform(choice.merge) } }
                }
                Button("취소", role: .cancel) { }
            } message: { choice in
                if choice.restore.profileID == "local" {
                    Text("iCloud 기록을 복원합니다. 이 기기 기록도 합칠지 선택해 주세요. 합치지 않은 기록은 기기에 남습니다.")
                } else {
                    Text("현재 iCloud 계정의 학습 기록을 동기화합니다.")
                }
            }
    }
    private func setSyncEnabled(_ enabled: Bool) {
        guard enabled != services.syncState.enabled, !busy, !services.syncState.resetPending else { return }
        if enabled {
            guard services.syncState.account.scope != nil else { return }
            confirmation = SyncEnableChoice(restore: services.confirmation(.enable(importGuest: false)),
                                            merge: services.confirmation(.enable(importGuest: true)))
        } else {
            let request = services.confirmation(.disable)
            Task { await services.perform(request) }
        }
    }
    private var accountStatus: String {
        switch services.syncState.account {
        case .available: ""
        case .noAccount: String(localized: "iPhone 설정에서 iCloud에 로그인해 주세요")
        case .unavailable: String(localized: "이 빌드에서는 iCloud를 사용할 수 없어요.")
        case .unknown: String(localized: "iCloud 계정을 확인할 수 없어요.")
        }
    }
}

/// Both choices retain the account/profile boundary captured when the user tapped ON.
private struct SyncEnableChoice: Identifiable {
    let restore: ServiceConfirmation
    let merge: ServiceConfirmation
    var id: UUID { restore.id }
}

struct ServiceStatusView: View {
    let services: ProductServicesModel
    var body: some View {
        if services.syncState.resetPending {
            Section {
                Text("기록 삭제가 아직 완료되지 않았어요. 다시 시도해 주세요.").foregroundStyle(.secondary)
                Button("삭제 다시 시도") { Task { await services.retrySync() } }
                    .disabled(services.syncState.busy || services.actionBusy)
            }
        } else if (services.syncState.enabled && services.syncState.error != nil) || services.error != nil {
            Section {
                Text(errorMessage).font(.footnote).foregroundStyle(.secondary)
                Button("다시 시도") { Task { await services.retrySync() } }
                    .disabled(services.syncState.busy || services.actionBusy)
            }
        }
    }
    private var errorMessage: String {
        switch services.syncState.error {
        case .offline: String(localized: "연결할 수 없어요. 기기의 학습 기록은 보존되며 연결 후 다시 시도합니다.")
        case .quota: String(localized: "iCloud 저장 공간이 부족해요. 공간을 확보한 뒤 다시 시도해 주세요.")
        case .permission: String(localized: "iCloud 접근이 허용되지 않았어요. 계정과 앱의 iCloud 설정을 확인해 주세요.")
        case .corrupt, .tooLarge: String(localized: "지원하지 않거나 손상된 백업이에요. 기록을 덮어쓰지 않았습니다.")
        case .conflict: String(localized: "다른 기기에서 기록이 변경되었어요. 다시 시도해 주세요.")
        default: String(localized: "작업을 완료하지 못했어요. 계정과 연결 상태를 확인해 주세요. 저장된 기록은 보존됩니다.")
        }
    }
}
