import AppFoundation
import SwiftUI

struct PurchaseRestoreView: View {
    let services: ProductServicesModel
    var body: some View {
        Form {
            Section {
                if let product = services.ownershipState.product {
                    Text(product.title).font(.headline)
                    LabeledContent("가격", value: product.price)
                    if services.ownershipState.ownership == .owned {
                        Label("구매 확인됨", systemImage: "checkmark.seal")
                    } else {
                        Button("구매 · \(product.price)") { Task { await services.purchase() } }
                            .disabled(services.ownershipState.outcome == .pending)
                    }
                } else { Text("현재 상품 정보를 불러올 수 없어요.") }
                if services.ownershipState.busy { ProgressView("구매 확인 중") }
                Text(outcome).font(.footnote).foregroundStyle(.secondary)
            }
            Section {
                Button("구매 복원") { Task { await services.restore() } }
                    .accessibilityIdentifier("restore-purchases")
                Button("상품 다시 확인") { Task { await services.refreshOwnership() } }
            } footer: { Text("App Store 계정의 구매 내역을 확인합니다. iCloud 학습 기록과는 별개예요.") }
        }.disabled(services.ownershipState.busy)
            .navigationTitle("구매 및 복원")
    }
    private var outcome: String {
        switch services.ownershipState.outcome {
        case .purchased: "구매가 확인되었어요. 도서 목록에서 다운로드해 주세요."
        case .restored: "구매 내역을 다시 확인했어요."
        case .pending: "구매 승인을 기다리고 있어요. 승인 후 자동으로 확인합니다."
        case .cancelled: "구매를 취소했어요."
        case .unverified: "구매를 검증하지 못했어요. 복원으로 다시 확인해 주세요."
        case .failed: "구매 확인에 실패했어요. 다시 시도해 주세요."
        case .unavailable: "이 빌드에서는 구매 서비스를 사용할 수 없어요."
        case .none: "검증된 구매 내역이 있어야 유료 도서를 사용할 수 있어요."
        }
    }
}
