# Native Apple service boundary

This is the #98 implementation contract, not evidence of live Apple-service acceptance.
The reference runtime remains untouched. The shipped target links Swift packages only.

## Authority and content

- StoreKit verified, current, matching non-consumable transactions are the only paid-content authority.
  Installed files and product metadata never grant ownership. Offline access uses verified local
  StoreKit evidence, not a persisted application flag or an invented grace period.
- Foreground refresh does not force account synchronization. Only explicit Purchase and Restore
  actions can open the corresponding StoreKit interactions. Pending, cancellation, unavailable,
  unverified and failure states remain distinct.
- A replaced authority invalidates an open paid lesson even when access remains allowed. Its
  references, playback, remote controls and monitoring stop; it never resumes automatically.
- Hosted package keys and pinned descriptors come from native build configuration. Installation
  validates bytes, hashes and semantic manifests before publishing a ready directory under the
  current authorization revision. Large media reads are memory-mapped after checking file size.
- The hosted Morning Notes sample retains its separate `hosted-morning-notes` learning identity;
  its pinned wire manifest and audio remain the original sample. Other book identities are unchanged.
- Download progress is streamed without polling. Cancellation remains owned by the service,
  not by a card's view lifetime. Cache-purge failure is reported even after local materials are removed.
  Removing downloads cannot delete learning history or purchase authority.
- The existing internal local-video journey uses an explicitly supplied Debug bundle source,
  the normal library/download controls, immutable installation and original segment timing.
  Optional `syntax.json` is pinned and associated only with that installed package. It is not
  a public file-import feature or a new hosted identity. Release builds exclude its source resources.

## Profiles, sync and reset

- StoreKit and iCloud accounts are separate authorities. Cloud profile identity is derived from
  the verified account scope, which includes container and environment. Scope identifiers stay private.
- The selected local profile is remembered independently of cloud authorization. An unknown/offline
  lookup does not mean sign-out. An explicit no-account result selects guest storage. Switching closes
  the old learning/reference flow and retires its model and writer capabilities before replacement.
- Sync starts disabled. The user chooses whether to include guest history. A one-shot refresh does
  not enable automatic sync. Account records are fetched and validated before local publication.
- An unfinished explicit guest-import choice is persisted per account profile and resumes after
  failure/restart. A later explicit choice replaces it; a history reset clears it. Retry uses current
  authority for the same account. Uncommitted destructive retries require a new confirmation;
  already-persisted reset requests resume their exact intent without creating another deletion.
- All candidates are validated before reset adoption or merge. SQLite batch merge is atomic and
  bounded to 256 candidates and 64 MiB total, in addition to individual format limits. Ordinary merges
  reject incompatible reset generations; they cannot bypass a cloud deletion with old guest history.
- Conditional singleton-head publication preserves the existing private CloudKit protocol and v1–v4
  backup readers plus v5 reset envelopes. Duplicate receipts merge without awarding new practice.
  Only the exported revision accepted by the server is acknowledged; later local changes remain pending.
- One owned reconciliation operation coalesces committed revisions. Immediate conflict retries are
  bounded to three attempts, and transient retry timers are bounded. Foreground, explicit refresh,
  account notifications and connectivity recovery provide additional triggers. Backgrounding cancels
  service work. Learning never waits for a network upload.
- Local-history deletion, cloud-history deletion and download removal have separate scoped actions.
  Confirmations carry the displayed account/profile generation and foreground lifetime.
- Local deletion disables sync, retires only that profile's local cache and never writes cloud data.
  Cloud deletion records a durable request before contacting the server, conditionally establishes
  a reset generation, then adopts the accepted generation locally. Cleanup can remain pending.
  Restart reuses the same request, including unfinished guest-local resets. Retried adoption never
  erases newer same-generation learning. Stale writers from another SQLite connection are rejected.

## Private build configuration

CI uses `project-ci.yml`, a fictional app identity and no private configuration or Apple account.
Normal product inspection remains unsigned. StoreKit fixture execution uses an ad-hoc Debug
signature with `get-task-allow`; it does not require a team, provisioning profile or account.

For a designated owner-signed build, reuse the existing reference app's generated native Info.plist
and entitlements. Do not register new identities or paste their values into tracked files.

```sh
swift native-ios/scripts/configure-apple-services.swift \
  --source-info "$REFERENCE_INFO_PLIST" \
  --source-entitlements "$REFERENCE_ENTITLEMENTS" \
  --output native-ios/Generated/Services
xcodegen generate --spec native-ios/Generated/Services/project.json \
  --project-root native-ios --project native-ios
```

The mapper reads, but never edits, its source files. It copies only matching, whitelisted service
keys into the ignored output directory. `Local.xcconfig` still supplies the existing app identity
and any owner-managed signing settings. Internal free DUO content requires the explicit
`--allow-internal-content` option and remains marked as internal in the generated Info.plist.
The base and CI specs never include these generated service files implicitly.

For the existing internal video development journey, pass `NATIVE_LOCAL_VIDEO_SOURCE` as an
absolute local directory to an owner-managed Debug build. It must contain `manifest.json` and
`video/source.mp4`, with optional `syntax.json`. The native copy step rejects symlinks, copies only
those files and removes the generated `LocalVideo` resource from Release products. Never commit
the source directory or its private path. Standard CI leaves the setting empty and uses synthetic
filesystem fixtures to verify installation, analysis association and cleanup.

Configured hosted delivery adds an ExtensionKit downloader and the exact shared App Group to the
app and extension. This follows Apple's [Apple-hosted asset-pack setup](https://developer.apple.com/documentation/backgroundassets/downloading-apple-hosted-asset-packs).
Configured CloudKit allows only the selected container, environment, CloudKit service and matching
push environment. Product guards reject extra service entitlements; they do not use a broad allow-list.
Generating configuration or building the fictional extension contacts no account or cloud database.

Distribution signing adds Apple's `beta-reports-active` identity flag. The product
guard accepts it only when true and `get-task-allow` is explicitly false; configured
service capabilities must still match exactly. The app and downloader explicitly
target iPhone, and the generated downloader has a nonempty display name. Built
product checks enforce these requirements rather than inferring them from project
defaults. TestFlight uses Production CloudKit entitlements and matching build
metadata; building or uploading does not authorize schema deployment, sync or resets.

## Verification boundary

### Local verification — 2026-09-29

- All six Swift packages passed: LearningDomain 53, LearningPersistence 38,
  LearningReference 18, LearningMedia 49, AppleServices 107 and AppFoundation 69
  (334 tests total).
- The complete iOS 27 scheme passed all 96 tests, with zero failures and zero skips:
  42 UI tests, 35 native media/reference integration tests and 19 StoreKit fixture tests.
  Execution was serial with verbose diagnostic collection disabled; assertions and
  the finalized result bundle remained enabled.
- Unsigned Debug and Release builds passed the native-product guard. Clean-checkout
  configuration, exact entitlement mapping, internal video-copy boundaries, actionlint
  and all three branch-policy tests passed. The fictional downloader extension also built.
- Independent standards and specification reviews identified profile-reset, stale-result,
  background-cancellation, retry and integrated-video gaps. Regression tests reproduced
  and verified the fixes. A typed replacement for string-based `DeliveryStatus.phase`
  remains a nonblocking follow-up.

The service UI matrix verifies the normal download/removal controls, separate history
confirmations and largest Dynamic Type navigation. Dedicated long localized-price and
service-screen Reduce Motion combinations remain an unchecked follow-up, not claimed
coverage; the existing launch Reduce Motion policy tests pass.

Design decisions retain deterministic hashed account profiles plus a separate remembered
local selection; changing that mapping later requires an explicit migration. Network-session
generation and learning-writer generation remain separate so background cancellation cannot
revoke offline practice. True profile boundaries still close the old flow and revoke its writer.
Recovery input is limited to 256 candidates and 64 MiB in aggregate; larger legacy recovery
sets fail explicitly rather than allocate without a bound. Remembered identity never grants
cloud authority. Review covered a fixed staged patch against the approved base; the final
complete-scheme result was required before committing, not inferred from focused passes.

Deterministic tests use real SQLite/filesystems, controlled external transport seams, local StoreKit
fixtures, the normal native UI and iOS 27. Fixtures use public or synthetic content and isolated roots.
The service UI fixture and its bundled download adapter are Debug-only.

The iOS 27 StoreKit fixture maps injected cancellation to a public unknown error in one path and
does not faithfully reproduce declined Ask-to-Buy recovery. The adapter fails closed for that actual
fixture result. Public typed cancellation and empty-entitlement approval retry are separately tested
at the StoreKit boundary; no private error codes or skipped assertions are used.

Still pending separately authorized evidence: designated signed-device purchase/restore, real
pending/cancel/decline journeys, Apple-hosted download/cancellation, private CloudKit account switching,
quota/permission behavior, multi-device recovery and destructive reset trials using disposable data.
No live account, cloud reset, real-money purchase, schema deployment or physical installation was
performed for this implementation. Manual VoiceOver testing is excluded by the owner's decision.
Green fixtures do not close #98 or establish release parity. #99 owns final controlled cutover.
