# Meta Shadowing native migration

- `native-ios/` is the standalone Swift / SwiftUI iOS 26+ migration target.
  Read `native-ios/README.md` before changing it. Use iOS 27 Simulator for current
  verification; retain the iOS 26.0 deployment minimum. Swift 6 concurrency,
  native interaction conventions and explicit lifecycle ownership are required.
- The Expo / React Native / TypeScript app remains the behavioral reference.
  Keep its CI lane and product behavior intact during migration. Do not restore
  old PWA, Next.js, browser-storage, HTML-audio, backend, or admin implementation.
- #93 provides only the isolated synthetic Swift shell. Domain, media, complete
  UI, Apple services and release parity belong to later tickets. Do not claim a
  finished rewrite from the shell. No performance benchmarks or targets are required.
- Use a dedicated simulator for the Swift app: its existing bundle identity can
  replace the reference installation. Never implicitly replace the physical app,
  register an identity or access accounts/cloud services. Keep local identity
  settings and generated build products ignored.
- Respond in English unless the user explicitly requests another language.
- Read docs/native-rebuild.md and docs/learning-contract.md before changing behavior.
- The product roadmap is iPhone first, Android later (owner update 2026-09-13).
  Before platform, purchase, delivery, or sync changes, read the current scope in
  docs/apple-only-foundation.md. #44–#52 target iOS 26+; Android is planned, not
  implemented or an acceptance gate for this phase. Keep current build targets iOS-only.
- #44 is the local foundation. #45 StoreKit and #49 private CloudKit have local
  implementations with real-service/device acceptance still pending. Apple-hosted
  delivery remains separate work. Keep Apple service adapters outside shared
  learning contracts; future Android services and cross-platform ownership/sync
  require separate decisions, not speculative infrastructure now.
  Never use Supabase in the new app; the email/OTP proposal is superseded.
- Supabase records, Auth, and Storage are protected: no hosted mutations.
- Keep all Git history. Feature branches use codex/ and target dev; main releases
  need explicit approval. Do not merge, commit, push, deploy, delete historical
  records, or alter remote rulesets without the corresponding user request.
- Preserve privacy: no credentials, account identifiers, local user paths, signed
  URLs, private content, or audio payloads in logs, issues, or public documents.
- In the Expo reference, use native modules for device files, SQLite, and audio;
  verify against installed Expo SDK types. Routes only in src/app; components
  and business logic outside it. The Swift target has its own composition root
  and local packages; do not import Expo or a JavaScript runtime into it.
- Quiet by default. Show actionable errors, not routine save/connectivity notices.
- Test public behavior and durable checkpoints. Never count a resume as completion.
