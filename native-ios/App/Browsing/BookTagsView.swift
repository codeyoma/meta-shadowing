import AppFoundation
import SwiftUI

struct BookTagsView: View {
    let book: CatalogBook
    let paid: Bool
    private var kind: String {
        if paid { return "유료 도서" }
        return ["morning-notes-v1", "hosted-morning-notes-v1"].contains(book.id) ? "샘플" : "무료 도서"
    }
    private var minimumXP: Int? {
        // Sixteen stages, three required runs, three base cycles per source.
        let estimate = book.sentenceCount.multipliedReportingOverflow(by: 144)
        return book.sentenceCount > 0 && !estimate.overflow ? estimate.partialValue : nil
    }
    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            Text(kind).accessibilityIdentifier("book-kind-\(book.id)")
                .padding(.horizontal, 8).padding(.vertical, 3)
                .background(.regularMaterial, in: .capsule)
            if let minimumXP {
                Text("\(minimumXP.formatted()) XP +")
                    .padding(.horizontal, 8).padding(.vertical, 3)
                    .foregroundStyle(BrandStyle.ink).background(BrandStyle.green, in: .capsule)
                    .accessibilityLabel("전체 16스테이지를 각 3회 학습하면 최소 \(minimumXP.formatted()) XP, 추가 사이클 제외")
                    .accessibilityIdentifier("book-xp-\(book.id)")
            }
        }.font(.caption.bold()).fixedSize(horizontal: false, vertical: true)
    }
}
