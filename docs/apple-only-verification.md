# #44 foundation verification — 2026-09-12

Scope: native package/version context and iOS 26 minimum. No hosted service was
configured, no content uploaded, and no purchase/authentication/sync was added.

## Automated and configuration checks

- Red/green tests exercised existing sample checkpoint compatibility, separate
  book/version checkpoints and unavailable ambiguous package keys. Real SQLite
  plus public player actions verify explicit confirmation, independent completion
  counts, idempotent XP and rejection of incompatible phrase counts.
- The full suite has 71 passing tests. Strict typechecking passes. These are
  local/domain checks, not evidence of CloudKit, StoreKit or hosted delivery.
  The staged #44 tree was also materialized separately and passed all 71 tests
  and typechecking without the pre-existing uncommitted UI edits.
- `expo prebuild --platform ios --no-clean --no-install` updates the current
  generated project. A separate empty temporary directory containing the same
  maintained config also generated successfully: app and Podfile targets 26.0.
  Existing native files and Simulator user data were not erased.
- Standalone Release build/install/launch passed on iPhone 17 Pro Max Simulator,
  iOS 26.5. Built `MinimumOSVersion` is 26.0. Dependency/compiler warnings remain;
  no native compile error occurred. The app contains its own JavaScript bundle.
- Application source, app configuration, dependencies and lockfile contain no
  Supabase reference or service configuration. Source contains no HTTP endpoint
  or fetch call. This bounded static audit is not universal network-attestation;
  real-service runtime verification belongs to #52.

## Native continuity check

- Updating the installed app preserved the existing sample, 20 XP, 1/16 completed
  stage display and saved Stage 2 practice. The library resolves to the existing
  installation without asking for another download.
- Library -> stage -> player opened the saved second sentence with its translation.
  Native playback reached the explicit confirmation state. One manual confirmation
  advanced one cycle, not a phrase or stage completion.
- Opening options paused and checkpointed the same package; the speed editor
  loaded its saved rate. Terminating and relaunching returned to the library with
  XP and stage progress unchanged. A read-only native SQLite check confirmed the
  second phrase, one confirmed cycle, speaking phase, paused state, three existing
  completed runs and unchanged 20 XP.
- Existing uncommitted mascot/rate-editor changes were present during native
  verification and remain separate from the #44 patch. No sample data was reset,
  no stage was completed by this check, and no rewards were fabricated.
- An unknown package/version deep link shows unavailable rather than opening
  the sample. Review caught and corrected a book-only selection gap: selection
  now retains the exact version, while old book-only preferences remain readable.
  A two-version regression test failed before this correction and passed after.

## Remaining limits

Independent standards and spec reviews used the owner-approved `914ff1b` baseline
with only the #44 staged patch. Standards reported zero actionable findings;
the one spec finding about version selection was fixed and re-reviewed with zero
remaining findings. The Release build was repeated successfully after that fix.

This is simulator evidence, not a physical-phone, acoustic-quality, airplane-mode
network capture, TestFlight, paid-package or cloud-recovery pass. Apple membership,
signing identity, app/product/container configuration and production schemas have
not been inspected or provisioned. See the [foundation plan](apple-only-foundation.md)
and tickets #45–#52. Original eight-method/sixteen-stage definitions remain; only
manual stages 1–2 are playable. #42/#43 were deleted, not accepted as completed.
