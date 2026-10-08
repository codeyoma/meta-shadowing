import AppFoundation
import SwiftUI

struct LibraryView: View {
    let snapshot: ProductSnapshot
    var services: ProductServicesModel? = nil
    let select: (BookStudySummary) -> Void
    @Environment(\.dynamicTypeSize) private var textSize
    var body: some View {
        ScrollView {
            if snapshot.books.isEmpty {
                ContentUnavailableView("이 언어의 도서가 아직 없어요", systemImage: "books.vertical")
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 16),
                                         count: textSize.isAccessibilitySize ? 1 : 2), spacing: 16) {
                    ForEach(snapshot.books) { book in BookCardView(summary: book, services: services) { select(book) } }
                }.padding(16)
            }
        }.background(Color(uiColor: .systemGroupedBackground)).navigationTitle("책장")
    }
}
