# Library sections and local learning-material management

Status: implemented and verified locally; real Apple cache-service acceptance remains unverified. No publication performed.

## Owner UI amendment — 2026-09-13

This amendment supersedes the original two-control and verbose-disclosure UI below.
The library shows only 구매한 도서 and 상점 section headings, without a language-specific
book heading. Each available book has one primary action: verified installed
material shows yellow 학습하기; missing material shows Macaw (#1cb0f6) 다운로드.
Busy, read-error and unmapped paid-package restrictions remain unchanged, as do
download progress/cancellation and editing. Edit hides material size and shows a
Cardinal (#ff4b4b) removal action without routine detailed explanations. Internal
size checks remain available for safe removal eligibility. Confirmation
remains explicit and briefly states that learning records are preserved. Actual
size scope, native containment and record-preservation contracts below still apply.

## Approved direction

- Keep the existing library banner and language selection.
- Split the library into two large sections: 구매한 도서 and 상점.
- Owned books show separate Study and Download icon controls.
- Store entries show the localized App Store price above a 구매하기 button.
- An Edit control above the list exposes per-book material size and local deletion.
- Deletion preserves purchase ownership, checkpoints, completion history, XP,
  preferences, library selection and cloud progress. It is not a progress reset.

## Approach

Use two sections in the existing scroll view and reuse the current StoreKit,
download and learning-context boundaries. Separate tabs would add navigation
without changing the requested responsibilities. Rebuilding purchases and delivery
as one new service would unnecessarily expand this UI/storage task.

The store remains backed by the existing single configured StoreKit product.
This change does not associate that product with the controlled sample packs or
implement the deferred paid-package delivery pipeline.

## Ownership and card behavior

- Verified StoreKit ownership decides whether the paid product appears in the
  owned section or the store. A failed refresh must not fabricate ownership or
  turn uncertainty into permission to purchase.
- The two controlled samples remain available, clearly marked 샘플 within the
  owned/available section; their existing availability flags are not receipts.
- Study is enabled only after installation verification. Download is a separate
  control; a verified installation displays the downloaded state rather than
  silently redownloading on a tap. A missing/damaged installation offers retry.
- Busy downloads retain progress and cancellation; editing/deletion cannot race
  installation or verification.
- A purchased product without an approved package mapping remains visible with
  학습 자료 준비 중 and disabled Study/Download controls. Do not substitute a sample.
- Price comes exclusively from the localized StoreKit product response. When
  unavailable, show 가격 확인 불가, disable purchase and offer the existing retry.
- Pending, cancelled, failed and unverified purchase states retain their current
  recovery behavior. Purchase is always an explicit user action.

## Edit and deletion

- The library list header switches between 편집 and 완료. Edit mode shows the
  measured size of the locally installed material and a per-book deletion action.
- Confirm deletion with the book title and the statement that learning records
  remain. No files are deleted merely by entering Edit mode.
- Resolve targets from the existing catalog/package descriptor, never from a
  caller-supplied filesystem path. Only the selected immutable package directory
  and its exact staging directory are eligible; reject unexpected paths/symlinks.
- Keep native deletion serialized with download/install operations. Reject a busy
  package and ensure a late download callback cannot recreate a deleted package.
- For Apple-hosted content, remove the installation and ask Background Assets to
  remove the corresponding configured pack cache. Never purge another pack or the
  isolated diagnostic package. Report incomplete cache cleanup as incomplete,
  without restoring a stale ready state or claiming all space was reclaimed.
- For bundled samples, remove only the installable local copy. The source embedded
  in the app cannot be removed through this feature; disclose this distinction.
- Size is measured from local files, not from the remote manifest. Label it as
  local material size, not guaranteed freed disk space. Apple-managed cache sizes,
  filesystem allocation and app-bundled sources are not included in that figure.
- A removed book remains in the owned section. Study becomes unavailable until a
  successful re-download; existing progress remains visible and resumes afterward.
- No database schema, StoreKit transaction or CloudKit record mutation is part of
  deletion. No public release, asset upload or real-money purchase is authorized.

## Implementation boundaries

- Library composition and cards: `src/app/(tabs)/index.tsx`, library/book cards and
  the existing purchase card. Keep route files free of storage implementation.
- Pure library presentation: derive sections and action states from verified
  ownership, installation status and edit state for focused tests.
- Local material operations: extend the current native package adapters with
  measured storage status and removal. The Apple delivery actor owns serialization;
  `PackageInstallation` owns constrained installed-file measurement/removal.
- Keep diagnostic controls and their existing recovery tests isolated from the
  normal library's new edit controls.

## Acceptance checks

1. Owned/not-owned/unknown/pending/error fixtures select the right section and
   actions without fabricated prices, receipts or playable packages.
2. Size comes from real fixture files; missing packages measure zero. Unsupported
   paths and symlink escapes cannot delete unrelated files.
3. Remove one fixture package while another package and a real SQLite learning
   checkpoint exist. Verify only the selected material is removed, then reinstall
   and resume the unchanged checkpoint without new XP/completion events.
4. Busy, repeated-delete, cache-purge-failure and late-callback cases report actual
   outcomes and never publish a stale ready installation.
5. Simulator checks cover both appearances, separate Study/Download controls,
   price placement, edit/confirm/cancel/delete/re-download and preserved progress.
6. Apple-managed cache removal still requires a separately reported TestFlight or
   real-service check; simulator fixtures are not evidence of reclaimed Apple cache.
