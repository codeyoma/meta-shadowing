# Meta Shadowing native prototype

- This is a fresh Expo / React Native / TypeScript implementation. Do not restore
  old PWA, Next.js, browser-storage, HTML-audio, backend, or admin implementation.
- Respond in English unless the user explicitly requests another language.
- Read docs/native-rebuild.md and docs/learning-contract.md before changing behavior.
- M1 is an iPhone-first, local-only prototype. No authentication, commerce, cloud
  synchronization, or hosted administration is implemented in this milestone.
- The owner-approved next round is Apple-only (#44–#52), minimum iOS 26.0.
  Read docs/apple-only-foundation.md. #44 is local foundation only; later tickets
  separately implement StoreKit 2, Apple-hosted assets and private CloudKit.
  Never use Supabase in the new app; the email/OTP proposal is superseded.
- Supabase records, Auth, and Storage are protected: no hosted mutations.
- Keep all Git history. Feature branches use codex/ and target dev; main releases
  need explicit approval. Do not merge, commit, push, deploy, delete historical
  records, or alter remote rulesets without the corresponding user request.
- Preserve privacy: no credentials, account identifiers, local user paths, signed
  URLs, private content, or audio payloads in logs, issues, or public documents.
- Use native modules for device files, SQLite, and audio; verify against installed
  Expo SDK types. Routes only in src/app; components and business logic outside it.
- Quiet by default. Show actionable errors, not routine save/connectivity notices.
- Test public behavior and durable checkpoints. Never count a resume as completion.
