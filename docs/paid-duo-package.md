# Paid DUO package — #47

The paid identity is `duo-33-v1`. The existing free internal test identity and
its learning records remain separate. Nothing migrates or resets existing XP,
CloudKit data, selections or sample installations.

## Private preparation

Provide an approved local directory containing five regular files:
`audio.zip`, `cover.jpg`, `info.json`, `text.txt`, `text-syntax.json`.
There must be 560 ordered source blocks/audio entries and 45 sections. Syntax
entries must match source numbers/text (whitespace-normalized for comparison).
Original metadata bytes are preserved; syntax is named `syntax.json` in the
output. Dialogue blocks remain one audio unit.

Set `APPLE_PAID_DUO_ASSET_PACK_ID` to the approved Apple asset identifier, then run:

```sh
npm run package:paid-duo -- '<approved-private-source-directory>'
```

The script validates ZIP32 paths, CRC, headers, declared/actual expanded sizes,
file types and ordering. Supported compression is stored/deflate. Encryption,
ZIP64, links, duplicates and unexpected payloads are rejected. Limits: 50 MB per
audio entry, 20 MB per metadata file, 1 GB aggregate output, 200:1 expansion,
2,000 archive entries. macOS metadata counts toward resource limits.

`afconvert` produces 64 kbps AAC/M4A. The manifest fingerprints all five sources
and all output files. `ba-package` creates `private/paid-duo/DuoPaid.aar`;
the original ZIP is not duplicated in the delivered asset. The output is
immutable: preparing over an existing directory is rejected. Temporary staging
is removed after failure. Tool failures do not print private paths or content.
These commands do not upload anything to Apple.

## Native build configuration

Enable only with prepared private files and approved values for:

- `APPLE_PAID_DUO_ENABLED=1`
- `APPLE_PAID_DUO_ASSET_PACK_ID`
- `APPLE_BOOK_PRODUCT_ID` (the existing StoreKit non-consumable mapping)
- `APPLE_ASSET_APP_GROUP`

The sample asset identifier is optional for paid-only builds. Paid, sample,
free-test and diagnostic asset identifiers must not collide. Prebuild verifies
prepared hashes and the immutable asset mapping, then pins the manifest and
complete descriptor in native configuration. Do not commit generated native
configuration or any private source/output. JS bundles import no private files.
The manifest contains learning text; this is application access control, not
content encryption or strong DRM.

Use the existing Expo prebuild/pod workflow and rebuild the native app. Fast
Refresh cannot add these bridge methods or change their pinned configuration.
An unconfigured build keeps the product visible but disables purchase/download;
an older binary missing the paid bridge fails closed.

## Access and recovery

StoreKit's verified current entitlement is the authority for purchase UI,
download entry, final installation publication and study. Catalog-price lookup
is not required for a locally verified entitlement. Browsing/purchasing never
automatically downloads content. Native ownership changes invalidate in-flight
publication; active study pauses and saves without confirming a cycle.

Once installed, all 565 pinned files must verify. Offline study is allowed when
StoreKit locally verifies ownership and files are intact. An offline refund
cannot be recognized before Apple delivers it. Revoked/unverified access does
not delete files or records. Edit mode allows explicit material removal even
without current ownership; purchase restoration is a separate explicit action.
Storage-full, permission, integrity and authorization failures are surfaced
without private payloads. Retrying does not repurchase or reset progress.

## Verification and remaining acceptance

Synthetic Node fixtures cover archive/source/build boundaries; StoreKitTest
covers native verified ownership, catalog failure and refund leases. Native
delivery tests use real temporary files with a held transport, revocation,
publication faults and retry. TypeScript tests cover malformed/reordered bridge
events, missing methods, direct-access lifecycle and real SQLite/Player recovery.
Regression tests also cover a held entitlement query returning after a newer
restore failure, and hiding existing player text/controls during reauthorization.

Run `npm run check`, `npm run bundle:ios`, and the StoreKit/delivery fixture
schemes in `tests/`. Build the native Release simulator workspace to verify the
Expo bridge dependency and Swift concurrency boundaries.

This is local implementation evidence, not App Store purchase/delivery approval.
Actual private content was inspected read-only for structural consistency; it
was not converted or uploaded during implementation. Controlled fixture tests
are not a full paid UI sandbox walkthrough. #61 retains physical Sandbox/
TestFlight download, refund, restore and airplane-mode learning checks. #45's
contract/product setup and approved asset upload remain external prerequisites.

Known minor follow-up: cancelling a paid download can show a generic failure
alert; cancellation and installed-content preservation remain covered separately.

Local verification on 2026-09-19: 344 core, 8 build-settings, 3 free-preparation
and 10 paid-preparation tests passed; TypeScript and iOS JS export passed.
StoreKit fixtures: 16 tests passed (18 parameterized runs), no skips.
Delivery fixtures: 23 tests passed (41 parameterized runs); the optional real
free-DUO fixture was skipped because its private-path environment was not set.
The native Release simulator build passed on iOS 27 with existing dependency/
deprecation warnings. Simulator tap automation did not establish an end-to-end
UI walkthrough, so no paid UI acceptance is claimed.
