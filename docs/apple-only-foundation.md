# iPhone-first foundation — #44

## Current platform direction — 2026-09-13

The owner confirmed **iPhone first, Android later**. "Apple-only" in the original
2026-09-12 decision describes the services and acceptance scope of #44–#52, not
a permanent restriction on the product. This file keeps its existing path so
historical links remain valid.

- Deliver and verify the iPhone phase on iOS 26+ first. Keep maintained Expo build
  targets iOS-only until an Android implementation and its verification exist.
- Android is a planned later phase. Its billing, content delivery, identity,
  backup/sync, migration and cross-platform purchase policy remain undecided.
  Apple purchases and private iCloud backups do not imply Android access or sync.
- Keep shared learning rules, package/version identities, local progress formats
  and tests independent of Apple service adapters. Preserve existing native
  boundaries; this decision does not require a speculative portability rewrite.
- StoreKit 2, Apple-hosted assets and private CloudKit remain the approved iPhone
  services. The no-Supabase constraint remains in force, including later planning.
- #44 is completed local foundation work. #45 purchases and #49 CloudKit backup
  are implemented locally; their real-service/device acceptance remains open.
  #46–#48 delivery and #50–#52 further recovery/acceptance remain separate work.

Android implementation, new hosted services, cross-platform entitlements and
public release each require a separately scoped decision. Android is not a
completion requirement for the current iPhone tickets.

## Original #44 scope — 2026-09-12

Approved 2026-09-12. This decision supersedes the unimplemented private-package
and email-OTP proposal. The native app must not use Supabase: no SDK, credentials,
Auth, database, storage, sync, or requests. Existing hosted resources and the
retired implementation's history remain untouched.

## Ownership of each responsibility

| Responsibility | Approved service | Delivery ticket |
| --- | --- | --- |
| One-time package purchase and restore | Verified StoreKit 2 transactions | #45 |
| Optional package delivery | Apple-Hosted Background Assets | #46–#48 |
| Local learning and installed content | Native device files and SQLite | #44 foundation, #48 recovery |
| Private user preferences and progress | CloudKit private database, local-first | #49–#51 |
| Complete real-service/device acceptance | Sandbox and TestFlight | #52 |

Minimum iOS is 26.0, maintained in `app.json` through the SDK's built-in
`ios.deploymentTarget`. It generates both the app target and Podfile property;
do not fix generated Xcode files by hand or add a deprecated build-properties
override. [Expo configuration](https://docs.expo.dev/versions/latest/config/app/).

#44 does not implement purchases, Apple-hosted downloads, accounts or sync. The
controlled bundled sample remains locally installable. Its availability flag
is not a StoreKit entitlement. Other learning methods remain deferred: preserve
all eight method definitions and sixteen stages, with manual stages 1–2 playable.
Tickets #42/#43 were permanently deleted by explicit owner request after the
Apple-only backlog was approved. Their deletion is not acceptance evidence.

## Explicit package context

- Catalog entries carry a manifest, stable book identity, canonical language and
  package version. Stage and options routes carry the exact package key.
- Unknown, absent and ambiguous keys are unavailable; never silently fall back
  to the sample. A route change remounts the player, disposing the former engine.
- Installation/readiness and audio file resolution use the selected package,
  not a module-wide sample. Each library card has its own readiness/progress.
- `LearningContext` binds checkpoint compatibility and reward identity to that
  package. The journal still commits completion, XP and checkpoint atomically.
- Preserve `morning-notes-v1`, its documents directory, SQLite schema and existing
  settings/selection keys. There is no reset or data migration. A new package
  version cannot reinterpret an old version's checkpoint; book-level XP keeps its
  established cross-version identity. Reopening never creates rewards.
- This is a bundled-source boundary, not a generic remote package parser or DRM.
  Full private DUO validation and entitlement gates belong to #47.

## Apple setup prerequisites and limits

- Local simulator foundation work requires compatible Xcode and an iOS 26+
  runtime, not account enrollment. Physical installation needs signing and an
  appropriate device. Do not invent team/container/product identifiers.
- Apple-hosted asset packs are uploaded through App Store Connect and tested
  through TestFlight. Before #46, confirm owner-authorized Developer Program /
  App Store Connect access, the app record, signing and asset-pack capability.
  Only an explicit Download action should acquire optional content; downloaded
  availability and purchase verification are separate concerns.
  [Apple Background Assets](https://developer.apple.com/documentation/BackgroundAssets).
- #45 requires an approved non-consumable product and sandbox test identity.
  Purchase authority is StoreKit, not editable local or CloudKit ownership data.
  Do not perform real-money purchases or accept paid agreements automatically.
- #49 requires CloudKit capability, a container, appropriate development versus
  production schema, signing and designated iCloud test accounts. An active
  iCloud account is required for its private database; offline/no-account learning
  still uses local state. The iCloud identity is separate from the App Store
  purchasing identity. No email signup, OTP or SMTP is needed.
  [Apple private CloudKit sample](https://github.com/apple/sample-cloudkit-privatedb).
- Guest progress must not silently become another account's data. Conflict,
  account-switch and deletion semantics are specified in #49–#51, not implemented
  here. Uninstall can still lose unsynchronized local data.
- Membership, App Store Connect permissions and physical-device readiness have
  not been verified in #44. Stop the relevant later ticket for missing access;
  do not substitute Supabase or publish private content as a workaround.
- Do not change hosted CI protections, enroll in paid services, upload commercial
  content or publicly release the app under this foundation ticket.

See [#44 verification](apple-only-verification.md) for measured results and limits.
