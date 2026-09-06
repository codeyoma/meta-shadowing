# Administrator and Supabase setup

Issues #3 and #4 add the administrator import, private sentence-audio upload, publication, catalog, and first-playback slices. Use the existing Supabase project explicitly approved by the owner and confirm its identity privately through the authenticated dashboard. Inspect its existing Auth, Storage, migrations, and policies before applying this setup; preserve unrelated resources. Target selection does not mean migrations or credentials have been configured.

## 1. Apply the schema

Use the CLI version verified for this migration. Replace `<SUPABASE_PROJECT_REF>` locally with the privately confirmed project ref; keep the substituted command out of this public repository and its issue/PR comments.

```bash
npx supabase@2.116.0 link --project-ref "<SUPABASE_PROJECT_REF>"
npx supabase@2.116.0 db push
```

The migrations create `public.lesson_drafts`, publication completeness constraints, and the private `lesson-audio` Storage bucket. Database drafts and Storage objects are protected by RLS. An authenticated owner whose signed `app_metadata.role` is `admin` can list their objects and upload, replace, or remove files in their own **mutable draft** folders. Published-version text and audio cannot be changed in place. Permanent deletion goes through the server's authenticated lifecycle API, not direct table deletion.

Issue #9 also requires migration `20260906072641_session_defaults.sql`. It creates the single RLS-protected `session_defaults` row used by `/admin/settings`. Administrator defaults apply to every lesson; a learner's explicit browser-local overrides take precedence. Apply all migrations before running a configured Supabase deployment. The settings page does not change an already running learner session.

Issue #10 requires `20260906080425_lesson_lifecycle.sql`. It backfills a stable `lesson_id` for existing drafts without changing their existing publication-version timestamps. A lesson's first row anchors that ID; later version rows refer to it. The publication validator now lives in the non-exposed `private` schema; the public lifecycle functions are executable only by `service_role`, with the application checking administrator identity and the functions checking ownership. Apply this migration before deploying the #10 application changes.

Issue #11 requires `20260906090138_release_explicit_grants.sql`. It removes inherited authenticated `TRUNCATE`, `REFERENCES`, and `TRIGGER` privileges on drafts while retaining the explicit Data API grants and RLS. Run the [release checklist](release.md), including the production-mode local integration suite, before hosted deployment.

## 2. Configure the one administrator

1. Inspect current Auth users, providers and sign-up settings. Disable public email sign-ups only after confirming that this project-wide change will not break another application; otherwise resolve that conflict with the user before deployment.
2. Create or invite the administrator from the trusted Supabase dashboard.
3. Set the administrator's **app metadata** to `{ "role": "admin" }`. Do not put authorization data in user metadata because users can modify that field themselves.
4. Add `https://<your-vercel-domain>/auth/confirm` to the Auth redirect allow list.
5. Choose one email experience:
   - Leave the default Magic Link template in place; `/auth/confirm` accepts the PKCE `code` callback.
   - For a typed OTP, include `{{ .Token }}` in the email template. The administrator page accepts the resulting 6–8 digit code. New free projects using default SMTP may not permit template customization; keep the default Magic Link flow or configure supported SMTP first. See the [email-template change](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier).

The application calls `signInWithOtp` with `shouldCreateUser: false`, so entering an unknown address never creates an account.

## 3. Configure Vercel

Follow [the branch workflow](agents/git-workflow.md): Vercel Production tracks `main`; development branches must remain Preview-only. Set these environment values independently for Preview and Production:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

The publishable key is intentionally usable by the browser-facing application and remains constrained by RLS. `SUPABASE_SECRET_KEY` is server-only: it reads the published catalog and signs a private audio URL for 60 seconds after the application validates the learner's shared-password cookie. Never add a Supabase secret or service-role key to a `NEXT_PUBLIC_` variable, return it from a route, or import the secret client into a Client Component.

The bucket remains private. Learners receive only a short-lived signed redirect from `/api/lessons/:id/audio/:phraseNumber`; no permanent public object URL is stored or rendered.

## Lesson management

Open `/admin/lessons` (also linked from the import screen).

- **New version:** choose `새 버전 가져오기`, supply corrected source text and a complete numbered audio package, validate, save, then publish. English/Japanese lessons retain their language. The old version stays live until the replacement publishes atomically. Version audio stays in separate folders; historical versions remain stored until permanent deletion. There is no inline transcript editor or version rollback UI.
- **Unpublish:** choose `게시 해제`. The lesson leaves the learner catalog and stops issuing new audio URLs. Text, drafts, all versions, and audio stay stored. An already issued signed audio URL may remain valid for up to 60 seconds. Already delivered current/next audio can remain in the open player's temporary memory until it is replaced or the player is left/reloaded; unpublishing cannot recall downloaded bytes.
- **Permanent deletion:** choose `영구 삭제`, enter the displayed lesson title, and confirm. The server checks that the lesson/version still matches the confirmation, hides it, removes every version's Storage folder through the Storage API, and finally deletes the lesson rows. This cannot be undone.
- **Interrupted deletion:** the hidden lesson remains in the management list as `삭제 정리 필요`. Some files may already be gone. Reload the list, choose `삭제 정리 다시 시도`, and confirm the title again. Do not restore publication or manually delete rows; retry continues cleanup without losing the folder identities. If the API response was lost, reload before retrying.

At home or on a saved player URL, a changed version clears unfinished local progress and displays a reset notice. Practice starts at the first phrase with a fresh run ID. Completion history and session preferences are preserved. Audio requests include the loaded version to avoid playing new-version audio against an old transcript; reload a stale player to use the new version.

## 4. Verify before release

Run the local policy test and application suite:

```bash
npx supabase@2.116.0 start
npx supabase@2.116.0 test db --local
npm test
npm run test:integration
npm run test:browser
npm run build
```

`test:integration` creates temporary local administrator and non-admin users, signs in through the real OTP route, exercises Storage RLS, verifies incomplete publication is rejected, uploads a complete package through the administrator UI, confirms the published-only catalog, follows a learner-authorized signed playback URL, and cleans up its objects and users.

It also verifies administrator default updates, malformed/cross-origin request rejection, learner inheritance, and browser-override precedence. It restores the previous global defaults after the test. Tests run serially; pass Playwright filters when needed, for example `npm run test:integration -- --grep 'admin defaults'`.

The lifecycle integration tests cover replacement, both resume entry points, preserved history, desktop/mobile administrator controls, ownership, cross-origin rejection, and full cleanup. The partial-deletion test installs a temporary, path-scoped trigger in the **local test database** to make the real Storage API fail for one fixture file, then removes the trigger and verifies retry. Never run these tests against production. Screenshots are written to the OS temporary directory, not the repository.

Official references: [passwordless email auth](https://supabase.com/docs/guides/auth/auth-email-passwordless), [server-side Supabase clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), and [serving private assets](https://supabase.com/docs/guides/storage/serving/downloads).
