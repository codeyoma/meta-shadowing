import Foundation
import Testing
import AppFoundation
import LearningDomain
import UIKit
@testable import MetaShadowingNative

@MainActor struct DictionaryOwnershipTests {
    @Test func cancellationBeforeUIKitStartsPresentationIsRetained() async throws {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive })
        let window = UIWindow(windowScene: scene)
        let host = DeferredDictionaryHost()
        window.rootViewController = host
        window.isHidden = false
        defer { window.isHidden = true }
        let presenter = DictionaryPresenter()
        presenter.host = host
        let id = UUID()
        var completions = 0
        presenter.present(id: id, term: "hello") { result in
            #expect(host.presentedViewController == nil)
            if case .failure = result { Issue.record("Expected an owned cancellation to succeed") }
            completions += 1
        }
        presenter.dismiss(id: id)
        #expect(completions == 0, "Cancellation must wait for the pending presentation")
        host.startPresentation()
        try await waitForMedia { completions == 1 && host.presentedViewController == nil }
        #expect(host.presentedViewController == nil)
        #expect(completions == 1)
    }
    @Test func realPresenterCancellationDuringPresentationSettlesOnce() async throws {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive })
        let window = UIWindow(windowScene: scene)
        let host = UIViewController()
        window.rootViewController = host
        window.isHidden = false
        defer { window.isHidden = true }
        let presenter = DictionaryPresenter()
        presenter.host = host
        let id = UUID()
        var completions = 0
        var succeeded = false
        presenter.present(id: id, term: "hello") { result in
            #expect(host.presentedViewController == nil,
                "A completed request must no longer own a presented drawer")
            completions += 1
            if case .success = result { succeeded = true }
        }
        #expect(host.presentedViewController != nil)
        presenter.dismiss(id: id)
        try await waitForMedia { completions == 1 && host.presentedViewController == nil }
        #expect(succeeded)
        presenter.dismiss(id: id)
        #expect(completions == 1)
        #expect(window.rootViewController === host)
    }
    @Test func playerEligibilityKeepsHiddenTextAndIncompleteRevealUnavailable() throws {
        let source = LearningSource(index: 0, text: "Hello secret", translation: "안녕 친구")
        for stage in [5, 11, 15] {
            let scope = try LearningScope(profileID: "test", packageKey: "test-v1", language: "english", book: "test", stage: stage)
            let plan = try LearningPlan.make(scope: scope, runID: "run", sources: [source], groupSize: 2)
            let session = try LearningSession.start(plan: plan, preferences: .fresh)
            let lines = try LearningUnitPresentation.make(session: session, revealOriginal: false, elapsedSeconds: 0).lines
            let values = lines.compactMap { PlayerDictionaryWords.visibleText(line: $0, session: session) }
            if stage == 5 { #expect(values.flatMap(PlayerDictionaryWords.terms) == ["Hello", "안녕", "친구"]) }
            else { #expect(values.isEmpty) }
        }
    }
    @Test func duplicateRequestsAndCancellationCannotReleaseAnotherDrawer() async {
        let presenter = DictionaryProbe()
        let owner = DictionaryRequestOwner(presenter: presenter)
        await owner.lookup(term: "hello", permits: { true }, prepare: { true })
        let first = owner.requestID
        #expect(first != nil)
        await owner.lookup(term: "world", permits: { true }, prepare: { true })
        #expect(owner.requestID == first)
        owner.cancel()
        #expect(owner.busy)
        presenter.finish()
        #expect(!owner.busy)
        await owner.lookup(term: "world", permits: { true }, prepare: { true })
        #expect(owner.requestID != first)
        owner.cancel(); presenter.finish()
    }
    @Test func failedPauseAndIneligibleTokensNeverPresent() async {
        let owner = DictionaryRequestOwner(presenter: DictionaryProbe())
        await owner.lookup(term: "hello", permits: { true }, prepare: { false })
        #expect(!owner.busy)
        await owner.lookup(term: ".", permits: { true }, prepare: { true })
        #expect(!owner.busy)
        #expect(DictionaryWords.ranges(".").isEmpty)
        #expect(DictionaryWords.ranges("😀").isEmpty)
        #expect(DictionaryWords.ranges("don't") == [NSRange(location: 0, length: 5)])
    }
    @Test func cancelledPreparationAndObsoleteCompletionCannotReplaceCurrentRequest() async {
        let presenter = DictionaryProbe()
        let owner = DictionaryRequestOwner(presenter: presenter)
        await owner.lookup(term: "hello", permits: { true }, prepare: { owner.cancel(); return true })
        #expect(!owner.busy)
        await owner.lookup(term: "hello", permits: { true }, prepare: { true })
        let staleCompletion = presenter.completion
        presenter.finish()
        await owner.lookup(term: "world", permits: { true }, prepare: { true })
        let second = owner.requestID
        staleCompletion?(.failure(DictionaryPresenter.Failure.unavailable))
        #expect(owner.requestID == second)
        #expect(!owner.failed)
        owner.cancel(); presenter.finish()
    }
    @Test(arguments: ["123", "café", "안녕", "well-known", "don't"])
    func recognizesWholeWords(_ text: String) {
        #expect(DictionaryWords.ranges(text) == [NSRange(location: 0, length: text.utf16.count)])
    }
}
// Hold only UIKit's entry point; presentation and dismissal still use real controllers.
@MainActor private final class DeferredDictionaryHost: UIViewController {
    private var pendingPresentation: (() -> Void)?
    override func present(_ controller: UIViewController, animated: Bool, completion: (() -> Void)? = nil) {
        pendingPresentation = { [weak self] in
            self?.performPresentation(controller, animated: animated, completion: completion)
        }
    }
    private func performPresentation(_ controller: UIViewController, animated: Bool, completion: (() -> Void)?) {
        super.present(controller, animated: animated, completion: completion)
    }
    func startPresentation() {
        let pending = pendingPresentation
        pendingPresentation = nil
        pending?()
    }
}
@MainActor private final class DictionaryProbe: DictionaryPresenting {
    var completion: (@MainActor (Result<Void, any Error>) -> Void)?
    func present(id: UUID, term: String, completion: @escaping @MainActor (Result<Void, any Error>) -> Void) {
        self.completion = completion
    }
    func dismiss(id: UUID) {}
    func finish() { let action = completion; completion = nil; action?(.success(())) }
}
