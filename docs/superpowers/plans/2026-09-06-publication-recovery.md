# Audio Publication Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this single, tightly coupled recovery task inline. Steps use checkbox syntax for tracking.

**Goal:** Publish large, already-uploaded audio packages without serial-download timeouts or repeated uploads.

**Architecture:** Read only audio signatures with bounded concurrency and cancellation, retaining server-side authorization and atomic publication. Share a safe publication-response reader between the importer and lesson manager. Expose publication-only recovery from saved drafts so refreshes and newer Preview deployments do not require file reselection.

**Tech Stack:** Existing Next.js 16, React 19, Supabase JS, Vitest and Playwright; no new dependencies.

**Spec:** Owner-approved fix following a confirmed publication timeout: preserve existing drafts/audio, accelerate validation, retry publication without upload, and report actionable errors.

## Global Constraints

- Preserve all hosted study content and existing access policies. No schema changes, storage deletion, or file replacement during recovery.
- Keep work on the existing feature PR into `dev`; no `main` merge or Production deployment.
- No new projects, paid services, or exposed credentials/private content in GitHub.
- All automated destructive fixtures use local Supabase only.
- Retain server validation of every file; never substitute browser validation for authorization/content checks.

### Task 1: End-to-end publication recovery

**Files:**
- Create `src/lib/audio-content-validation.ts` and its unit tests: bounded signature verification.
- Modify `src/lib/lesson-publication.ts`: authenticated ranged reads and controlled failures.
- Create `src/lib/request-lesson-publication.ts` and its unit tests: JSON/text/network response handling.
- Modify `src/app/admin/portal.tsx`: upload-complete state and publication-only retry.
- Modify `src/app/admin/lessons/lesson-manager.tsx`: recover a saved draft without local files.
- Modify `src/lib/lesson-management.ts`: list all pending drafts separately from the active lesson version.
- Extend `e2e/lesson-publication.integration.spec.ts`: real Storage recovery, errors, and large package verification.

**Interfaces:**
- `validateAudioContent(items: AudioPackageItem[], readSignature: (item: AudioPackageItem, signal: AbortSignal) => Promise<Uint8Array>): Promise<AudioPackageIssue[]>`.
- `requestLessonPublication(draftId: string): Promise<void>` posts to the existing publication endpoint and validates the returned lesson ID.
- Existing authenticated POST `/api/admin/drafts/[id]/publish` and atomic SQL RPC remain the only publication path.

- [x] Add RED tests for concurrent completion of a 560-file package, stable corrupt-file errors, and cancellation on timeout/failure. The test dependency models delayed external reads; assertions target completion time, returned issues, and bounded active reads.

```ts
const completed = validateAudioContent(items, async (item) => {
  await new Promise(resolve => setTimeout(resolve, 1000));
  return new Uint8Array([0x49, 0x44, 0x33]);
});
await vi.advanceTimersByTimeAsync(75000);
await expect(completed).resolves.toEqual([]);
```

- [x] Implement eight concurrent signature readers, a 120-second total budget, and cancellation on read failure. Reject rather than publish when validation is incomplete. Use authenticated Storage `download(path, {}, { headers: { Range: "bytes=0-11" }, cache: "no-store", signal })`; retain format/size/number mapping and atomic publication.
- [x] Add RED tests for a text HTTP 504 response, malformed/empty successful responses, JSON validation errors, and network failure. No raw HTML or platform response is rendered.

```ts
vi.stubGlobal("fetch", async () => new Response("An error occurred", { status: 504 }));
await expect(requestLessonPublication("draft-id")).rejects.toThrow(/시간.*초과/);
```

- [x] Implement publication response handling with HTTP-aware Korean errors and a required nonempty string lesson ID. Use it in both admin surfaces.
- [x] Add a failing real-local integration test: create/upload a fixture, open lesson management, click `업로드된 음성으로 게시`, verify publication without Storage writes. Inject one text 504 at the browser boundary, verify actionable error, then retry against the real endpoint. Preserve object IDs/update timestamps.
- [x] In the importer, remember successful upload and cleanup completion separately from publication. After a publication failure, offer `게시만 다시 시도`; reset this state when input files/source/title/language change. Disable editable inputs while publication/upload is in flight. Do not skip changed files by comparing size or filename alone.
- [x] In lesson management, allow publication-only action for an existing draft, with explanatory text and disabled concurrent controls. If several replacement drafts exist, let the administrator explicitly select one, newest first. Keep active version state and deletion confirmation separate. Refresh the catalog after success. Do not re-publish archived, unpublished, or deleting lessons implicitly.
- [x] Run unit tests, typecheck, browser regression suite, database assertions and production-mode local Supabase integration. Include real Range-read behavior and large-package coverage. Read the final diff and request an independent code review.
- [ ] Commit/push to the existing feature PR, deploy a protected Preview from the exact reviewed source, and verify recovery of the owner's existing draft through authenticated UI if credentials remain available. Never bypass the publication validation/RPC. If fresh login is required, hand off only that action.

## Execution record

- Baseline: 129 unit tests passing; existing feature PR remains open against `dev`.
- Ruling: this fixes the active import PR, so continue that feature branch rather than create an unrelated branch from `dev` that lacks the combined importer.
- Ruling: implement inline because server validation and both retry surfaces form one end-to-end contract; use an independent reviewer after verification.
- Review corrections: normalize Storage cancellation after response headers into a retryable error; expose all pending replacements so a newer unsupplied draft cannot hide a previously uploaded one. Both cases were reproduced with failing tests before the fixes, then re-reviewed without remaining actionable findings.
- Verified on Node 24: 143 unit tests, typecheck, 41 database assertions, and 11 production-mode local Supabase integration tests. The 560-file recovery retained object IDs, modification times and sizes, emitted no browser Storage writes, and verified authenticated 12-byte Range reads. Importer retry also emitted no additional uploads.
- Browser regression: 129 passed and 25 expected skips with one worker. An initial two-worker run had two existing playback timing failures; the complete unchanged suite passed on sequential rerun. No player behavior or playback test was changed for this fix.
- Local verification only at this checkpoint. The final release step remains open until the reviewed commit is pushed and its protected Preview is verified; hosted recovery may require the owner to sign in again.
