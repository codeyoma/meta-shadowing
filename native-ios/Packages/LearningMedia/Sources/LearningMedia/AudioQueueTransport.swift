import AVFoundation
import LearningDomain

/// A bounded queue of untouched source files. It has no learning-store authority.
@MainActor public final class AudioQueueTransport: MediaTransport {
    public var onEvent: (@MainActor (MediaTransportEvent) -> Void)?
    private let player = AVQueuePlayer()
    private var request: PreparedMediaRequest?
    private var timeline: SelectedMediaTimeline?
    private var items: [AVPlayerItem] = []
    private var periodic: Any?
    private var notifications: [NSObjectProtocol] = []
    private var readiness: PlayerReadiness?
    private var generation = UUID()
    private var last = MediaPosition(seconds: 0, duration: 0)
    private var playing = false
    private var ready = false
    private var closed = false

    public init() { player.allowsExternalPlayback = false }

    public func prepare(_ request: PreparedMediaRequest) async throws {
        guard !closed else { throw MediaFailure.cancelled }
        pause()
        let current = generation
        guard (1...4).contains(request.sources.count), request.rate.isFinite, (0.25...3).contains(request.rate),
              request.sources.allSatisfy({ if case .audio = $0 { true } else { false } }) else { throw MediaFailure.invalidAsset }
        self.request = request
        last = MediaPosition(seconds: request.positionSeconds, duration: 0)
        do {
            var durations: [Double] = []
            for source in request.sources {
                durations.append(try await Self.duration(of: source.file))
                try ensureCurrent(current)
            }
            let timeline = try SelectedMediaTimeline(durations: durations)
            let location = try timeline.locate(request.positionSeconds)
            self.timeline = timeline
            player.removeAllItems()
            items = request.sources.map {
                let item = AVPlayerItem(url: $0.file)
                item.audioTimePitchAlgorithm = .timeDomain
                return item
            }
            for item in items[location.member...] { player.insert(item, after: nil) }
            let wait = PlayerReadiness(items[location.member])
            readiness = wait
            try await wait.wait()
            if readiness === wait { readiness = nil }
            try ensureCurrent(current)
            let sought = await player.seek(to: CMTime(seconds: location.localSeconds, preferredTimescale: 60_000),
                                          toleranceBefore: .zero, toleranceAfter: .zero)
            try ensureCurrent(current)
            guard sought else { throw MediaFailure.unavailable }
            last = MediaPosition(seconds: request.positionSeconds, duration: timeline.duration)
            ready = true
        } catch {
            if current == generation { pause(); player.removeAllItems(); items = [] }
            throw error as? MediaFailure ?? MediaFailure.unavailable
        }
    }

    public func play(token: TransportToken) throws {
        guard !closed, ready, request?.token == token, let request, let timeline else { throw MediaFailure.cancelled }
        guard !playing else { return }
        if last.seconds >= timeline.duration { ready = false; emit(.ended(last)); return }
        playing = true
        observe(generation)
        player.playImmediately(atRate: Float(request.rate))
    }

    @discardableResult public func pause() -> MediaPosition? {
        if ready { sample() }
        generation = UUID(); playing = false; ready = false
        readiness?.cancel(); readiness = nil
        player.pause()
        items.forEach { $0.cancelPendingSeeks() }
        removeObservers()
        return request == nil ? nil : last
    }

    public func dispose() {
        guard !closed else { return }
        pause(); closed = true
        player.removeAllItems(); items = []; request = nil; timeline = nil; onEvent = nil
    }

    private func ensureCurrent(_ expected: UUID) throws {
        guard expected == generation, !closed, !Task.isCancelled else { throw MediaFailure.cancelled }
    }

    private func observe(_ generation: UUID) {
        for (index, item) in items.enumerated() {
            notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
                object: item, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.ended(member: index, generation: generation) }
            })
            notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime,
                object: item, queue: .main) { [weak self] _ in
                MainActor.assumeIsolated { self?.failed(generation) }
            })
        }
        periodic = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.2, preferredTimescale: 600), queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.playing, generation == self.generation else { return }
                if self.player.currentItem?.status == .failed { self.failed(generation); return }
                self.sample(); self.emit(.position(self.last))
            }
        }
    }

    private func sample() {
        guard let timeline, let item = player.currentItem, let member = items.firstIndex(where: { $0 === item }),
              let seconds = try? timeline.position(member: member, localSeconds: player.currentTime().seconds) else { return }
        last = MediaPosition(seconds: seconds, duration: timeline.duration)
    }
    private func ended(member: Int, generation: UUID) {
        guard generation == self.generation, playing, let timeline else { return }
        let seconds = timeline.durations.prefix(member + 1).reduce(0, +)
        last = MediaPosition(seconds: seconds, duration: timeline.duration)
        if member == items.count - 1 {
            playing = false; ready = false; player.pause(); removeObservers(); emit(.ended(last))
        } else { emit(.position(last)) }
    }
    private func failed(_ expected: UUID) {
        guard expected == generation, playing else { return }
        pause(); emit(.failed(.unavailable))
    }
    private func emit(_ kind: MediaTransportEvent.Kind) {
        guard let request, !closed else { return }
        onEvent?(MediaTransportEvent(token: request.token, kind: kind))
    }
    private func removeObservers() {
        if let periodic { player.removeTimeObserver(periodic); self.periodic = nil }
        notifications.forEach(NotificationCenter.default.removeObserver); notifications = []
    }

    @concurrent private static func duration(of url: URL) async throws -> Double {
        guard url.isFileURL, (url.host ?? "").isEmpty, url.query == nil, url.fragment == nil else { throw MediaFailure.invalidAsset }
        let values = try url.resourceValues(forKeys: [.isRegularFileKey, .fileSizeKey])
        guard values.isRegularFile == true, (values.fileSize ?? 0) > 0 else { throw MediaFailure.unavailable }
        let asset = AVURLAsset(url: url)
        guard !(try await asset.loadTracks(withMediaType: .audio)).isEmpty else { throw MediaFailure.unavailable }
        let duration = try await asset.load(.duration).seconds
        let file = try AVAudioFile(forReading: url)
        guard duration.isFinite, duration > 0, file.length > 0 else { throw MediaFailure.unavailable }
        try Task.checkCancellation()
        return duration
    }
}
