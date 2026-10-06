import AppFoundation
import SwiftUI

struct CloudSyncView: View {
    let services: ProductServicesModel
    @State private var confirmation: ServiceConfirmation?
    var body: some View {
        Form {
            Section {
                LabeledContent("계정", value: accountStatus)
                LabeledContent("자동 동기화", value: services.syncState.enabled ? "켜짐" : "꺼짐")
                if services.syncState.busy || services.actionBusy { ProgressView("기록 확인 중") }
            } footer: { Text("학습은 기기에 먼저 저장돼요. iCloud를 켜면 현재 계정의 기록을 먼저 확인한 뒤 합칩니다.") }
            Section {
                if services.syncState.enabled {
                    Button("자동 동기화 끄기") { Task { await services.perform(services.confirmation(.disable)) } }
                } else {
                    Button("iCloud 기록으로 시작") { confirmation = services.confirmation(.enable(importGuest: false)) }
                    Button("이 기기 기록도 합쳐서 시작") { confirmation = services.confirmation(.enable(importGuest: true)) }
                }
                Button("한 번만 동기화") { confirmation = services.confirmation(.refresh(importGuest: false)) }
            }.disabled(services.actionBusy || services.syncState.busy || services.syncState.account.scope == nil || services.syncState.resetPending)
            Section {
                Button("계정 다시 확인") { Task { await services.refreshAccount() } }
                    .disabled(services.actionBusy || services.syncState.busy)
                ServiceStatusView(services: services)
            }
        }.navigationTitle("iCloud 동기화")
            .confirmationDialog("현재 iCloud 계정의 기록을 합칠까요?", item: $confirmation, titleVisibility: .visible) { request in
                Button(confirmTitle(request.action)) { Task { await services.perform(request) } }
                Button("취소", role: .cancel) { }
            } message: { request in
                switch request.action {
                case .enable(importGuest: true): Text("이 기기의 게스트 학습 기록을 현재 iCloud 계정 기록에 합치고 자동 동기화를 켭니다.")
                case .enable: Text("현재 iCloud 계정 기록을 복원하고 자동 동기화를 켭니다. 게스트 기록은 별도로 보관합니다.")
                default: Text("현재 계정 기록을 한 번 합칩니다. 자동 동기화 설정은 바뀌지 않습니다.")
                }
            }
    }
    private func confirmTitle(_ action: ServiceAction) -> String {
        switch action {
        case .enable(importGuest: true): String(localized: "합치고 동기화 켜기")
        case .enable: String(localized: "복원하고 동기화 켜기")
        default: String(localized: "지금 합치기")
        }
    }
    private var accountStatus: String {
        switch services.syncState.account {
        case .available: String(localized: "현재 iCloud 계정")
        case .noAccount: String(localized: "iPhone 설정에서 iCloud에 로그인해 주세요")
        case .unavailable: String(localized: "이 빌드에서는 사용할 수 없음")
        case .unknown: String(localized: "계정을 확인할 수 없음 · 기기 기록은 사용 가능")
        }
    }
}

struct ServiceStatusView: View {
    let services: ProductServicesModel
    var body: some View {
        if services.syncState.resetPending {
            Text("기록 삭제가 아직 완료되지 않았어요. 다시 시도해 주세요.").foregroundStyle(.secondary)
            Button("삭제 다시 시도") { Task { await services.retrySync() } }
                .disabled(services.syncState.busy || services.actionBusy)
        } else if services.syncState.error != nil || services.error != nil {
            Text(errorMessage)
                .font(.footnote).foregroundStyle(.secondary)
            Button("다시 시도") { Task { await services.retrySync() } }
                .disabled(services.syncState.busy || services.actionBusy)
        } else if services.syncState.cleanupPending {
            Text("기록은 저장되었고 이전 백업 정리를 기다리고 있어요.").font(.footnote)
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
