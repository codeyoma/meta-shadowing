# Native option-row wait pilot: measured results

Date: 2026-10-09. Baseline: `9a02defbef3737b30a3794315507570f8e1c3985`.
Scope: the owner-approved first existence-wait optimization, not parallel execution or test-layer migration.

## Implemented change

Only the row-existence assertion in `PlayerUITests/testPlayerOptionsMatchSettingsOrderForAudioAndSilentStages()` changes:

```swift
XCTAssertTrue(row.exists || row.waitForExistence(timeout: 5))
```

The six option rows are checked for each of stages 1 and 11. A row already present avoids the first polling delay. An absent row still invokes the original five-second existence wait. Both stage variants, launches, termination, all row frame/order assertions, speed-editor navigation, explicit exit, and zero-credit assertions remain unchanged. No application code, shared wait helper, other UI wait, hook, workflow, or test selection changes.

Source: [PlayerUITests.swift](../../native-ios/Tests/AppUITests/PlayerUITests.swift).

## Protocol

- Use Xcode 27.0, build 27A266a, on the same dedicated iPhone 17 iOS 27 simulator. The interactive preview/reference simulator is untouched.
- Create two isolated source archives from the same baseline commit. The optimized archive differs only by the one assertion above and exactly matches the changed workspace file.
- Build complete Debug test products for each variant using the fictional CI configuration and ad-hoc simulator signing. Execute the selected method with `test-without-building`, serial execution, and unchanged diagnostics settings. The production application sources are identical between variants.
- Run an initial original-code validation, then the primary comparison in original/optimized/optimized/original order: A2, B1, B2, A3. No compilation overlaps any primary measured execution. This is a small local paired pilot, not a statistically powered benchmark.
- A1 is retained below but excluded from the primary comparison because it was an initial validation/warm-up and overlapped compilation of the separate characterization fixture. This exclusion was recorded before optimized measurement began, not chosen after comparing its runtime.
- Record each complete result bundle, test-method duration from `xcresulttool`, and monotonic wall duration of the `xcodebuild` test command. Command duration includes runner startup and result finalization, but excludes compilation and the later JSON exports. Preserve every attempt; do not retry failures automatically.

## Results

| Run | Variant | Test-method seconds | Test-command seconds | Option-row polling waits | Outcome |
| --- | --- | ---: | ---: | ---: | --- |
| A1, initial validation | Original | 73.377 | 89.509 | 12 | Passed |
| A2 | Original | 72.216 | 79.493 | 12 | Passed |
| B1 | Optimized | 54.250 | 59.958 | 0 | Passed |
| B2 | Optimized | 53.938 | 61.399 | 0 | Passed |
| A3 | Original | 66.733 | 75.424 | 12 | Passed |

For the primary four runs:

| Metric | Original mean | Optimized mean | Mean reduction |
| --- | ---: | ---: | ---: |
| Test method | 69.475 s | 54.094 s | 15.381 s, 22.139% |
| Test command | 77.458 s | 60.678 s | 16.780 s, 21.663% |

Both optimized method durations are below both primary original durations. The original durations also vary by approximately 5.48 seconds, so the exact percentage should not be treated as a guaranteed future improvement or entirely attributed to one measured internal delay. The logs directly establish the mechanism: all twelve original option-row polling waits disappear while the immediate existence queries and subsequent frame assertions remain. Other waits continue unchanged.

Every product run finalized one passed selected method, zero failures, and zero skips. The existing identifier-aware result validator accepted all five results. Fresh enumeration of optimized test products retained exactly the same 183 compiled native identifiers as the baseline full inventory, with none disabled. Enumeration is not execution of those 183 tests. The optimized Debug application also passed the existing built-product inspection.

## Real-UI characterization: immediate, delayed, and absent

A separate throwaway SwiftUI application and XCTest UI target exercise the exact Boolean condition against real `XCUIElement` queries. They are outside the repository's app and test targets and do not add tests to the full gate. The fixture has an immediately present element, an element revealed 2.5 seconds after a button schedules its appearance, and an identifier that is never created. No network, account, reference profile, or production media is involved.

Before changing the condition, the immediate-element check fails the deliberately narrow 800-millisecond characterization budget: the original wait takes 1.061119166 seconds. The delayed and absent cases pass. This is a deliberately failing RED control in the temporary characterization fixture, not a product test failure. No `XCTExpectFailure` is used; XCTest records a normal assertion failure for that control.

After adding the immediate check, all three characterization tests pass:

1. An already-present element returns within the characterization budget.
2. An element confirmed absent before evaluation appears during the original fallback wait and returns true with its expected label.
3. A never-created element returns false after the original five-second fallback; the elapsed-time assertion requires at least 4.9 seconds.

The 800-millisecond threshold is private experiment evidence, not a new CI performance gate. The temporary fixture characterizes the query expression; the actual two-stage product runs separately verify the call site's navigation, frame order, and credit assertions.

## Review and limits

Independent static and measurement review found no blocking findings, independently recomputed both reductions, and verified the five product results and the three-case optimized characterization result. It noted that an immediate query allows geometry inspection sooner, but the old existence wait also did not guarantee settled geometry. Any later instability should be diagnosed as a readiness condition, not hidden with sleeps, longer timeouts, or retries.

Only this one test method has been optimized. The full approximately 47-minute native suite was not rerun or benchmarked in this pilot, and the measured 22.139% reduction must not be applied to its duration. No hosted CI result, complete regression pass, release readiness, or native media/device acceptance is claimed. This change is a measured small step; larger speed improvements still require the separately reviewed worker and structural experiments.

Private evidence includes A1/A2/B1/B2/A3 result bundles and logs, both source archives and built products, the original and optimized three-case characterization results, the compiled inventory, and `measurements.json`. These artifacts are not uploaded. The temporary characterization app and its UI-test runner were uninstalled from the dedicated simulator after verification; their rebuildable products and results remain available. No commit, push, PR update, or remote policy change was performed.
