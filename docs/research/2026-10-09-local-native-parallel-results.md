# Two-device local native verification

Date: 2026-10-09. Scope: local full-test scheduling only. Application behavior,
UI assertions, timeouts, automatic GitHub Actions, manual hosted shard policy,
required checks, and human release approval remain unchanged.

## Implemented execution contract

The version-5 entry point delegates to a destination-lease supervisor. The
existing build/product checks remain in `native-full-body.sh`. An optional
`--secondary-simulator-id` selects two-device mode; absence retains the complete
serial path. The hook installer exposes the matching repository-local setting.
Pass-cache identity binds contract, exact pushed commit, toolchain, mode and
configured device identities. No cross-commit result reuse is introduced.

Two-device mode builds once and enumerates the complete compiled inventory. It
runs all native integrations first, then two UI selections concurrently. Every
XCTest command retains internal serial execution and the original diagnostics
and signing configuration. Each selection uses its own checksum-verified copy
of the inspected products, output directory and result bundle.

| Selection | Ownership | Current identifiers |
| --- | --- | ---: |
| Integration | Complete `NativeMediaIntegrationTests` target | 105 |
| UI A | Player, native foundation, download lab and bookshelf classes | 38 |
| UI B | Apple services, product, reference tools, VoiceOver, offline, native media and product accessibility classes | 37 |

The counts are observations, not validation constants. An unknown target or UI
class fails until its ownership is reviewed. Each result must match its selected
compiled identifiers. The final combined tree must match the full inventory
exactly, with no duplicate, omitted, extra, failed, skipped or expected-failure
cases. A nonzero native command remains a failure even if it exports a passing
tree. Original reports are retained; there is no automatic retry or serial
fallback that hides a failed parallel run.

## Ownership and cancellation

The supervisor acquires shared per-user destination locks in deterministic order;
these complement the hook's repository lock across clones. Only explicitly
selected, available, same-type iOS 27 Pre-push simulators are accepted. W2,
reference devices and the physical phone are not destinations.

Both serial and parallel runs drain the owned body process group and control
process groups. After simulator use, they shut down only the selected dedicated
devices and verify that guest activity has stopped. Cleanup has a shared
30-second deadline; the outer hook allows 40 seconds before forced KILL. A
cancel arriving during cleanup still fails the run. Unsettled host or guest
activity retains destination locks and cannot publish PASS. Lock owners and
diagnostics stay private. There is no automatic stale-lock removal.

A private `native-lease-*/active` marker also hands settlement state to the outer
hook. It exists before subprocess launch and is removed only after group/guest
settlement and destination-lock release. An active or unreadable marker prevents
cache publication and preserves the snapshot, archive and repository lock, even
if the supervisor itself has already exited. The hook buffers its aggregate
PASS line until successful exit and proven settlement.

Independent review found three cleanup issues before acceptance: cancellation
being ignored after the test phase, a discarded control-group drainage failure,
and an aggregate cleanup budget exceeding the hook's grace period. The fixes
were re-reviewed with no remaining important findings. The cleanup-cancellation
regression was observed failing before its fix, then passing afterward.
Follow-up review identified the outer hook deleting a snapshot after an
independently grouped descendant failed to drain; the marker handoff closes that
gap. Its missing-marker and failure/cancellation regressions were observed red
before implementation, then green. The final handoff was independently reviewed
without new actionable findings.

## Tooling verification

- Full-runner boundary regressions: 25 tests, 583 assertions, no failures, errors or skips.
- Hook/installer regressions: 38 tests, 799 assertions, no failures, errors or skips.
- Exact-result validator regressions: 10 tests, 64 assertions, no failures, errors or skips.
- Four manual hosted selections and all 5,184 aggregate-gate combinations pass.
- Syntax and `git diff --check` pass.

The runner tests execute real subprocess coordination and the real product/result
guards with synthetic Apple command boundaries. They cover disjoint execution,
actual UI-worker overlap, integration-before-UI ordering, cancellation while
workers are active, cancellation during guest shutdown, sibling failure, stuck
guests, a simulated undrainable control group, existing ownership locks, and
invalid secondary destinations. These are runner correctness tests, not proof
of simulator speed or native application behavior.

## Real simulator experiment

The isolated source snapshot includes the scoped uncommitted changes without
private local configuration. Its 322 native source/configuration/test/fixture
inputs match the preceding serial experiment byte for byte. The runner scripts
are intentionally different. No Git commit, pushed-commit acceptance record or
hook PASS-cache entry is created by this experiment.

Both test devices are iPhone 17 simulators on iOS 27.0, using Xcode 27.0
(27A266a). The existing W2 preview stays untouched. The secondary device is new;
its first boot and ensuing system initialization are included in the recorded
time. Lightweight 30-second resource samples retain load, process CPU, memory
availability and swap observations without private command arguments.

The first boot took 39 seconds. Host load rose sharply during initialization,
before concurrent UI execution, and native enumeration/integration preparation
was slower than in the serial reference. This is observed startup contention,
not evidence that a particular app assertion or parallel UI worker failed.
The 105 integration identifiers passed before both UI selections started.

### Measured result

The complete run passed **180 of 180 identical native identifiers**: integration
105, UI A 38, UI B 37. All three finalized summaries report zero failures, skips
and expected failures. Every selected result and the combined union passed exact
compiled-identifier validation. No native test was retried or removed.

| Whole-run monotonic time | Seconds | Rounded duration |
| --- | ---: | ---: |
| Prior serial run | 2,568.545 | 42m 49s |
| Two-device run | 1,745.104 | 29m 05s |
| Observed reduction | 823.440 | 32.1% |

The whole-run timer includes builds, first secondary boot, enumeration, product
copying, integration and UI execution, result validation, and verified simulator
shutdown. The UI phase—from first UI command log creation to combined case-tree
export—took **1,263.675 seconds (21m 04s)**. Individual native command times were
168.604 seconds for integrations, 1,262.593 seconds for UI A, and 1,256.275 seconds
for UI B. Those parallel times must not be added as wall time. Both UI workers
finished close together; their method-duration sums were 1,250.698 and 1,230.792
seconds, compared with 2,416.115 seconds of serial UI method time. Parallelism
shortened the elapsed interval, not the assertions or total work.

This is one observational same-machine comparison, not a repeated randomized
benchmark. The prior serial device was already in use, while the second device
was newly created. The 322 app/test/configuration/fixture inputs match, but
startup state and unrelated host activity are not controlled. No warm-run or
hosted speed guarantee is inferred.

The immutable benchmark snapshot predates the final `active`-marker handoff and
hook PASS-buffering refinement. Those changes affect failure/cancellation
bookkeeping, not the native inputs or test partition; the complete final tooling
suites above were rerun afterward. The measured native run does not create an
exact-commit hook pass. A subsequently committed revision will receive its own
full hook verification.

### Resource and cleanup observations

Across 58 resource samples, the highest one-minute load average was 442.41,
approximately 211 seconds into initialization, before UI workers started at
approximately 474 seconds. Swap already used 7,550.38 MiB before the experiment
and peaked at 10,564.00 MiB; the minimum reported system-wide memory-free
percentage was 26%. These are whole-host observations, including preexisting
applications, not isolated measurements of test memory. They support keeping
this experiment at two UI workers rather than assuming more workers help.

At completion, both selected Pre-push devices were confirmed Shutdown, their
destination locks and the experiment's repository lock were gone, and the W2
preview remained Booted. No reference/physical app was installed or replaced.
The new dedicated device is retained for future hook runs, not erased.

After final tooling verification, the repository-local hook configuration was
updated to the validated primary/secondary pair and read back successfully.
The serial fallback remains available by unsetting only
`native.prePushSecondarySimulator`. No commit, push, remote rule change, hosted
CI run, or cross-commit cache entry was made.
