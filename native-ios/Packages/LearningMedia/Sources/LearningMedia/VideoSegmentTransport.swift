import AVFoundation
import LearningDomain

/// Adapted from the reviewed reference LessonVideoPlayer, without its Expo/global bindings.
@MainActor public final class VideoSegmentTransport: MediaTransport {
    public var onEvent: (@MainActor (MediaTransportEvent) -> Void)?
    private var player = AVPlayer()
    private var candidate: AVPlayer?
    private let layers = NSHashTable<AVPlayerLayer>.weakObjects()
    private let transitionSeek: @MainActor (AVPlayer, CMTime) async -> Bool
    private var request: PreparedMediaRequest?
    private var timeline: SelectedMediaTimeline?
    private var segments: [(start: Double, end: Double)] = []
    private var member = 0
    private var generation = UUID()
    private var memberRevision = UUID()
    private var readiness: PlayerReadiness?
    private var transition: Task<Void, Never>?
    private var periodic: Any?
    private var notifications: [NSObjectProtocol] = []
    private var last = MediaPosition(seconds: 0, duration: 0)
    private var playing = false, ready = false, transitioning = false, closed = false

    public init(transitionSeek: @escaping @MainActor (AVPlayer, CMTime) async -> Bool = {
        await $0.seek(to: $1, toleranceBefore: .zero, toleranceAfter: .zero)
    }) { self.transitionSeek = transitionSeek }

    public func attach(_ layer: AVPlayerLayer) { layers.add(layer); layer.player = closed ? nil : player }
    public func detach(_ layer: AVPlayerLayer) { layers.remove(layer); layer.player = nil }

    public func prepare(_ request: PreparedMediaRequest) async throws {
        guard !closed else { throw MediaFailure.cancelled }
        pause()
        let current = generation
        guard (1...4).contains(request.sources.count), request.rate.isFinite, (0.25...3).contains(request.rate),
              let file = request.sources.first?.file, file.isFileURL, (file.host ?? "").isEmpty,
              file.query == nil, file.fragment == nil else { throw MediaFailure.invalidAsset }
        var selected: [(start: Double, end: Double)] = []
        var previousEnd = 0.0
        for source in request.sources {
            guard case let .video(url, start, end) = source, url == file, start.isFinite, end.isFinite,
                  start >= previousEnd, end > start else { throw MediaFailure.invalidAsset }
            selected.append((start, end)); previousEnd = end
        }
        let timeline = try SelectedMediaTimeline(durations: selected.map { $0.end - $0.start })
        let location = try timeline.locate(request.positionSeconds)
        self.request = request
        last = MediaPosition(seconds: request.positionSeconds, duration: timeline.duration)
        do {
            let asset = AVURLAsset(url: file)
            let duration = try await asset.load(.duration).seconds
            try ensureCurrent(current)
            guard duration.isFinite, previousEnd <= duration + 0.05,
                  !(try await asset.loadTracks(withMediaType: .video)).isEmpty else { throw MediaFailure.invalidAsset }
            var audioAvailable = false
            for track in try await asset.loadTracks(withMediaType: .audio) {
                if try await track.load(.isDecodable), !(try await track.load(.formatDescriptions)).isEmpty { audioAvailable = true; break }
            }
            try ensureCurrent(current)
            guard audioAvailable else { throw MediaFailure.invalidAsset }
            let item = AVPlayerItem(asset: asset)
            item.forwardPlaybackEndTime = time(selected[location.member].end)
            item.audioTimePitchAlgorithm = .timeDomain
            let next = AVPlayer(playerItem: item)
            next.actionAtItemEnd = .pause; next.allowsExternalPlayback = false
            candidate = next
            let wait = PlayerReadiness(item); readiness = wait
            try await wait.wait()
            if readiness === wait { readiness = nil }
            try ensureCurrent(current)
            let sought = await next.seek(to: time(selected[location.member].start + location.localSeconds),
                                         toleranceBefore: .zero, toleranceAfter: .zero)
            try ensureCurrent(current)
            guard sought else { throw MediaFailure.unavailable }
            self.timeline = timeline; segments = selected; member = location.member
            player = next; candidate = nil; ready = true
            CATransaction.begin(); CATransaction.setDisableActions(true)
            for layer in layers.allObjects { layer.player = next }
            CATransaction.commit()
        } catch {
            if current == generation { pause() }
            throw error as? MediaFailure ?? MediaFailure.unavailable
        }
    }

    public func play(token: TransportToken) throws {
        guard !closed, ready, request?.token == token, let request else { throw MediaFailure.cancelled }
        guard !playing else { return }
        if last.seconds >= last.duration { ready = false; emit(.ended(last)); return }
        playing = true; observe()
        player.playImmediately(atRate: Float(request.rate))
    }

    @discardableResult public func pause() -> MediaPosition? {
        if ready && !transitioning { sample() }
        generation = UUID(); memberRevision = UUID(); playing = false; ready = false; transitioning = false
        transition?.cancel(); transition = nil
        readiness?.cancel(); readiness = nil
        candidate?.pause(); candidate?.currentItem?.cancelPendingSeeks(); candidate = nil
        player.pause(); player.currentItem?.cancelPendingSeeks(); clearObservers()
        return request == nil ? nil : last
    }

    public func dispose() {
        guard !closed else { return }
        pause(); closed = true; player.replaceCurrentItem(with: nil)
        for layer in layers.allObjects { layer.player = nil }
        layers.removeAllObjects(); request = nil; timeline = nil; segments = []; onEvent = nil
    }

    private func time(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 60_000) }
    private func ensureCurrent(_ expected: UUID) throws {
        guard !closed, expected == generation, !Task.isCancelled else { throw MediaFailure.cancelled }
    }
    private func sample() {
        guard let timeline, segments.indices.contains(member),
              let position = try? timeline.position(member: member, localSeconds: player.currentTime().seconds - segments[member].start) else { return }
        last = MediaPosition(seconds: position, duration: timeline.duration)
    }
    private func observe() {
        guard let item = player.currentItem else { return }
        let generation = generation, revision = memberRevision
        notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemDidPlayToEndTime,
            object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.finishMember(generation: generation, revision: revision) }
        })
        notifications.append(NotificationCenter.default.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime,
            object: item, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.generation == generation, self.memberRevision == revision else { return }
                self.fail()
            }
        })
        periodic = player.addPeriodicTimeObserver(forInterval: time(0.2), queue: .main) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, self.generation == generation, self.memberRevision == revision, self.playing, !self.transitioning else { return }
                if self.player.currentItem?.status == .failed { self.fail(); return }
                self.sample(); self.emit(.position(self.last))
            }
        }
    }
    private func finishMember(generation: UUID, revision: UUID) {
        guard generation == self.generation, revision == memberRevision, playing, !transitioning,
              let timeline, let item = player.currentItem,
              CMTimeCompare(player.currentTime(), item.forwardPlaybackEndTime) >= 0 else { return }
        player.pause(); clearObservers()
        last = MediaPosition(seconds: timeline.durations.prefix(member + 1).reduce(0, +), duration: timeline.duration)
        guard member < segments.count - 1 else { playing = false; ready = false; emit(.ended(last)); return }
        transitioning = true; memberRevision = UUID()
        let next = member + 1, revision = memberRevision
        item.forwardPlaybackEndTime = time(segments[next].end)
        emit(.position(last))
        transition = Task { @MainActor [weak self] in
            guard let self, self.generation == generation, self.memberRevision == revision, self.playing else { return }
            let sought = await self.transitionSeek(self.player, self.time(self.segments[next].start))
            guard self.generation == generation, self.memberRevision == revision, self.playing, !Task.isCancelled else { return }
            self.transition = nil; self.transitioning = false
            guard sought, item.status == .readyToPlay else { self.fail(); return }
            self.member = next; self.observe()
            self.player.playImmediately(atRate: Float(self.request?.rate ?? 1))
        }
    }
    private func fail() { pause(); emit(.failed(.unavailable)) }
    private func emit(_ kind: MediaTransportEvent.Kind) {
        guard !closed, let request else { return }
        onEvent?(MediaTransportEvent(token: request.token, kind: kind))
    }
    private func clearObservers() {
        if let periodic { player.removeTimeObserver(periodic); self.periodic = nil }
        notifications.forEach(NotificationCenter.default.removeObserver); notifications = []
    }
}
