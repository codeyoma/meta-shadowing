# Free Swift-native learning packages — #108

Refs #108. Refs #91.

## Intent and approval boundary

The owner wants the current iPhone app to be free, with learning packages acquired
through explicit downloads and no purchase functionality. The owner approved the
design direction and public test boundaries on 2026-10-01. This document records
that design; its presence does not claim implementation or acceptance.

The updated #108 replaces its original sandbox-purchase acceptance scope. Retired
purchase checks are superseded, not passed. Purchases may be reconsidered in
roughly six months, around April 2027, through a separate approved design. There
is no activation date, timer or dormant purchase mode in this implementation.
Advertising is a possible future decision, not part of this work.

## Current implementation

The active Swift target still constructs `OwnershipService` and `PackageAccess`,
observes StoreKit transactions, and uses paid authorization leases for delivery.
`ProductServicesModel` exposes purchase and restore operations. Library actions
can navigate to `PurchaseRestoreView`; settings also exposes restoration.

`ProductServiceConfiguration` and the service configuration mapper require a
product identifier for the historically paid DUO package. Native CI prepares a
StoreKit fixture and executes purchase integration tests. These are active
commerce dependencies, not simply outdated labels.

The existing delivery implementation already validates pinned descriptors,
manifest metadata, bytes, hashes and installed paths. It serializes downloads
and atomically publishes complete installations. The profile owner, SQLite store
and optional CloudKit reconciliation are separate from purchase authority.

## Selected approach and alternatives

Remove commerce from the active Swift product rather than retaining a hidden
purchase path. Retaining dormant code would keep configuration and lifecycle
dependencies that the owner explicitly wants removed. A separately built
historical commerce module would add maintenance without a current consumer.
Git history and the untouched Expo behavioral reference already preserve the
former implementation.

Keep the existing approved Apple-hosted delivery and private CloudKit adapters.
Do not introduce a replacement backend, public file import, new hosted content,
Android services or speculative cross-platform access abstractions.

## Catalog and access

Every package explicitly offered by the configured catalog is free to download.
No package requires a StoreKit product, receipt, ownership result, refund status
or transaction observation. Unknown keys remain unavailable; free access does
not mean accepting arbitrary packages or falling back to the sample.

Remove paid classification from the active catalog, download model and access
decisions. Preserve existing package keys, learning book identities, versions,
directory layout, pinned descriptors and manifests. In particular, historical
paid identifiers must not be renamed merely to remove the word "paid": their
identity may already own durable progress. Legacy configuration names may be
accepted as delivery aliases where necessary, but must not require or enable
commerce. Emitted configuration must omit the purchase product identifier.

Private/internal-content restrictions remain independent of purchase status.
An existing internal package is not made public by this change. Packages absent
from approved configuration are not discovered, published or uploaded.

Practice and reference access require the correct profile, permitted stage and
validated installed package. Removing payment authorization does not change
stage progression, distribution-specific test access, reference eligibility,
microphone permissions or supported audio routes.

## Delivery and resource ownership

Remove StoreKit-backed authorization subscriptions, revocation gates and paid
publication leases. Keep download serialization, operation cancellation and stale
result protection owned by the delivery operation. Inspect lease consumers before
removal so no independent cancellation protection is accidentally lost.

The normal flow is explicit Download, streamed progress, validated installation,
then stage selection. Cancellation stops the owned operation. Failure has an
actionable explicit retry. Backgrounding retains the existing service lifecycle
policy; returning to the foreground never confirms practice or creates a new
download without a user action.

Keep byte/hash/manifest/version/language checks, confined filesystem paths and
atomic publication. Invalid or incomplete installations cannot become ready.
Cancelled, failed or corrupt transfers must leave unrelated installed lessons
and all learning records usable. Download removal still requires its scoped
confirmation and removes only that package's materials, not history.

Installed lessons and references remain usable offline without StoreKit or an
iCloud account. Apple-hosted acquisition may require normal platform connectivity
or service availability; those failures are download failures, not paid-access
or purchase-authentication failures.

## User interface and composition

Remove purchase, price, paid ownership, purchase restoration and purchase-outcome
screens, routes, controls and explanatory states from the active Swift app.
Library cards retain sample/free labels where useful, and the existing icon-only
download, cancel, retry, learn and content-management actions.

Remove `OwnershipService` construction, observers and commerce APIs from the app
composition and `ProductServicesModel`. Do not replace them with always-owned
purchase objects or successful fake purchase results.

Settings retains learning preferences, optional iCloud backup/recovery and
separate data-management actions. Progress recovery is not purchase restoration.
Update removal copy so it refers to retained learning history without implying
retained purchase records.

## Durable data and cloud boundaries

Do not change SQLite schemas, checkpoint identities, confirmation receipts,
package versions, profile selection, XP or settings merely to remove commerce.
Missing or historical ownership data neither blocks free content nor grants new
learning credit. Installed content is not deleted or rewritten on launch.

Keep optional private CloudKit synchronization, account/profile isolation, guest
import choices and explicit reset confirmations unchanged. A free catalog does
not grant cloud authority, enable automatic sync or allow silent replacement of
cloud history. Returning, relaunching, importing and downloading never confirm
practice.

## Build, CI and documentation

Remove obsolete native purchase fixtures, StoreKit setup schemes, commerce-only
test targets/dependencies and configuration requirements from current app gates.
Keep all remaining native tests and required job names, branch policy, shard
coverage, failure reporting, product guards and human release approval. Update
configuration tests to cover free delivery without a product identifier.

Remove unused Swift commerce source from the active target. Preserve all Git
history and the Expo reference source/tests; do not resurrect Expo CI or delete
App Store Connect products, service identities or hosted records.

Update `PRODUCT.md`, the native guide, service/UI/learning contracts and current
CI documentation. Mark older paid requirements as historical where they could
mislead current work. Do not rewrite old test outcomes as passing. Preserve
unrelated local document edits and exclude them from this change's commit.

Keep Swift 6 concurrency, iOS 26.0 deployment minimum and iOS 27 verification.
No benchmark or numerical performance target is required.

## Approved public test boundaries

Use vertical test-first slices at these boundaries:

1. Catalog/configuration and installed access: configured packages can download
   without purchase configuration; unknown or invalid packages remain unavailable.
2. Delivery operations: real filesystem validation, cancellation, explicit retry,
   corrupt content rejection and atomic installation preserve existing material.
3. Durable learning: relaunch/reopen and download operations retain checkpoints,
   XP, completion receipts and preferences, with no new practice credit.
4. Normal native UI: library/settings expose no purchase or restoration path;
   download controls and distinct iCloud recovery remain available.

Use existing public service, catalog, delivery and learning-store interfaces.
Prefer real SQLite/filesystem fixtures and controlled transport boundaries.
Do not test private implementation details or substitute animated progress for
verified installation. No sandbox purchase account or transaction fixture is
required to verify free access.

Run focused tests and Swift compilation during implementation, then all six
package suites and the complete iOS 27 native scheme at the end. Verify Debug
and Release build/configuration guards plus relevant CI scripts. Report local
package, simulator, hosted CI and physical-device results separately.

After implementation, perform independent standards and specification reviews
against this spec and the implementation base. Resolve material findings before
the requested local commit. A local commit does not authorize a push or merge.

## Acceptance and explicit exclusions

Implementation acceptance requires no active commerce path, validated explicit
free downloads, preserved offline learning/reference behavior, durable progress
and current documentation. Approved signed-build download and in-place update
checks remain physical-device acceptance, not inferred from simulator tests.
Required hosted Swift CI and merge into `dev` must be verified before #108 closes;
#91 remains open until the free-only transition is accepted.

This specification does not authorize physical-app replacement, account changes,
cloud reset, purchase, legal agreement acceptance, identity registration, asset
upload, TestFlight distribution or public release. Obtain separate applicable
approval for those actions. Keep credentials, identifiers, signed URLs, private
lesson content and recordings out of public evidence.

No advertising SDK, tracking, consent integration, Supabase mutation, Android
work, scheduled commerce activation or custom issue-closing automation is in scope.
