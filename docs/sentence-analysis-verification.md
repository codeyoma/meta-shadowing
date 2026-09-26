# Sentence analysis browser — #84

## Scope

This slice adds offline syntax reading, the current unit's sentence menu, and
target-language text/POS detail. It does not implement relation arrows (#85) or
the embedded Apple dictionary (#86). Analysis is an explicitly requested full
reference even when the learner's source text is hidden or still revealing.
Normal player reveal and dictionary eligibility do not change.

## Verification

- Red/green parser tests cover source-to-sentence mapping and omitted-token rejection.
- Read-only current-unit tests use actual SQLite journals: hint and silent stages
  expose reference text without changing checkpoints or XP; stale runs and access
  invalidated during reading do not publish results.
- Schema/language, original-block identity, whitespace differences, grouped units,
  malformed offsets and cross-sentence heads have automated regression coverage.
- The production list/detail component is exercised with only native/runtime
  substitutes: select the second sentence, read its POS labels, return to the list,
  and close. This is not proof of native accessibility or animation behavior.
- Production player controls open analysis before reveal completes in stages
  5, 11 and 15; a failed pause/save blocks entry in stage 13. Package revocation
  blocks entry, and analysis does not invoke the dictionary or award XP.
- The production analysis route handles invalid stages, missing/malformed data,
  denied access, replacement sessions and checkpoint-read failures. Displayed
  text disappears when its current-session authorization can no longer be read.
- Native file tests install pinned synthetic bytes in disposable storage, read them
  through the download actor, and reject missing or corrupted installation data.
- Free-package configuration includes optional pinned syntax and rejects changed
  bytes while preserving the normal-build content gate.
- The Debug Simulator app builds and runs. In dark appearance, the synthetic
  analysis lab displays two sentences; selecting the second shows the correct
  text and noun/verb/punctuation labels. Back restores both menu entries.
- The existing private source analysis passes the production validator against all
  560 package entries: 811 grammatical sentences and 8,795 tokens. No private text
  or payload is committed or included in test output.
- `npm run check` passes: 572 tests and TypeScript checking. Native delivery tests
  pass with 29 passed and one optional private-audio test skipped.

## Actual-package integration boundary

The currently prepared/installed legacy free test package has no pinned syntax
file. It remains untouched: adding a file to an already fingerprinted immutable
version is not a valid upgrade. Reading the source file successfully does not
prove installed DUO analysis works. A newly prepared installation with approved
syntax metadata must be tested separately; publishing a changed descriptor over
an existing pinned identity will correctly require a compatible package version.
No paid delivery, TestFlight upload, ownership bypass or physical-device acceptance
is claimed by the synthetic checks. Physical VoiceOver and maximum Dynamic Type
remain distinct from automated component checks.
