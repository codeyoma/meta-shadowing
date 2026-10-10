import AVFoundation
import LearningDomain
import Observation

/// Identity of the frame selected by the native transport, not a second playback clock.
@MainActor @Observable public final class VideoPresentationState {
    public struct Frame: Equatable, Sendable {
        public let token: TransportToken
        public let member: Int
    }
    public fileprivate(set) var frame: Frame?
    fileprivate init() {}

    /// A retained outgoing frame cannot authorize captions for a pending unit or cycle.
    public func member(planID: String, unit: Int, cycle: Int) -> Int? {
        guard let frame, frame.token.planID == planID,
              frame.token.unit == unit, frame.token.cycle == cycle else { return nil }
        return frame.member
    }
}

/// Adapted from the reviewed reference LessonVideoPlayer, without its Expo/global bindings.
@MainActor public final class VideoSegmentTransport: MediaTransport {
    public let presentation = VideoPresentationState()
    public var onEvent: (@MainActor (MediaTransportEvent) -> Void)?
    private var player = AVPlayer()
    private var candidate: AVPlayer?
    private let layers = NSHashTable<AVPlayerLayer>.weakObjects()
    private let transitionSeek: @MainActor (AVPlayer, CMTime) async -> Bool
    private var request: PreparedMediaRequest?
    private var timeline: SelectedMediaTimeline?
    private var segments: [VideoMediaTimeline.Segment] = []
    private var member = 0
    private var generation = UUID()
    private var memberRevision = UUID()
    private var readiness: PlayerReadiness?
    private var transition: Task<Void, Never>?
    private var periodic: Any?
    private var captionBoundary: Any?
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
        let videoTimeline = try VideoMediaTimeline(sources: request.sources)
        let selected = videoTimeline.segments, timeline = videoTimeline.selected
        let location = try timeline.locate(request.positionSeconds)
        self.request = request
        last = MediaPosition(seconds: request.positionSeconds, duration: timeline.duration)
        do {
            let asset = AVURLAsset(url: file)
            let duration = try await asset.load(.duration).seconds
            try ensureCurrent(current)
            guard duration.isFinite, selected.last!.end <= duration + 0.05,
                  !(try await asset.loadTracks(withMediaType: .video)).isEmpty else { throw MediaFailure.invalidAsset }
            var audioAvailable = false
            for track in try await asset.loadTracks(withMediaType: .audio) {
                if try await track.load(.isDecodable), !(try await track.load(.formatDescriptions)).isEmpty { audioAvailable = true; break }
            }
            try ensureCurrent(current)
            guard audioAvailable else { throw MediaFailure.invalidAsset }
            let item = AVPlayerItem(asset: asset)
            item.forwardPlaybackEndTime = time(playbackEnd(in: selected, from: location.member))
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
            presentation.frame = .init(token: request.token, member: location.member)
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
        presentation.frame = nil
    }

    private func time(_ seconds: Double) -> CMTime { CMTime(seconds: seconds, preferredTimescale: 60_000) }
    private func ensureCurrent(_ expected: UUID) throws {
        guard !closed, expected == generation, !Task.isCancelled else { throw MediaFailure.cancelled }
    }
    private func playbackEnd(in segments: [VideoMediaTimeline.Segment], from member: Int) -> Double {
        var last = member
        while last + 1 < segments.count, segments[last].end == segments[last + 1].start { last += 1 }
        return segments[last].end
    }
    @discardableResult private func sample() -> Bool {
        guard let timeline, segments.indices.contains(member) else { return false }
        let sourceTime = player.currentTime().seconds, previous = member
        guard sourceTime.isFinite else { return false }
        // Overlapping/touching members share one native play range. Caption changes
        // never pause, seek, or replay the overlap, even if a sampling tick is late.
        while member + 1 < segments.count, segments[member].end == segments[member + 1].start,
              sourceTime >= segments[member + 1].start { member += 1 }
        guard let position = try? timeline.position(member: member, localSeconds: sourceTime - segments[member].start) else { return false }
        last = MediaPosition(seconds: position, duration: timeline.duration)
        if member != previous, let request { presentation.frame = .init(token: request.token, member: member) }
        return member != previous
    }
    private func observe() {
        guard let item = player.currentItem else { return }
        let generation = generation, revision = memberRevision
        let end = playbackEnd(in: segments, from: member)
        let boundaries = ((member + 1)..<segments.count).filter {
            segments[$0 - 1].end == segments[$0].start && segments[$0].start < end
        }.map { NSValue(time: time(segments[$0].start)) }
        if !boundaries.isEmpty {
            captionBoundary = player.addBoundaryTimeObserver(forTimes: boundaries, queue: .main) { [weak self] in
                MainActor.assumeIsolated {
                    guard let self, self.generation == generation, self.memberRevision == revision,
                          self.playing, !self.transitioning else { return }
                    if self.sample() { self.emit(.memberBoundary(self.last)) }
                }
            }
        }
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
                let crossedMember = self.sample()
                self.emit(crossedMember ? .memberBoundary(self.last) : .position(self.last))
            }
        }
    }
    private func finishMember(generation: UUID, revision: UUID) {
        guard generation == self.generation, revision == memberRevision, playing, !transitioning,
              let timeline, let item = player.currentItem,
              CMTimeCompare(player.currentTime(), item.forwardPlaybackEndTime) >= 0 else { return }
        sample()
        player.pause(); clearObservers()
        last = MediaPosition(seconds: timeline.durations.prefix(member + 1).reduce(0, +), duration: timeline.duration)
        guard member < segments.count - 1 else { playing = false; ready = false; emit(.ended(last)); return }
        transitioning = true; memberRevision = UUID()
        let next = member + 1, revision = memberRevision
        item.forwardPlaybackEndTime = time(playbackEnd(in: segments, from: next))
        emit(.memberBoundary(last))
        transition = Task { @MainActor [weak self] in
            guard let self, self.generation == generation, self.memberRevision == revision, self.playing else { return }
            let sought = await self.transitionSeek(self.player, self.time(self.segments[next].start))
            guard self.generation == generation, self.memberRevision == revision, self.playing, !Task.isCancelled else { return }
            self.transition = nil; self.transitioning = false
            guard sought, item.status == .readyToPlay else { self.fail(); return }
            self.member = next
            if let request = self.request { self.presentation.frame = .init(token: request.token, member: next) }
            self.observe()
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
        if let captionBoundary { player.removeTimeObserver(captionBoundary); self.captionBoundary = nil }
        notifications.forEach(NotificationCenter.default.removeObserver); notifications = []
    }
}
