# Swift-native reference tools implementation plan

> **For agentic workers:** Use `superpowers:executing-plans` to implement this plan sequentially. Steps use checkbox syntax. The owner's existing sequential execution preference is preserved. Finish with the requested `code-review` standards and spec reviews.

**Goal:** Complete #97 by providing authorized offline sentence analysis, relation graphs, source copying and explicit Apple dictionary lookup without changing learning credit or reveal rules.

**Architecture:** A small `LearningReference` Swift package owns validated syntax values, relation projections and confined local-file reading. AppFoundation owns the catalog/read boundary and cancellable reference state. SwiftUI presents reference navigation; a narrowly scoped UIKit adapter owns Apple's dictionary presentation.

**Tech Stack:** Swift 6, Swift Testing, SwiftUI, UIKit, NaturalLanguage, Foundation and CryptoKit; existing XcodeGen and XCTest/XCUITest infrastructure.

**Spec:** `docs/superpowers/specs/2026-09-27-swift-native-migration-design.md`, especially sections 3–7; GitHub #97; `docs/analysis-dictionary.md`; current TypeScript reference behavior.

**Status:** Draft for owner review, 2026-09-28. No implementation or test pass is claimed. #96 is closed and its implementation is available. The detailed child plan was not previously published or approved.

## Global constraints

- Minimum iOS 26.0; verify on an isolated iOS 27 Simulator with Swift 6 concurrency checking.
- No Expo, React Native or JavaScript runtime in the shipped app. Retain reference source unchanged.
- No external analysis service, dictionary extraction/caching/export, private-subview inspection or private lesson publication.
- No performance benchmark or numerical improvement target.
- Syntax parsing and file reads run off the main actor, with bounded input and cancellable ownership.
- No learning confirmation, reward, reveal-policy mutation or automatic playback resume from reference actions.
- Keep reference authorization distinct from ordinary player hint/reveal eligibility.
- No Apple-service integration, account changes, physical-app replacement, data reset, push or release in this plan.
- Preserve unrelated dirty files. Work in the existing native checkout; record the implementation review base before edits. Do not commit the legacy root checkout or unrelated changes.
- Manual VoiceOver testing is excluded per the owner's latest direction. Retain accessible labels, selection traits, Dynamic Type and hidden-player-text tests. Do not report a manual VoiceOver pass.

## Current facts and scope decisions

- `LearningFlow.presentOptions` already commits a pause before opening reference options. Keep this boundary and its save-failure behavior.
- `LearningOptionsView` has a #97 unavailable destination; `ProductCatalog` currently supplies only bundled sample media and practice authorization.
- The bundled Morning Notes sample has no syntax file. Keep its analysis unavailable; do not invent analysis or copy private installed content into the repository.
- #97 implements and verifies the local syntax-reader boundary with public synthetic fixtures. #98 will supply validated hosted-package descriptors and service authorization. Existing files alone never establish entitlement.
- Dictionary lookup from the ordinary player must also be preserved: only currently visible, eligible target-language words are actionable. Reference selection can expose an authorized complete sentence without changing the player's masked state.
- Preserve the source tag vocabulary, Korean/English POS names, relation descriptions and dependent-to-head edge direction. Native layout may differ from the reference; do not remove graph or textual relationship information.

## Agreed-test seams proposed for approval

1. `SentenceAnalysisReader.read` and `SentenceRelations.project`: validated public values, source identity, UTF-16 offsets and edge identities.
2. `InstalledSyntaxReader.read` and `ProductWorkspace.readAnalysis`: confined file integrity, authorization and scoped requests.
3. `AnalysisModel` and dictionary ownership: observable loading/selection state, cancellation and late-result rejection through injected public boundaries.
4. Native app integration/UI: system dictionary dismissal, long graph navigation, source copy, hidden text, paused checkpoint and unchanged XP.

Tests proceed one behavior at a time: red, minimal implementation, green. Do not build a large speculative test suite before implementation.

## Review focus

1. Non-BMP characters and combining marks: interpret source offsets as UTF-16, never Swift character counts (Task 1).
2. A corrupt unselected entry: validate the whole document before exposing selected sentences (Tasks 1–2).
3. Authorization loss or a changed run/group while reading: discard old content and dictionary requests, even if the reader ignores cancellation (Task 3).
4. Dismissal during dictionary presentation: finish only the owned drawer, once, without closing analysis (Task 5).
5. A long sentence at maximum text size: every token, relationship, copy action and close action remains reachable (Tasks 4–6).

## Task 1: Validated analysis and relation values

**Files:** Create `native-ios/Packages/LearningReference/Package.swift`; `Sources/LearningReference/AnalysisSentence.swift`, `SentenceAnalysisReader.swift`, `SentenceRelations.swift`, `AnalysisVocabulary.swift`; `Tests/LearningReferenceTests/SentenceAnalysisReaderTests.swift`, `SentenceRelationsTests.swift` and public fixtures, all under that package. Add its test invocation to `.github/workflows/ci.yml` without renaming required checks.

**Interfaces:** `AnalysisToken` contains `text`, `offset`, `pos`, `head`, `relation`. `AnalysisSentence` contains `id`, `sourceIndex`, `text`, `tokens`. All are immutable, Equatable and Sendable. `SentenceAnalysisReader.read(_ data: Data, sources: [LearningSource], language: String, sourceIndices: [Int]) throws -> [AnalysisSentence]`. `SentenceRelations.project(_ sentence: AnalysisSentence, selected: Int?) -> RelationSelection`, containing ordered edges, connected indices and root status. `RelationEdge` carries dependent/head indices and the original label plus localized names/explanation.

- [ ] Add a synthetic fixture for `I read.` with `I` at UTF-16 offset 0, `read` at 2 and `.` at 6. Assert sentence ID `1:0`, NSUBJ edge 0 to 1, punctuation edge 2 to 1, root token 1 and no self-edge.
- [ ] Run `swift test --package-path native-ios/Packages/LearningReference --filter SentenceAnalysisReaderTests`; confirm the missing implementation fails.
- [ ] Port the public parser contract from `src/core/sentence-analysis.ts`: schema 1, complete true, UTF16 encoding, matching language/count, complete entries, null error, phrase numbers, normalized source matching, exact token spans, full non-whitespace coverage, ordered non-overlapping spans and sentence-local heads. Preserve selected-source order and IDs.
- [ ] Add subsequent red/green cases for empty/duplicate/out-of-range selections, malformed JSON/types, incompatible schema, wrong language/source text, gaps/overlap, cross-sentence/out-of-range heads, corrupt unselected entries, emoji and combining marks. Retain bounds: 20,000,000 input bytes, 100,000 entries, 1,000 sentences and 10,000 tokens per entry. Use iterative projections rather than recursive graph traversal.
- [ ] Port POS and Google dependency labels from `src/core/sentence-relations.ts`; unknown labels remain identifiable without invented meanings. Assert root, connected-only edges, toggle-off/all edges and invalid selection behavior through `SentenceRelationsTests`.
- [ ] Run package tests and `swift build --package-path native-ios/Packages/LearningReference`; expect zero failures. Record the focused commit for this slice.

## Task 2: Authorized installed syntax boundary

**Files:** Create `LearningReference/Sources/LearningReference/InstalledSyntaxReader.swift` and `Tests/LearningReferenceTests/InstalledSyntaxReaderTests.swift`. Modify `native-ios/Packages/AppFoundation/Package.swift`, `Sources/AppFoundation/ProductCatalog.swift`, `ProductWorkspace.swift`; create `Sources/AppFoundation/ProductAnalysis.swift` and `Tests/AppFoundationTests/ProductAnalysisTests.swift`. Wire the package in `native-ios/project.yml`.

**Interfaces:** `InstalledSyntaxFile` contains immutable `root: URL`, `relativePath: String`, `byteCount: Int`, `sha256: String`. `InstalledSyntaxReader` is an actor with `read(_ file: InstalledSyntaxFile) throws -> Data`. Extend `ProductCatalog` with `syntax(packageKey: String) async throws -> InstalledSyntaxFile?`; its default implementation returns nil so a missing descriptor never implies valid syntax. `AnalysisRequest` contains `scope: LearningScope`, `runID: String`, `writerID: UUID`, `unit: Int`, `sourceIndices: [Int]` and the pinned source values. `ProductWorkspace.readAnalysis(_ request: AnalysisRequest) async throws -> [AnalysisSentence]` reads only through its catalog. A nil syntax descriptor produces an explicit unavailable error.

- [ ] Test a temporary public fixture through the file-reader interface. Assert exact bytes; then reject traversal, absolute paths, symlink escape, non-regular files, wrong count/hash and size greater than 20,000,000 bytes before unbounded reading.
- [ ] Run `swift test --package-path native-ios/Packages/LearningReference --filter InstalledSyntaxReaderTests`; confirm red before implementing confined, bounded, SHA-256-verified reading.
- [ ] Add workspace tests for denial before reading, denial after a suspended read, wrong profile/package/source identity and absent syntax. Never accept a caller-controlled URL or treat a file's existence as authority.
- [ ] Implement the workspace boundary against catalog materials and the active scope. Map the existing `english` language to syntax `en`; preserve reference fail-closed behavior for unsupported language mappings. Compare pinned sources against catalog sources before parsing.
- [ ] Run focused workspace tests, then `swift build --package-path native-ios/Packages/AppFoundation`. A mutable fixture catalog exercises revocation; no fake live StoreKit entitlement is introduced.

## Task 3: Owned analysis session and lifecycle

**Files:** Create `native-ios/Packages/AppFoundation/Sources/AppFoundation/AnalysisModel.swift`, `Tests/AppFoundationTests/AnalysisModelTests.swift`. Modify `native-ios/App/Player/LearningFlow.swift` and `LearningOptionsView.swift` only where needed for reference ownership.

**Interfaces:** `@MainActor @Observable AnalysisModel` exposes a loading/ready/unavailable state, selected sentence ID and selected token index. `load(_ request: AnalysisRequest)`, `selectSentence(_ id: String?)`, `selectToken(_ index: Int?)`, `invalidate()` own one pending task and monotonic generation. Inject `load: @Sendable (AnalysisRequest) async throws -> [AnalysisSentence]` and `isCurrent: @MainActor (AnalysisRequest) -> Bool`; views cannot create learning commands through this model.

- [ ] Write delayed-loader tests proving only the current request publishes. Assert invalidation clears sentences and selection immediately, including when cancellation is ignored.
- [ ] Run `swift test --package-path native-ios/Packages/AppFoundation --filter AnalysisModelTests`; confirm red, then implement the model.
- [ ] Add red/green tests for changes to profile, authorization, writer, run, package version, unit or grouped source membership. A late error must not replace a newer successful state.
- [ ] Bind currentness to the active runtime and authorized workspace, not merely the visible route. Entry uses the existing committed pause; failed pause never starts analysis. Invalidate on background, close, lesson replacement and authorization/session changes. Reentry requires a fresh load; it does not resurrect old selection.
- [ ] Verify through integration tests that load/select/copy/dismiss cannot send confirm/resume commands and do not change the paused checkpoint or XP.

## Task 4: Native sentence browser and graph

**Files:** Create `native-ios/App/Reference/AnalysisBrowserView.swift`, `AnalysisDetailView.swift`, `SentenceRelationGraphView.swift`, `SentenceCopyButton.swift`. Modify `native-ios/App/Player/LearningOptionsView.swift`, `native-ios/App/ProductTestFixtures.swift`. Create `native-ios/Tests/AppUITests/ReferenceToolsUITests.swift`.

**Interfaces:** `AnalysisBrowserView(model: AnalysisModel)` owns native sentence navigation. `SentenceRelationGraphView(sentence: AnalysisSentence, selected: Int?, select: (Int?) -> Void)` draws edges from validated values and measured token positions. `SentenceCopyButton(text: String)` copies only the displayed source sentence after an explicit tap.

- [ ] Add a Debug-only synthetic syntax fixture through the ordinary catalog path, not a separate demonstration screen. Never add generated syntax to the production sample.
- [ ] Write the UI journey for options, analysis list, sentence detail, token selection, connected edges, back and close. Confirm failure against the current unavailable destination before implementation.
- [ ] Implement horizontal graph scrolling, dependent-to-head arrows, selectable punctuation, root/relationship explanations and Korean/English POS labels. Do not truncate away long tokens or final graph nodes. Use native scaling, theme colors and 44-point minimum targets.
- [ ] Implement source copy with a 1.5-second success indication; copying preserves selection. Cancel the indication when its screen is discarded. No automatic clipboard reads and no definition copying.
- [ ] Verify maximum Dynamic Type, long graphs, unknown labels, repeated tokens, light/dark appearance and Reduce Motion. Include textual relationship labels so graph meaning is not conveyed only through color or drawing.
- [ ] Run focused `ReferenceToolsUITests` on iOS 27; expect zero failures and no fixture-content skips.

## Task 5: Dictionary ownership and both entry points

**Files:** Create `native-ios/App/Reference/DictionaryWords.swift`, `DictionaryPresenter.swift`, `DictionaryRequestOwner.swift`, `AnalysisDictionaryButton.swift`, `PlayerDictionaryText.swift`. Modify `native-ios/App/Player/LearningContentView.swift`, `LearningFlow.swift`; add `native-ios/Tests/MediaIntegrationTests/DictionaryOwnershipTests.swift` and dictionary UI cases to `ReferenceToolsUITests.swift`.

**Interfaces:** `DictionaryWords.ranges(_ text: String) -> [NSRange]` retains the existing NaturalLanguage word-tokenization contract. `@MainActor DictionaryPresenting` exposes `present(id: UUID, term: String, completion: @escaping @MainActor (Result<Void, Error>) -> Void)` and `dismiss(id: UUID)`. `DictionaryRequestOwner` holds at most one request, rechecks an injected currentness predicate, and releases ownership only when presentation settles. The presenter receives an explicit screen-owned UIKit host; it must not search arbitrary windows.

- [ ] Write tokenizer tests for punctuation, emoji, whitespace, numbers, apostrophes, hyphens and non-Latin text. Require exactly one full-span word for analysis lookup; keep punctuation selectable without a lookup button.
- [ ] Write ownership tests for duplicate taps, selection change, background, closing analysis, profile/session invalidation, failure recovery, cancellation during presentation and obsolete completion arriving after a new request. Confirm red before implementing the owner.
- [ ] Adapt `modules/learning-dictionary/ios/DictionaryPresenter.swift` without its Expo wrapper. Present `UIReferenceLibraryViewController` using public UIKit only. Both system close and the app footer close only the dictionary; interactive dismissal also settles exactly once. No result scraping or installed-dictionary dependency in fixture assertions.
- [ ] Add explicit lookup to analysis selection. Tapping a graph token alone never opens the dictionary; successful dictionary close preserves analysis selection. Background or authorization invalidation clears it.
- [ ] Restore ordinary player lookup only for visible target-language words permitted by the current learning presentation. Pause and checkpoint before presenting; save failure blocks lookup. Hidden words, unrevealed suffixes and translation-only stages cannot leak target words through hit targets or accessibility.
- [ ] Verify actual system presentation and both dismissal paths on iOS 27 with a public word. Missing definitions remain Apple's UI, not an application failure. Assert unchanged XP/checkpoint and no automatic playback after dismissal.

## Task 6: Final verification, contracts and review

**Files:** Create `docs/swift-native/reference-tools-contract.md`. Update `native-ios/README.md`, `docs/swift-native/product-ui-contract.md`, `docs/native-ci.md` only for #97 boundaries and the new package. Preserve unrelated edits to AGENTS.md and PRODUCT.md.

- [ ] Run focused tests and Swift builds regularly during all earlier slices. At the end, run the complete suite for LearningDomain, LearningPersistence, AppFoundation, LearningMedia and LearningReference with `swift test --package-path native-ios/Packages/<name>`; all must pass.
- [ ] Run `bash native-ios/scripts/test-ci-configuration.sh`, then generate `native-ios/project-ci.yml`. Build Debug and Release and run the full existing scheme on the dedicated iOS 27 Simulator using the commands in `native-ios/README.md`. Run both native product guards. Do not accept new unexpected skipped tests as coverage.
- [ ] Inspect the synthetic reference journey visually at large text size, including the final token, source copy, selection persistence after system/footer close, background/reentry and the ordinary masked player. Record functional evidence, not benchmark claims.
- [ ] Document missing bundled syntax, the #98 installed-descriptor/authorization handoff, verified fixture behavior and any unresolved real-content/device checks separately. Do not mark paid-package service delivery complete.
- [ ] Record the exact implementation base SHA and run the requested `code-review` against it, using independent Standards and Spec reviewers. Address valid findings and rerun affected tests.
- [ ] Inspect the staged diff for private data and unrelated files. Verify the repository-scoped no-reply identity and commit only #97 work to the current implementation branch. No push, PR, issue closure or release without the corresponding request.

## Plan self-review

All four #97 deliverables map to Tasks 1–5. All four verification groups map to parser/file tests, lifecycle tests, native graph/dictionary tests and the privacy guard. The plan preserves the approved sequential approach. Approval of this plan also confirms the four proposed TDD seams. Before code begins, pin the branch/base and resolve whether the current already-merged feature branch should be reused or a fresh `codex/` branch selected under the repository workflow.
