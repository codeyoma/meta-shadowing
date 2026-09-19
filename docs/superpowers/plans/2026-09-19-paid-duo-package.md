# Paid DUO Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Connect verified StoreKit ownership to explicit DUO download and offline study, preserving private source material and existing progress.

**Architecture:** Reuse PackagePurchases, PackageDownload, PackageInstallation and LearningContext. Add a native authority boundary shared by purchase presentation and delivery, plus a package-specific catalog adapter. Treat ownership, configuration and installation as independent states; all paths fail closed when authorization cannot be verified.

**Tech Stack:** Existing Expo 57 / React Native 0.86 / TypeScript 6, Swift 6, StoreKit 2, BackgroundAssets, SQLite, Node built-ins for preparation.

**Spec:** ../specs/2026-09-19-paid-duo-package-design.md

## Global Constraints

- iPhone iOS 26+ only; no Android, new backend or Supabase.
- DUO source and output stay outside Git in ignored private storage.
- Input: audio ZIP, cover, information, text and syntax; preserve originals.
- Exactly 560 source blocks and audio files, 45 sections; dialogue remains one source block.
- ZIP limits: 50 MB expanded per entry, 1 GB expanded total, 20 MB per metadata file, 200:1 compression ratio, 2,000 entries. MB/GB mean decimal bytes.
- No automatic limit increases. Reject encrypted or unsupported archive formats, unsafe paths, duplicate names, symlinks and declared-size mismatches.
- Existing free-test identity/progress remains separate from the paid package.
- Do not modify current learning methods, reward rules or CloudKit reset semantics.
- StoreKit, not mutable JS/cloud flags, grants access. No forced AppStore.sync during routine refresh.
- No private payloads, identifiers or resolved local paths in logs, docs or test fixtures.
- Current branch: codex/47-paid-package, based on dev dec5520. Preserve the separate #52 branch.
- Do not commit, push, upload, modify App Store Connect or test destructive device operations without the corresponding user request (AGENTS.md overrides automatic commit steps).
- Complete local verification is not real-service acceptance. #61 retains physical-device gates.

## Review Focus

1. Refund or verification failure between authorization and publication: late results must not reopen paid access (Tasks 3–4).
2. Offline product-price lookup fails but a locally verified entitlement exists: allow installed study without fabricating ownership (Tasks 3, 5).
3. Correctly named ZIP entry has malicious central/local headers, false size or a symlink mode: reject before preparing content (Task 1).
4. An older binary lacks the new native bridge: import safely, show unavailable, never grant access (Task 5).
5. A restored selection or direct route targets the paid book while a purchase check is pending: no text/audio bypass and no progress loss (Task 6).

## File boundaries

- scripts/duo-archive.cjs and its test: bounded ZIP parsing/decompression only.
- scripts/paid-duo.cjs and its test: source mapping, immutable manifest, build configuration.
- scripts/package-paid-duo.mjs: local preparation CLI, conversion and Apple packaging.
- modules/package-store/ios/PackageAccess.swift: public read-only authority boundary over the shared PackagePurchases owner.
- modules/package-store/ios/PackagePurchases.swift and PackageStoreModule.swift: shared lifecycle and native entitlement revisions; preserve existing purchase behavior.
- modules/package-delivery/ios/PaidPackageDownload.swift: paid authorization and cancellation coordination, not a second installer.
- PackageInstallation.swift, PackageDownload.swift and PackageStorage.swift: fixed paid file allowlist, guarded final publication and exact-key containment.
- src/core/paid-package.ts and paid-access.ts: validated package shape and UI-only access presentation.
- src/native/paid-package.ts: native calls, revision-safe subscription, package access.
- src/components/paid-library-book.tsx: paid card uses existing visual controls.
- src/core/paid-learning-access.ts: testable lifecycle authorization guard.
- Existing catalog, package/storage adapters, lesson/player routes: connect the paid descriptor and guard to the existing learning flow.
- docs/paid-duo-package.md: reproducible local commands and limitations.

No broad reorganization of existing modules.

## Task 1: Bounded archive validation

**Files:** Create scripts/duo-archive.cjs, scripts/duo-archive.test.cjs, tests/fixtures/zip-fixture.cjs.

**Interfaces:**

```ts
type AudioEntry = { name: string; bytes: Buffer };
readDuoAudioZip(zip: Buffer, count: number): AudioEntry[];
// returns numeric order 001.mp3..NNN.mp3; no filesystem extraction
makeZip(entries: {name: string; data: Buffer; mode?: number}[]): Buffer;
// synthetic test helper with real CRC and central/local headers
```

- [ ] Add synthetic stored/deflated ZIP fixture builder. It must never read private sources.
- [ ] Add tests for the real public parser:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readDuoAudioZip } = require('./duo-archive.cjs');
const { makeZip } = require('../tests/fixtures/zip-fixture.cjs');
test('rejects named symlink entries before conversion', () => {
  const zip = makeZip([{ name: '001.mp3', data: Buffer.from('target'), mode: 0o120777 }]);
  assert.throws(() => readDuoAudioZip(zip, 1));
});
test('preserves ordered complete input', () => {
  const zip = makeZip([
    { name: '002.mp3', data: Buffer.from('two') },
    { name: '001.mp3', data: Buffer.from('one') },
  ]);
  assert.deepEqual(readDuoAudioZip(zip, 2).map(x => x.name), ['001.mp3', '002.mp3']);
});
```

- [ ] Run `node --test scripts/duo-archive.test.cjs`; confirm the missing parser fails.
- [ ] Implement EOCD/central-directory bounds, exact local-header matching, CRC verification and bounded data reads using Buffer plus node:zlib. Reject ZIP64, multi-disk, encryption and methods other than stored/deflate for this bounded importer; report unsupported format without auto-relaxation.
- [ ] Enforce declared and actual expanded bytes, total size, ratio and entry count before returning. Include known macOS metadata in resource accounting even when excluded from learning input. Never follow archive paths.
- [ ] Add failure vectors for truncated directory, header mismatch/overlap, CRC mismatch, duplicates, traversal, absolute/backslash paths, oversized/over-ratio output, missing audio and unexpected payload. Test each rejection using small synthetic headers rather than allocating gigabytes.
- [ ] Verify all parser tests pass; review the parser independently of Apple services.

## Task 2: Immutable paid package preparation and build mapping

**Files:** Create scripts/paid-duo.cjs, scripts/paid-duo.test.cjs, scripts/package-paid-duo.mjs. Modify modules/package-delivery/app.plugin.js and package.json.

**Interfaces:**

```ts
type PaidFile = { file: string; bytes: number; sha256: string };
type PaidBuildDescriptor = {
  key: 'duo-33-v1';
  files: PaidFile[];
};
preparePaidDuo(source: string, output: string): Promise<void>;
configurePaidDuo(plist: Record<string, unknown>, env: Record<string,string|undefined>, root: string): void;
```

Fixed output metadata names: manifest.json, cover.png, info.json, text.txt, syntax.json.
Inspect source filename/cover/syntax structure read-only before mapping. Do not guess extensions or turn non-PNG bytes into a PNG name. If the supplied cover is not PNG, amend the fixed allowlist and tests consistently before preparation; document the actual supported representation.

Paid manifest ID is duo-33, version 1. Phrase/audio identity stays ordered and uses audio/phrase-NNN.m4a. Source fingerprints cover all five source inputs; metadata copies retain exact bytes. Do not ship a second copy of audio.zip.

- [ ] Add tests requiring all five inputs, exact counts, regular files only, metadata limits, unique phrases, complete output hashes and refusal to overwrite an existing version. Use synthetic metadata/source blocks, not copied DUO lines.
- [ ] Write a build-gate red test:

```js
test('disabled builds remove stale paid configuration', () => {
  const plist = { PaidDuoManifest: 'stale', PaidDuoDescriptor: 'stale', PaidDuoAssetPackID: 'stale' };
  configurePaidDuo(plist, {}, '.');
  assert.deepEqual(plist, {});
});
```

- [ ] Run `node --test scripts/paid-duo.test.cjs` and confirm red.
- [ ] Reuse parseDuo from free-duo.cjs and Task 1's bounded archive reader. Convert only accepted audio with existing afconvert arguments; record conversion tool/version in private output metadata without local paths.
- [ ] Stage in a unique private subdirectory, verify every file after writing, invoke ba-package there, rename only a fully prepared output. Use finally cleanup restricted to that exact temporary directory.
- [ ] Configure only when APPLE_PAID_DUO_ENABLED=1, APPLE_PAID_DUO_ASSET_PACK_ID and APPLE_ASSET_APP_GROUP are present, and LearningBookProductID is configured consistently. Use existing StoreKit product env configuration after checking its actual key in the store plugin; do not introduce a second product-ID source.
- [ ] Fail incomplete configuration, stale descriptors and free/paid/sample asset-ID collisions. Existing free build gating must remain unchanged.
- [ ] Keep private manifest content out of JS imports. Supply native pinned manifest/descriptor through existing build-time private-input conventions. A normal build has no paid content when configuration is disabled.
- [ ] Add `package:paid-duo` and `test:paid-duo` scripts; include preparation/build-gate tests in npm run check and verify fixture-only CI works without private input.
- [ ] Run new tests plus `node --test scripts/free-duo.test.cjs`; verify source/output ignore rules.

## Task 3: One native StoreKit authority for purchase and paid access

**Files:** Create modules/package-store/ios/PackageAccess.swift and tests/storekit/Tests/PackageAccessTests.swift. Modify PackagePurchases.swift and PackageStoreModule.swift.

**Interfaces:**

```swift
public struct PackageAccessSnapshot: Sendable {
  public let revision: Int
  public let allowed: Bool
}
@MainActor public final class PackageAccess {
  public static let shared: PackageAccess
  public func refresh() async -> PackageAccessSnapshot
  public var snapshot: PackageAccessSnapshot { get }
  public func subscribe(_ callback: @escaping @MainActor (PackageAccessSnapshot) -> Void) -> UUID
  public func unsubscribe(_ id: UUID)
}
```

Use a shared native PackagePurchases instance owned by this authority, with subscription fanout. Existing StoreModule purchase/restore calls use that same instance. Product ID comes from the native bundle, never JS. Tests construct isolated authorities through an internal initializer accepting the test PackagePurchases instance.

- [ ] Extend StoreKitTest cases to obtain authority before/after purchase, restore, revocation and local verification failure. Test catalog failure separately from verified entitlement.
- [ ] Add the key invariant as a test assertion after every transition:

```swift
#expect(access.snapshot.allowed == (
  store.snapshot.ownership == .owned &&
  store.snapshot.entitlementIssue == .none
))
```

- [ ] Generate tests/storekit/PackageStoreTests.xcodeproj using the existing project.yml; run on a disposable simulator and observe failing new cases.
- [ ] Factor entitlement-only refresh out of catalog lookup so offline access does not depend on obtaining price. Retain unknown versus revoked distinctions.
- [ ] Refactor ownership subscription lifecycle to one owner; destroying one Expo bridge subscriber must not stop observation required by delivery.
- [ ] Increment access revision when authorization changes or a verification attempt invalidates prior work. Reject stale async entitlement results. Never persist an application-owned permission flag.
- [ ] Run StoreKit tests and npm run typecheck. Record real StoreKitTest evidence separately from fixture-only failure seams.

## Task 4: Paid delivery with atomic guarded publication

**Files:** Create modules/package-delivery/ios/PaidPackageDownload.swift and tests/delivery/Tests/PaidDeliveryTests.swift. Modify PackageDownload.swift, PackageInstallation.swift, PackageStorage.swift, PackageDeliveryModule.swift, PackageDelivery.podspec and tests/delivery/project.yml.

**Interfaces:**

```swift
// Native coordinator consumes authorization closure, not a JS-owned boolean.
typealias PaidAuthorization = @Sendable () async -> (revision: Int, allowed: Bool)
// PaidPackageDownload exposes status/start/cancel/storage/remove with fixed native descriptor.
// Add a synchronous final-commit guard to the install transaction.
func install(_ package: DeliveryPackage,
             source: (String) throws -> Data,
             authorizeCommit: () throws -> Void) throws
```

Keep the original install overload/default for free/sample callers. Prepare all files before final publication. Coordinate the final authorization check and move on one serialized native boundary: a generation cannot change between checking it and publishing. Do not put an awaited network request inside filesystem commit.

- [ ] Add tests for denied start (transport untouched), revocation during held transport, denied commit, late cancellation completion and successful retry following renewed verified ownership.
- [ ] Add a throwing final-commit regression:

```swift
#expect(throws: CancellationError.self) {
  try installer.install(package, source: { _ in data },
    authorizeCommit: { throw CancellationError() })
}
#expect(try !installer.isInstalled(package))
```

- [ ] Run delivery fixture tests and observe red before implementation.
- [ ] Add native paid coordinator using existing installer/transport. Depend on PackageStore via podspec, not a circular store-to-delivery dependency. In tests, compile shared authority sources into the fixture target and conditionally import the pod module only where needed.
- [ ] Pin paid descriptor/asset mapping from native bundle; reject JS-supplied product IDs, descriptors and paths. No unguarded sample or free method accepts duo-33-v1.
- [ ] Extend fixed metadata and exact package-key allowlists. Validate aggregate size and required metadata alongside audio. Keep legacy sample/free allowlists valid.
- [ ] Publish native paid access events on revocation/failure, cancel in-flight work, and retain installed files on access loss. Storage and explicit scoped removal remain available without ownership.
- [ ] Add failure tests for disk-full and permission-denied publication through a narrow filesystem fault seam; assert no ready marker, no loss of prior valid installation, clean retry and no journal mutation.
- [ ] Bridge functions: paidDuoStatus, paidDuoStart, paidDuoCancel, paidDuoStorage, paidDuoRemove, paidDuoAccess. Constant paidDuoManifest is null when unconfigured. Event onPaidDuoAccess carries revision and allowed only.
- [ ] Run delivery plus StoreKit fixtures; verify all error output is sanitized.

## Task 5: Paid package adapter and library states

**Files:** Create src/core/paid-package.ts, src/core/paid-package.test.ts, src/core/paid-access.ts, src/core/paid-access.test.ts, src/native/paid-package.ts, src/components/paid-library-book.tsx.
Modify modules/package-delivery/index.ts, src/native/catalog.ts, src/native/package.ts, src/native/package-storage.ts, src/core/library-presentation.ts, src/components/package-purchase-card.tsx and library card composition.

**Interfaces:**

```ts
type PaidAccess = { revision: number; allowed: boolean };
type PaidAction = 'unavailable' | 'verify' | 'purchase' | 'download' | 'study';
paidAction(input: {
  configured: boolean; ownership: 'owned' | 'notOwned' | 'unknown';
  authorized: boolean; installed: boolean;
}): PaidAction;
readPaidPackage(json: unknown): LearningPackage | null;
const paidDuoActions: {
  status(): Promise<DeliveryStatus>; start(): Promise<void>; cancel(): Promise<void>;
  storage(): Promise<{bytes:number; installed:boolean; busy:boolean}>;
  remove(): Promise<{cacheCleared:boolean}>;
  access(): Promise<PaidAccess>;
};
```

- [ ] Add state-matrix red tests:

```ts
assert.equal(paidAction({configured:true,ownership:'owned',authorized:false,installed:true}), 'verify');
assert.equal(paidAction({configured:true,ownership:'owned',authorized:true,installed:false}), 'download');
assert.equal(paidAction({configured:true,ownership:'owned',authorized:true,installed:true}), 'study');
assert.equal(paidAction({configured:false,ownership:'owned',authorized:true,installed:true}), 'unavailable');
```

- [ ] Test strict paid manifest identity, unique ordered 560 phrases, pinned files, translations and version. Invalid/absent native manifest must not populate a usable catalog entry.
- [ ] Run `npx tsx --test src/core/paid-*.test.ts`; confirm red.
- [ ] Implement package adapter and bridge fallbacks; missing new methods or malformed events revoke access, not silently succeed. Ignore older revisions. After bridge errors require fresh native authorization.
- [ ] Keep sample/free records unchanged. Avoid static owned=true granting paid permission: catalog availability is not authority.
- [ ] Reuse card download progress/cancel/remove controls. Replace disabled paid placeholder with verified actions. Keep StoreKit localized title/price and distinguish purchase verification from material readiness.
- [ ] Respect editing mode, pending work and storage-read failures. Failed download provides retry, not repurchase. No automatic download on purchase or library mount.
- [ ] Test older native binary fallback, reordered events, all ownership/material combinations, and existing free/sample presentation.
- [ ] Run targeted new/old library, free-test, bridge and storage tests plus npm run typecheck.

## Task 6: Guard direct learning entry and active playback

**Files:** Create src/core/paid-learning-access.ts and src/core/paid-learning-access.test.ts.
Modify src/app/player.tsx, src/app/(tabs)/lesson.tsx, src/app/player-options.tsx, src/app/player-info.tsx and src/native/audio.ts only at existing access/audio boundaries.

**Interfaces:**

```ts
type AccessSource = {
  refresh(): Promise<PaidAccess>;
  subscribe(fn: (snapshot: PaidAccess) => void): () => void;
};
class PaidLearningAccess {
  constructor(source: AccessSource, revoke: () => void);
  enter(): Promise<boolean>;
  allowed(): boolean;
  dispose(): void;
}
```

Free/sample callers use existing flow; the guard is paid-specific. Any successful native entry response is still subject to newer revoke events.

- [ ] Add tests with a small in-test AccessSource using an array of listeners and a held refresh promise:

```ts
test('late entry success cannot override a newer denial', async () => {
  let finish!: (value: PaidAccess) => void;
  let emit!: (value: PaidAccess) => void;
  const source: AccessSource = {
    refresh: () => new Promise(resolve => { finish = resolve; }),
    subscribe: callback => { emit = callback; return () => {}; },
  };
  let stopped = 0;
  const guard = new PaidLearningAccess(source, () => { stopped++; });
  const entered = guard.enter();
  emit({revision: 2, allowed: false});
  finish({revision: 1, allowed: true});
  assert.equal(await entered, false);
  assert.equal(guard.allowed(), false);
  guard.dispose();
});
```

- [ ] Run the new file, confirm red, then implement revision/lifecycle guards.
- [ ] Check authorization before reading/displaying paid content and before constructing audio/player. Recheck after each awaited initialization step; abandoned screen setup cannot start late audio.
- [ ] Subscribe during active use. On denial cancel sentence-entry autoplay, pause/checkpoint, block confirm/resume/repeat/next and options-triggered restart. Keep recovery/leave UI usable when saving fails.
- [ ] Prevent direct player-info/options routes from exposing paid content or mutating learning without authorization; do not equate iCloud profile authorization with purchase authorization.
- [ ] Cover entitlement change while app inactive, pending refresh, disposed screen, restore selection and error-retry callbacks. No automatic XP award on access loss or restoration.
- [ ] Add a real SQLite/Player regression: save an unfinished cycle, deny access, verify checkpoint/XP unchanged except paused media position, reauthorize and resume the same package/version.
- [ ] Run all paid tests, player and learning-context regressions; run npm run typecheck.

## Task 7: End-to-end local verification and handoff

**Files:** Create docs/paid-duo-package.md; modify package.json and .github/workflows/ci.yml only if new test commands are not already reached by existing checks.

- [ ] Run `npm run check` including new preparation tests; record fresh counts, not historical #52 counts.
- [ ] Run `EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 npm run bundle:ios`.
- [ ] Generate StoreKit and delivery fixture projects and run their schemes on an installed disposable iOS simulator. Use xcrun simctl list devices available to select a real available simulator; keep its identifier out of public evidence.
- [ ] Regenerate the iOS workspace only through the existing documented Expo workflow after inspecting generated local state for user changes. Never hand-edit generated project/pod settings to hide errors.
- [ ] Run standalone Release simulator build:

```sh
EXPO_NO_DOTENV=1 EXPO_NO_TELEMETRY=1 xcodebuild \
  -workspace ios/app.xcworkspace -scheme app -configuration Release \
  -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO -quiet
```

- [ ] Document configured/unconfigured behavior, metadata format, local preparation command, ownership/offline limits and migration boundary. Record any skipped private-content or live-service checks accurately.
- [ ] Inspect simulator UI with controlled content: purchase unavailable, denied access, progress/cancel, verified study, revoke while studying and removal. Do not replace or delete the owner's installation.
- [ ] Review full diff for credentials, private payloads, broad path deletion, entitlement bypass, direct-route bypass and concurrency races. Independently review the whole change according to the selected execution method.
- [ ] Verify `git diff --check`, exact changed paths and ignored private artifacts. Do not commit/push unless requested.
- [ ] Hand off remaining #61 gates: sandbox purchase, real Apple-hosted TestFlight download, airplane-mode study and restore on disposable physical installation.

## Self-review and execution selection

Spec coverage: package preparation (Tasks 1–2), native authorization/offline semantics (3–4),
catalog/direct routes (5–6), preservation/failure tests (4–6), evidence/privacy (7).
Review Focus scenarios are assigned to their owning tests. No actual Apple product, asset,
account or device identifiers are invented. Preparation source mapping is intentionally
checked against owner-supplied input before conversion, not inferred from filename guesses.

Recommended execution: **Native** in this session, task-by-task red/green checks and a final
independent review. The native authorization interfaces and UI lifecycle guards are tightly
coupled; one implementer avoids parallel interface drift. Subagent-driven execution is an
alternative with per-task implementation/review gates and higher context cost.

Status: implemented inline and independently reviewed. Two important review
findings have regression fixes; final local verification and acceptance limits
are recorded in docs/paid-duo-package.md. Original step checkboxes are retained
as the planning artifact; the execution ledger holds per-task evidence.
No commit, push, Apple upload or physical paid acceptance is included.
