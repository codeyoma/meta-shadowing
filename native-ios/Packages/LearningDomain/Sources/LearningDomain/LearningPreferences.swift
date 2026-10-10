import Foundation

public struct LearningPreferences: Codable, Equatable, Sendable {
    public var rate: Double = 1
    public var groupSize: Int = 2
    public var speechView: String = "bubble"
    public var revealWPM: [Int] = [150, 200, 250, 300]
    public var originalTextSize: Int? = 20
    public var translationTextSize: Int? = 18
    public var fullscreenOriginalTextSize: Int = 20
    public var fullscreenTranslationTextSize: Int = 18
    public var originalTextFont: String? = "system"
    public var translationTextFont: String? = "system"
    public static var fresh: Self { Self() }
    public static func validRate(_ value: Double) -> Bool { value.isFinite && (0.25...3).contains(value) }
    public static let fonts: Set<String> = ["system", "rounded", "serif", "avenir-next", "georgia", "apple-sd-gothic-neo"]

    public mutating func resetFonts() { originalTextFont = "system"; translationTextFont = "system" }
    public mutating func resetTextSizes() { originalTextSize = 20; translationTextSize = 18 }
    public mutating func resetFullscreenTextSizes() { fullscreenOriginalTextSize = 20; fullscreenTranslationTextSize = 18 }
    public func validated() throws -> Self {
        guard Self.validRate(rate), (2...4).contains(groupSize), ["bubble", "list"].contains(speechView),
              revealWPM.count == 4, revealWPM.allSatisfy({ (1...999).contains($0) }),
              [originalTextSize, translationTextSize].allSatisfy({ $0.map { (12...48).contains($0) } ?? true }),
              [fullscreenOriginalTextSize, fullscreenTranslationTextSize].allSatisfy({ (12...48).contains($0) }),
              [originalTextFont, translationTextFont].allSatisfy({ $0.map { Self.fonts.contains($0) } ?? true })
        else { throw LearningError.invalidPreferences }
        return self
    }
    private init() {}
    enum CodingKeys: String, CodingKey {
        case mode, rate, groupSize, speechView, revealWPM = "crazyWpm"
        case originalTextSize, translationTextSize, originalTextFont, translationTextFont
        case fullscreenOriginalTextSize, fullscreenTranslationTextSize
    }
    public init(from decoder: any Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard ["manual", "auto"].contains(try c.decode(String.self, forKey: .mode)) else { throw LearningError.invalidPreferences }
        rate = try c.decode(Double.self, forKey: .rate)
        groupSize = try c.decodeIfPresent(Int.self, forKey: .groupSize) ?? 2
        speechView = try c.decodeIfPresent(String.self, forKey: .speechView) ?? "bubble"
        revealWPM = try c.decodeIfPresent([Int].self, forKey: .revealWPM) ?? [150, 200, 250, 300]
        originalTextSize = try c.decodeIfPresent(Int.self, forKey: .originalTextSize)
        translationTextSize = try c.decodeIfPresent(Int.self, forKey: .translationTextSize)
        // Preserve the former video/list appearance once, then keep both settings independent.
        fullscreenOriginalTextSize = try c.decodeIfPresent(Int.self, forKey: .fullscreenOriginalTextSize) ?? originalTextSize ?? 24
        fullscreenTranslationTextSize = try c.decodeIfPresent(Int.self, forKey: .fullscreenTranslationTextSize) ?? translationTextSize ?? 16
        originalTextFont = try c.decodeIfPresent(String.self, forKey: .originalTextFont)
        translationTextFont = try c.decodeIfPresent(String.self, forKey: .translationTextFont)
        _ = try validated()
    }
    public func encode(to encoder: any Encoder) throws {
        _ = try validated()
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode("manual", forKey: .mode); try c.encode(rate, forKey: .rate)
        try c.encode(groupSize, forKey: .groupSize); try c.encode(speechView, forKey: .speechView)
        try c.encode(revealWPM, forKey: .revealWPM)
        try c.encodeIfPresent(originalTextSize, forKey: .originalTextSize)
        try c.encodeIfPresent(translationTextSize, forKey: .translationTextSize)
        try c.encode(fullscreenOriginalTextSize, forKey: .fullscreenOriginalTextSize)
        try c.encode(fullscreenTranslationTextSize, forKey: .fullscreenTranslationTextSize)
        try c.encodeIfPresent(originalTextFont, forKey: .originalTextFont)
        try c.encodeIfPresent(translationTextFont, forKey: .translationTextFont)
    }
}
