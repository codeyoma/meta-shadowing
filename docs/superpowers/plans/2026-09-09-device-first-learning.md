# Device-first Learning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver mandatory offline lesson packages, device-owned learning records,
manual cloud snapshots, and immediate local navigation/settings.

**Architecture:** Introduce a new versioned IndexedDB namespace for account state,
package metadata, and verified immutable assets. Keep content bytes separate from
account access grants. Replace the learner's lease-based runtime only after local
storage, package gating, and explicit snapshot transfer are independently tested.

**Tech Stack:** Existing Next.js/React/TypeScript, IndexedDB, browser service worker,
existing shadcn Drawer, Supabase authenticated snapshot storage, Vitest/Playwright.

**Spec:** `docs/superpowers/specs/2026-09-09-device-first-learning.md`

## Global constraints

- No online-only learning path; full package required for all eight levels.
- No automatic cloud synchronization or playback-gating HTTP requests.
- Keep real credentials, infrastructure identifiers, and local paths out of artifacts.
- Use the disposable local Supabase stack for integration tests; no hosted resets.
- Preserve unrelated dirty files. Do not commit, push, merge, or deploy in this plan.
- No migrations from existing test progress; no destructive deletion of old records.
- Read installed Next.js documentation before modifying framework integration.
- Database/schema work must follow the Supabase skill and project privacy rules.
- Authorization rejection is distinct from network unavailability.
- Package retention is user-managed, not a guarantee against browser storage loss.

## Existing boundaries to replace

- `src/app/player/use-cloud-recording.tsx`: checkpoint then renew before resolving.
- `src/app/player/use-audio-session.ts`: cycle transitions wait on recording Promise.
- `src/app/player/use-rapid-session.ts`: navigation waits on recording Promise.
- `src/lib/cached-audio-preloader.ts`: cache hits still require online authorization.
- `src/lib/mp3-cache.ts`: account-coupled MP3 cache, expiry, deletion on account change.
- `src/app/cloud-preferences-provider.tsx`: route/focus refresh gates controls.
- `src/app/player/cloud-learning-player.tsx`: server journal/acquisition entry gate.
- `src/app/(learner)/layout.tsx`: server catalog dependency; offline shell must not
  depend on a successful server component response after a cold reload.

## Task 1: Durable account-local state

**Files:** Create `src/lib/device-learning-store.ts`,
`src/lib/device-learning-store.test.ts`, `e2e/device-storage.spec.ts`.

**Interface:** `openDeviceLearningStore(): Promise<DeviceLearningStore>`;
`read(accountId): Promise<DeviceSnapshot | null>`;
`write(accountId, snapshot): Promise<void>`;
`replace(accountId, snapshot): Promise<void>`;
`restoreBackup(accountId): Promise<void>`. Transactions resolve only on completion.
`DeviceSnapshot` has `schemaVersion: 1`, `accountId`, `settings`,
`progressByLesson`, `history`, and `studyDays`; reuse existing record/settings types.
Cycle confirmation state must be persisted with its run/phrase identity, not inferred
from history or a server receipt.

- [ ] Write browser tests: write A, reload, read A unchanged; B reads no A state;
  replace A and restore backup; abort a write and verify old data remains unchanged.
- [ ] Run `npx playwright test e2e/device-storage.spec.ts --project=desktop` and
  observe failure at the missing store behavior.
- [ ] Implement IndexedDB account records and backups in a single transaction.
  Reject account mismatch and unsupported schema before opening a write transaction.
- [ ] Re-run tests; additionally test blocked upgrade, quota rejection, and malformed
  imported snapshots. No silent `undefined` success on failed persistence.

## Task 2: Versioned lesson packages

**Files:** Create `src/lib/lesson-package.ts`, `src/lib/lesson-package-store.ts`,
`src/lib/lesson-package-downloader.ts`, their tests, and
`src/app/api/lessons/[id]/package/route.ts` with route tests.
Consume existing published lesson, audio, dictionary, and persisted syntax readers.

**Interfaces:** `PackageManifest` contains schema version, stable lesson ID,
published version, lesson text, dictionary/syntax payloads, and audio descriptors
with stable asset ID, MIME type, byte size, and SHA-256. Signed acquisition URLs are
transient responses and excluded from persistent manifests/snapshots.
`downloadPackage(manifest, signal, onProgress): Promise<void>` stages assets;
`readReadyPackage(lessonId, version): Promise<ReadyPackage | null>` returns only a
fully verified committed package. `deletePackage` touches no learning records.

- [ ] Write tests: deny unpublished/wrong-account acquisition; pin one immutable
  version throughout download; reject bad size/hash; resume interrupted assets;
  reject incomplete package playback; delete package while preserving history.
- [ ] Run focused Vitest tests and confirm failures before implementation.
- [ ] Implement authenticated manifest preparation without live syntax generation.
  Represent genuinely absent dictionary/syntax results explicitly rather than
  silently omitting failed requests. Preserve supported uploaded audio MIME types.
- [ ] Download with bounded concurrency, abort support, verified asset staging,
  and atomic ready-manifest commit. Keep the previous version until replacement
  commit succeeds. Keep account grants separate from reusable content identifiers.
- [ ] Verify in real browser IndexedDB with offline reload and missing-blob tests.
  Remove old TTL/streaming fallback from this new package path only.

## Task 3: Explicit cloud snapshots

**Files:** Create `src/lib/device-snapshot.ts`, `src/lib/device-snapshot.test.ts`,
`src/app/api/learner/snapshot/route.ts`, route tests, a CLI-generated migration,
and `e2e/device-snapshot.integration.spec.ts`.

**Interface:** Authenticated `GET /api/learner/snapshot` returns a validated snapshot
or explicit empty result; `PUT` replaces the authenticated account's snapshot.
Authenticate identity server-side; body account ID must match. No merge/revision
conflict workflow. Client transfer captures account identity and cancels on logout.

- [ ] Write local integration tests: A cannot read/write B; malformed/oversized
  snapshots rejected; newer explicit upload replaces prior state; empty GET cannot
  erase device state; credentials/package blobs cannot enter the payload.
- [ ] Observe failures, then create a dedicated RLS-protected snapshot table and
  transactional per-account replacement endpoint. Do not repurpose live lease rows.
- [ ] Implement explicit upload and confirmed download using Task 1 `replace`.
  Bound retries to the active explicitly requested transfer; stop retries at logout.
- [ ] Verify a failed replacement retains both original local state and recovery
  data. Test account change while GET/PUT is in flight.

## Task 4: Offline player cutover

**Files:** Create `src/app/player/device-learning-player.tsx`,
`src/app/player/use-device-recording.tsx`, `src/lib/package-audio-preloader.ts`,
`e2e/device-learning.spec.ts`; modify `recording-types.ts`, player entry,
`use-audio-session.ts`, `use-rapid-session.ts`, dictionary and analysis consumers.

**Interface:** A local recording adapter consumes Task 1 state and Task 2 ready
package. Rename the recording contract so it does not imply cloud authority.
`canAct` depends on account access, package readiness, and local write health;
resume verification is local, never an HTTP lease renewal.

- [ ] Write browser tests for all eight levels: disconnect network, complete cycles,
  navigate phrases, reload and recover; assert zero learner checkpoint/renew calls
  and zero remote audio reads after package installation.
- [ ] Observe failures, then replace entry acquisition with local account/package
  gates. Keep existing playback state machines and manual confirmation semantics.
- [ ] Commit cycle/phrase state locally without a network dependency; handle failed
  local writes by pausing before advancing to another phrase. Do not accept memory
  state as durable. Deduplicate completed runs by local stable run ID.
- [ ] Preload current/next package audio as object URLs and release URLs on change.
  Read dictionary/syntax solely from the pinned package during practice.
- [ ] Test two offline devices independently, local storage failure, logout, and
  explicit rejection on reconnect. An update marks pending interruption and stops
  at the phrase boundary; do not replace running lesson data mid-phrase.

## Task 5: Offline shell, navigation, and settings drawer

**Files:** Create `src/app/device-learning-provider.tsx`,
`src/app/device-settings-drawer.tsx`, `src/lib/device-catalog.ts`, offline service
worker integration and tests; modify learner layout, browse shell, bottom
navigation, settings pages, and logout integration.

**Interfaces:** Provider exposes active local account, local settings, package
inventory, cached catalog, explicit transfer actions, and drawer open/close state.
Catalog refresh updates published metadata without hiding usable local content.

- [ ] Write E2Es: cold offline reload of an installed lesson; cached language/lesson/
  stage navigation with blocked network; drawer opens without changing underlying
  route/scroll; settings persist immediately; keyboard focus returns on close.
- [ ] Observe failures, then provide a versioned app shell that boots local state
  without requiring fresh server auth/RSC. Never cache authenticated HTML or API
  credentials in a shared service-worker cache. Cache only explicit static shell
  resources; account data remains in the isolated local store.
- [ ] Add shadcn full-height drawer sections for account, learning settings,
  downloads, upload/download, and backup restoration. Offline logout saves then
  clears the active account; retain its records and shared bytes, not active grants.
- [ ] Test online logout upload failure/retry/logout-anyway, offline logout, and
  subsequent B login. B must not see A data or inherit A upload jobs.
- [ ] Test fresh empty namespace without importing old cloud progress. Missing
  packages always require explicit completed download, including after restoration.

## Task 6: Regression and release preparation

**Files:** Update relevant `e2e/` fixtures/specs, browser runner selection,
`docs/audio-cache.md`, `docs/cloud-preferences.md`, and release documentation.

- [ ] Replace obsolete live-lease UI expectations with device-first behavior;
  retain server API authorization tests while old endpoints remain deployed.
- [ ] Run `npm test`, `npm run check:ui`, `npm run typecheck`, and isolated
  production build. Run new browser tests on mobile/desktop and local DB tests.
- [ ] Measure warm route transition, next-cycle audio onset, and drawer opening
  under offline and high-latency conditions; verify network latency does not gate
  these actions. Record measurements rather than assuming speed from fewer calls.
- [ ] Verify real-device package retention, cold offline launch, interruption and
  update recovery. Do not claim permanent storage or mobile acceptance from desktop
  emulation alone.
- [ ] Review the exact diff for account isolation, partial writes, package corruption,
  update races, and snapshot privacy. Report remaining limitations before publishing.

## Self-review

Every confirmed requirement maps to Tasks 1–6. Dependencies are 1 -> 3/4/5,
2 -> 4/5, and 1–5 -> 6. Schema changes are additive and local-only until separately
approved. No production data deletion or migration of test progress is required.
