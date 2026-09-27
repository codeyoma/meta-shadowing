import Foundation
import Testing
import LearningMedia

struct LaunchArtworkTests {
    @Test func suppliedArtworkDecodesSeventeenFrames() async throws {
        let url = try #require(Bundle.main.url(forResource: "talking-pup-512", withExtension: "webp"))
        let artwork = try await LaunchArtwork.decode(url: url)
        #expect(artwork.frames.count == 17)
        #expect(artwork.delays == [0.24, 0.09, 0.14, 0.08, 0.11, 0.13, 0.10, 0.08, 0.18, 0.10, 0.14, 0.08, 0.13, 0.09, 0.12, 0.14, 0.45])
        #expect(abs(artwork.duration - 2.4) < 0.000001)
        #expect(artwork.frames.allSatisfy { $0.width == 512 && $0.height == 512 })
    }
}
