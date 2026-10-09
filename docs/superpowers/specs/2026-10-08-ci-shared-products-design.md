# Shared native test products and review follow-up

The owner approved applying both proposed CI improvements directly: build once
and distribute the products, and improve preparation order and shard balance.
This also includes the confirmed PR #127 remote-ownership review correction.

## Requirements

- Keep iOS 26.0 deployment, Xcode 27 and iOS 27 verification, native-only CI,
  required check names, branch policy and human release approval unchanged.
- Build the full test graph once on an unbooted simulator destination. Export
  Xcode's portable `.xctestproducts` package, archived to preserve executable
  permissions. Share only generated fictional-CI products from this workflow run.
- Four independent serial test runners download that exact artifact. Validate
  the checkout commit and Xcode version before booting; missing, incompatible or
  damaged products fail rather than rebuilding or skipping tests.
- Preserve the app install/launch preflight, all test assertions and current
  time limits. Never retry failed tests automatically.
- Move measured settings tests from the overloaded product shard to the options
  shard. Selections remain disjoint and exhaustive, including future tests.
- Keep nonempty finalized all-passed, zero-failure and zero-skip result checks.
  The stable aggregate also requires the shared build to succeed.
- Expose safe build phase names and elapsed durations, not local paths, account
  identifiers, credentials, private source content or raw diagnostics.
- Hidden lesson preparation must not activate the OS audio session, publish
  Now Playing metadata or register remote commands. Presentation claims ownership
  once; cancellation before presentation never claims it. Menus after presentation
  retain their existing ownership semantics.
- Preserve the multi-sentence detail close button: the existing one-button UI
  regression passed fresh on iOS 27, so the duplicate-close review was resolved
  with evidence rather than removing a necessary control.

## Verification and evidence

Add regression tests before each change. Locally test artifact relocation,
metadata mismatch, missing products, pipeline failure, exact shard ownership and
remote lifecycle boundaries. Run the full unchanged hosted CI after updating
PR #127; compare durations and actual case inventory with the previous run.
Local success is not a hosted performance claim. No paid runners, accounts,
physical devices, merges or ruleset changes are authorized by this work.

The successful baseline run `37714033941` took 33m 38s. Its four test jobs rebuilt
the same products in 5m 47s–8m 36s, then spent 12m 45s–19m 09s executing tests.
The product job also queued for approximately four minutes. Simulator contention
is a hypothesis; shared products remove duplicated compilation regardless.
