import Foundation
import ImageIO

public struct LaunchArtwork: Sendable {
    public let frames: [CGImage]
    public let delays: [Double]
    public var duration: Double { delays.reduce(0, +) }
    public var keyTimes: [Double] {
        var elapsed = 0.0
        return delays.map { delay in defer { elapsed += delay }; return elapsed / duration }
    }
    @concurrent public static func decodeStill(url: URL) async throws -> CGImage {
        guard url.isFileURL, let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceThumbnailMaxPixelSize: 1024,
                kCGImageSourceShouldCacheImmediately: true
              ] as CFDictionary) else { throw MediaFailure.invalidAsset }
        try Task.checkCancellation()
        return image
    }
    @concurrent public static func decode(url: URL) async throws -> Self {
        guard url.isFileURL,
              let source = CGImageSourceCreateWithURL(url as CFURL, nil),
              CGImageSourceGetCount(source) == 17 else { throw MediaFailure.invalidAsset }
        var frames: [CGImage] = [], delays: [Double] = []
        for index in 0..<17 {
            try Task.checkCancellation()
            guard let properties = CGImageSourceCopyPropertiesAtIndex(source, index, nil) as? [CFString: Any],
                  let width = properties[kCGImagePropertyPixelWidth] as? Int, width <= 512,
                  let height = properties[kCGImagePropertyPixelHeight] as? Int, height <= 512,
                  let webP = properties[kCGImagePropertyWebPDictionary] as? [CFString: Any],
                  let delay = (webP[kCGImagePropertyWebPUnclampedDelayTime] ?? webP[kCGImagePropertyWebPDelayTime]) as? Double,
                  delay.isFinite, delay > 0, delay <= 1,
                  let image = CGImageSourceCreateImageAtIndex(source, index, [kCGImageSourceShouldCacheImmediately: true] as CFDictionary)
            else { throw MediaFailure.invalidAsset }
            frames.append(image); delays.append(delay)
        }
        return Self(frames: frames, delays: delays)
    }
}
