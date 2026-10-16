import AppFoundation
import LearningDomain
import LearningMedia
import Observation
import Foundation

enum LearningOptionRoute: String, Identifiable, Hashable {
    case menu, rate, group, revealSpeed, revealPresets, display, typography, fullscreenTypography, sentences, guide, analysis
    var id: String { rawValue }
}

@MainActor @Observable final class LearningFlow {
    private(set) var runtime: NativeLearningRuntime?
    private(set) var video: VideoSegmentTransport?
    private(set) var loading = false
    private(set) var failed = false
    private(set) var accessInvalidated = false
    private(set) var closedByService = false
    private(set) var title = ""
    private(set) var options: LearningOptionRoute?
    private(set) var optionsUsePopover = false
    private(set) var analysis: AnalysisModel?
    private(set) var studyTime: StudyTimeRecorder?
    private(set) var studyExitPending = false
    let analysisPresenter: DictionaryPresenter
    let playerPresenter: DictionaryPresenter
    let analysisDictionary: DictionaryRequestOwner
    let playerDictionary: DictionaryRequestOwner
    @ObservationIgnored private var analysisRequest: AnalysisRequest?
    @ObservationIgnored private var accessChanges: Task<Void, Never>?
    private let workspace: ProductWorkspace
    @ObservationIgnored private var generation = 0
    @ObservationIgnored private var pending: Task<OpenedLesson, any Error>?
    @ObservationIgnored private var teardown: Task<Void, Never>?
    @ObservationIgnored private var openingPaused = false
    @ObservationIgnored private var closing = false
    @ObservationIgnored private var awaitingPresentation = false
    @ObservationIgnored private var optionsRevision = 0
    @ObservationIgnored private var openingOptions = false
    @ObservationIgnored private let studyClock: any StudyTimeClock
    @ObservationIgnored private var studyVisible = false
    @ObservationIgnored private var studyActive = false
    @ObservationIgnored private var studyEligible = false
    @ObservationIgnored private var pendingStudyTools: Set<UUID> = []
    init(workspace: ProductWorkspace, studyClock: any StudyTimeClock = MonotonicStudyTimeClock(),
         playerDictionaryPresenter: (any DictionaryPresenting)? = nil) {
        self.workspace = workspace
        self.studyClock = studyClock
        let analysis = DictionaryPresenter(), player = DictionaryPresenter()
        analysisPresenter = analysis; playerPresenter = player
        analysisDictionary = DictionaryRequestOwner(presenter: analysis)
        playerDictionary = DictionaryRequestOwner(presenter: playerDictionaryPresenter ?? player)
    }

    func open(packageKey: String, stage: Int, startWhenPresented: Bool = false) async {
        generation += 1
        let request = generation
        if let studyTime, !(await studyTime.close(discardUnsaved: false)) {
            if request == generation { studyExitPending = true }
            return
        }
        guard request == generation else { return }
        await releaseResources()
        guard request == generation, !Task.isCancelled else { return }
        closing = false
        studyTime = nil; studyExitPending = false; studyEligible = false
        pendingStudyTools.removeAll()
        awaitingPresentation = false
        loading = true; failed = false; accessInvalidated = false; closedByService = false
        let task = Task { [workspace] in
            try await workspace.openLesson(packageKey: packageKey, stage: stage,
                                           verifiedTestAccess: StagePathView.testAccess)
        }
        pending = task
        do {
            let opened = try await withTaskCancellationHandler { try await task.value } onCancel: { task.cancel() }
            guard request == generation, !Task.isCancelled else {
                await opened.controller.deactivate()
                return
            }
            let sources: [MediaSource] = opened.materials.media.map {
                switch $0 {
                case let .audio(file): .audio(file: file)
                case let .video(file, start, end): .video(file: file, start: start, end: end)
                }
            }
            let catalog: MediaAssetCatalog
            do {
                catalog = try MediaAssetCatalog(scope: opened.initial.snapshot.handle.scope,
                    sourceCount: opened.materials.sources.count, root: opened.materials.root, sources: sources)
            } catch {
                await opened.controller.deactivate()
                throw error
            }
            let isVideo = sources.contains { if case .video = $0 { true } else { false } }
            let video = isVideo && stage < 11 ? VideoSegmentTransport() : nil
            self.video = video
            let workspace = workspace
            let runtime = NativeLearningRuntime(controller: opened.controller, initial: opened.initial, catalog: catalog,
                authorize: { await workspace.permitsPractice($0) },
                makeTransport: { _ in if let video { video } else { AudioQueueTransport() } },
                initiallyPresented: !startWhenPresented)
            self.runtime = runtime
            let timeSession = LearningStudyTime(workspace: workspace, writerID: opened.initial.snapshot.handle.writerID)
            studyTime = StudyTimeRecorder(clock: studyClock,
                save: { try await timeSession.write($0, finishing: false) },
                finish: { try await timeSession.write($0, finishing: true) })
            runtime.onControlsChange = { [weak self, weak runtime] in
                guard let self, let runtime, self.runtime === runtime else { return }
                self.refreshStudyEligibility()
            }
            accessChanges = Task { [weak self, workspace] in
                let changes = await workspace.referenceChanges(packageKey: packageKey)
                for await _ in changes {
                    guard !Task.isCancelled else { return }
                    // Any authority revision invalidates old content, even if access is regranted.
                    self?.invalidateAnalysis()
                    self?.playerDictionary.cancel()
                    self?.accessInvalidated = true
                    self?.refreshStudyEligibility()
                    self?.runtime?.setAccess(false)
                }
            }
            title = opened.materials.book.title
            pending = nil; loading = false
            if startWhenPresented {
                awaitingPresentation = true
                runtime.setMenuOpen(true)
                _ = await runtime.coordinator.perform(.pause)
            } else if openingPaused || options != nil {
                runtime.setMenuOpen(options != nil)
                _ = await runtime.coordinator.perform(.pause)
            } else {
                _ = await runtime.coordinator.perform(.stageEntry)
            }
            refreshStudyEligibility()
        } catch {
            guard request == generation else { return }
            pending = nil; loading = false; failed = true
        }
    }
    func startPresentedLesson() async {
        guard awaitingPresentation, !closing, !accessInvalidated, let runtime else { return }
        awaitingPresentation = false
        refreshStudyEligibility()
        runtime.present()
        runtime.setMenuOpen(options != nil)
        _ = await runtime.coordinator.perform(openingPaused || options != nil ? .pause : .stageEntry)
    }

    func presentOptions(_ route: LearningOptionRoute, asPopover: Bool = false) async {
        guard options == nil, !openingOptions, !closing else { return }
        if asPopover {
            guard let runtime,
                  route == .typography || (!runtime.controls.session.isSilent &&
                    (route == .rate || (route == .fullscreenTypography && video != nil) ||
                    (route == .group && (7...10).contains(runtime.controls.session.plan.scope.stage)))) else { return }
        }
        guard let runtime else {
            if route == .menu {
                // Opening options interrupts launch intent even if dismissed before loading finishes.
                openingPaused = true
                optionsUsePopover = false
                options = .menu
            }
            return
        }
        playerDictionary.cancel()
        let request = generation
        let presentationRevision = optionsRevision
        let timePreparation = UUID()
        pendingStudyTools.insert(timePreparation)
        openingOptions = true
        optionsUsePopover = asPopover
        defer {
            pendingStudyTools.remove(timePreparation)
            if presentationRevision == optionsRevision {
                openingOptions = false
                if options == nil { optionsUsePopover = false }
            }
            if request == generation { refreshStudyEligibility() }
        }
        refreshStudyEligibility()
        runtime.setMenuOpen(true)
        let paused = await runtime.coordinator.perform(.pause)
        guard request == generation, self.runtime === runtime,
              presentationRevision == optionsRevision else { return }
        guard route == .menu || (paused.controller.active && !paused.controller.saveFailed) else {
            runtime.setMenuOpen(false)
            return
        }
        options = route
    }
    func dismissOptions() {
        optionsRevision += 1
        openingOptions = false
        invalidateAnalysis()
        options = nil
        optionsUsePopover = false
        runtime?.setMenuOpen(false)
        refreshStudyEligibility()
    }
    func suspend() {
        studyActive = false
        refreshStudyEligibility()
        if awaitingPresentation { openingPaused = true }
        playerDictionary.cancel()
        invalidateAnalysis()
        runtime?.suspend()
        if loading { generation += 1; pending?.cancel(); loading = false; failed = true }
    }
    func close(retainingPresentation: Bool = false) async {
        closing = true
        generation += 1
        let request = generation
        studyVisible = false
        refreshStudyEligibility()
        if let studyTime, !(await studyTime.close(discardUnsaved: false)) {
            if request == generation { closing = false; studyExitPending = true }
            return
        }
        guard request == generation else { return }
        optionsRevision += 1
        openingOptions = false
        awaitingPresentation = false
        loading = false; openingPaused = false
        if !retainingPresentation { options = nil; optionsUsePopover = false }
        await releaseResources(retainingPresentation: retainingPresentation)
    }
    func prepareServiceBoundary() async throws {
        studyExitPending = true
        refreshStudyEligibility()
        // Retained outgoing content is not an active learning owner. close()
        // below waits for its existing teardown before the profile can change.
        if let runtime, !closing {
            let paused = await runtime.coordinator.perform(.pause)
            guard paused.controller.active, !paused.controller.saveFailed, paused.controller.paused else {
                cancelStudyExitPreparation()
                throw ProductError.busy
            }
        }
        guard await requestStudyExit(discardUnsaved: false) else { throw ProductError.busy }
        await close()
        closedByService = true
    }
    func setStudyPresentation(visible: Bool, active: Bool) {
        studyVisible = visible; studyActive = active
        refreshStudyEligibility()
    }
    func refreshStudyEligibility() {
        let eligible = studyVisible && studyActive && !loading && !failed && !closing && !awaitingPresentation
            && !accessInvalidated && !studyExitPending && !openingOptions && pendingStudyTools.isEmpty
            && options == nil && !playerDictionary.busy
            && runtime?.controls.active == true && runtime?.controls.saveFailed == false
            && runtime?.controls.session.phase != .complete && runtime?.controls.error == nil
        let wasEligible = studyEligible
        studyEligible = eligible
        studyTime?.setEligible(eligible)
        if wasEligible && !eligible, let studyTime { Task { _ = await studyTime.flush() } }
    }
    func requestStudyExit(discardUnsaved: Bool = false) async -> Bool {
        studyExitPending = true
        refreshStudyEligibility()
        if let runtime, !closing {
            let paused = await runtime.coordinator.perform(.pause)
            // A time-only discard never bypasses an unsaved learning checkpoint.
            guard paused.controller.active, !paused.controller.saveFailed, paused.controller.paused else {
                cancelStudyExitPreparation()
                return false
            }
        }
        return await studyTime?.close(discardUnsaved: discardUnsaved) ?? true
    }
    private func cancelStudyExitPreparation() {
        studyExitPending = false
        refreshStudyEligibility()
    }
    func retryStudyTime() async -> Bool { await studyTime?.retry() ?? true }
    private func releaseResources(retainingPresentation: Bool = false) async {
        playerDictionary.cancel()
        accessChanges?.cancel(); accessChanges = nil
        invalidateAnalysis()
        let previous = teardown, opening = pending, active = runtime
        opening?.cancel(); active?.suspend()
        pending = nil
        // Closing the resources must not replace an outgoing player with the
        // initial loading view. onDisappear releases this presentation afterward.
        if !retainingPresentation { runtime = nil; video = nil }
        let task = Task {
            await previous?.value
            // The workspace revokes a writer if its open is cancelled. A catalog may
            // ignore cancellation; it must not hold the user's Close action hostage.
            // The open generation also deactivates any late successful result.
            await active?.close()
        }
        teardown = task
        await task.value
    }
    func loadAnalysis() async {
        guard let runtime, options != nil else { return }
        let request = AnalysisRequest(state: runtime.state.controller)
        guard request.matches(runtime.state.controller) else { return }
        analysisRequest = request
        let workspace = workspace
        let model = AnalysisModel(load: { try await workspace.readAnalysis($0) }, isCurrent: { [weak self, weak runtime] request in
            guard let self, let runtime, self.runtime === runtime, self.options != nil else { return false }
            return self.analysisRequest == request && request.matches(runtime.state.controller)
        })
        analysis = model
        await model.load(request)
    }
    func validateReference() {
        guard let request = analysisRequest else { return }
        if let runtime, request.matches(runtime.state.controller) { return }
        invalidateAnalysis()
    }
    func invalidateAnalysis() {
        analysisDictionary.cancel()
        analysis?.invalidate(); analysisRequest = nil
    }
    func leaveAnalysis() { invalidateAnalysis(); analysis = nil }
    func lookupAnalysis(term: String, sentenceID: String, token: Int) async {
        guard let request = analysisRequest else { return }
        await analysisDictionary.lookup(term: term, permits: { [weak self] in
            guard let self, let runtime = self.runtime else { return false }
            return self.analysisRequest == request && request.matches(runtime.state.controller)
                && self.analysis?.selectedSentenceID == sentenceID && self.analysis?.selectedToken == token
                && self.analysis?.selectedSentence?.tokens[token].text == term
        }, prepare: { [workspace] in await workspace.permitsPractice(request.scope) })
    }
    func lookupPlayer(term: String, permitsWord: @escaping @MainActor () -> Bool) async {
        guard let runtime, options == nil else { return }
        let identity = AnalysisRequest(state: runtime.state.controller)
        await playerDictionary.lookup(term: term, permits: { [weak self, weak runtime] in
            guard let self, let runtime, self.runtime === runtime, self.options == nil else { return false }
            let session = runtime.controls.session
            return runtime.controls.active && !runtime.controls.saveFailed && permitsWord()
                && session.plan == identity.plan && session.unit == identity.unit
        }, prepare: { [weak self, weak runtime, workspace] in
            guard let self, let runtime, self.runtime === runtime, !self.closing else { return false }
            let timePreparation = UUID()
            self.pendingStudyTools.insert(timePreparation)
            self.refreshStudyEligibility()
            defer {
                self.pendingStudyTools.remove(timePreparation)
                if self.runtime === runtime { self.refreshStudyEligibility() }
            }
            runtime.setMenuOpen(true)
            let paused = await runtime.coordinator.perform(.pause)
            guard paused.controller.active, !paused.controller.saveFailed, paused.controller.paused else { return false }
            return await workspace.permitsPractice(identity.scope)
        })
        // The menu gate stays closed to remote actions until the owned dictionary is gone.
        if self.runtime === runtime { dictionarySettled() }
    }
    func dictionarySettled() {
        if !playerDictionary.busy, options == nil { runtime?.setMenuOpen(false) }
        refreshStudyEligibility()
    }
}
