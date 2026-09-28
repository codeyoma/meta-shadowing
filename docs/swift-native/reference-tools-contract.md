# Native reference tools (W6 / #97)

## Ownership

`LearningReference` validates installed schema-v1 syntax and projects source-token
relations without UI, networking or learning mutations. Off-main actors own file
reading and parsing. Source offsets use UTF-16, not Swift character indices.
The whole document, including unselected entries, is validated before returning
sentences in the requested source order.

`ProductWorkspace.readAnalysis` binds a read to its profile, an opened writer,
the current run, source plan and unit. Catalog authorization is checked before
and after reading. Active controller and persisted checkpoint checks do not
create a new writer. A fresh paused lesson need not yet have a checkpoint.
Weak controller references do not prolong closed lessons.

Syntax descriptors come from the authorized catalog, not views. Reads require a
regular, confined local file, declared byte count and SHA-256 hash. Bounds are
20,000,000 bytes, 100,000 entries, 1,000 sentences and 10,000 tokens per entry.
Missing, malformed or incompatible content fails closed.

`AnalysisModel` owns one load generation. Closing, backgrounding, lesson changes
or authority revisions clear reference state. Late results cannot publish into a
newer request. Selection is transient, not a checkpoint.

## User interaction

The options entry commits a pause before opening analysis. Native navigation
presents the current unit's sentences, POS labels, dependent-to-head graph and
textual relationship explanations. Position-based token identities distinguish
repeated words. Unknown source tags remain identifiable without invented meanings.

Explicit copy writes only the full source sentence. Its 1.5-second success
indication preserves selection. No dictionary definition is copied, logged,
cached or extracted.

Selecting a token does not open a dictionary. Explicit lookup presents Apple's
unmodified `UIReferenceLibraryViewController` through a screen-owned UIKit host.
Punctuation remains selectable but has no lookup action. System close and the
app footer dismiss only the owned dictionary. Ordinary dismissal preserves
analysis selection; background or authority invalidation clears it. Duplicate
taps cannot stack drawers.

The player supports eligible visible source and translation words. Incomplete
silent reveal has no lookup actions. Hidden source words never become link
targets or accessibility actions. Lookup requires a successful pause/checkpoint.
Dismissal never resumes playback, confirms practice or awards XP. The dictionary
footer says “사전 닫기” to avoid implying automatic playback.

## #98 handoff

The bundled sample has no syntax and correctly reports analysis unavailable.
Public synthetic syntax is generated only inside isolated Debug test profiles,
not as a production fallback. #98 must supply `ProductCatalog.syntax` from
validated installation descriptors and authoritative package access. Mutable
catalogs must emit `referenceChanges` on entitlement, installation or account
changes, even if replacement authority grants the same package. Existing files
alone never grant access. No external analysis service is contacted.

Profiles are fixed for a workspace lifetime. A future profile switch must close
the old learning flow before replacing its workspace.

## Verification

The five Swift package suites pass 200 tests: LearningDomain 53,
LearningPersistence 27, AppFoundation 57, LearningMedia 49 and LearningReference
14. They cover mapping, malformed input, file integrity, profile denial, writer
closure, authorization loss and late publication. Unicode identity uses exact
UTF-16 code units after whitespace normalization, not Swift canonical equality.
Nonzero emoji/combining-mark offsets and sentence-local head rebasing are tested.

On iOS 27, all 33 native integration tests and all four reference UI journeys
pass without skips. These verify real dictionary cancellation during presentation,
system/footer dismissal preserving analysis selection, ordinary player lookup
returning paused, unchanged XP, and final-token/relationship/copy/close reachability
at the largest Dynamic Type setting. The menu gate stays closed when an obsolete
dictionary preparation finishes behind newer options.

Independent standards and specification reviews were completed. Their actionable
findings are covered by regressions, including six independently changed request
identity fields and an old failure arriving after a newer successful load.
Debug and Release build/product guards, clean CI generation, workflow lint and
branch-policy tests pass. The full iOS 27 scheme passes all 37 UI tests and 33
native integration tests with no skips.
The analysis/select/copy/close journey also passes in dark appearance; the
isolated simulator's original light appearance was restored afterward.

Manual VoiceOver testing is excluded by owner decision, not reported as passed.
The reference graph has no custom animation requiring a Reduce Motion branch;
UIKit owns system transitions. Hardware preference behavior is not claimed as
tested. Hosted-package and StoreKit/CloudKit acceptance remain #98. No physical app,
account, cloud data, remote branch or issue state was changed for this work.
