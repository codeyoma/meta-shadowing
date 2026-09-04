# Administrator and Supabase setup

Issues #3 and #4 add the administrator import, private sentence-audio upload, publication, catalog, and first-playback slices. This repository is not attached to an existing remote Supabase project. Create a dedicated project for Meta Shadowing before deployment; do not reuse an unrelated database.

## 1. Apply the schema

Use the CLI version verified for this migration:

```bash
npx supabase@2.116.0 link --project-ref <meta-shadowing-project-ref>
npx supabase@2.116.0 db push
```

The migrations create `public.lesson_drafts`, publication completeness constraints, and the private `lesson-audio` Storage bucket. Database drafts and Storage objects are protected by RLS. Only an authenticated owner whose signed `app_metadata.role` is `admin` can upload, replace, list, or delete objects under their own user-ID folder.

## 2. Configure the one administrator

1. Disable public email sign-ups in Supabase Auth.
2. Create or invite the administrator from the trusted Supabase dashboard.
3. Set the administrator's **app metadata** to `{ "role": "admin" }`. Do not put authorization data in user metadata because users can modify that field themselves.
4. Add `https://<your-vercel-domain>/auth/confirm` to the Auth redirect allow list.
5. Choose one email experience:
   - Leave the default Magic Link template in place; `/auth/confirm` accepts the PKCE `code` callback.
   - For a typed OTP, include `{{ .Token }}` in the email template. The administrator page accepts the resulting 6–8 digit code.

The application calls `signInWithOtp` with `shouldCreateUser: false`, so entering an unknown address never creates an account.

## 3. Configure Vercel

Set these environment values for Preview and Production:

```text
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
```

The publishable key is intentionally usable by the browser-facing application and remains constrained by RLS. `SUPABASE_SECRET_KEY` is server-only: it reads the published catalog and signs a private audio URL for 60 seconds after the application validates the learner's shared-password cookie. Never add a Supabase secret or service-role key to a `NEXT_PUBLIC_` variable, return it from a route, or import the secret client into a Client Component.

The bucket remains private. Learners receive only a short-lived signed redirect from `/api/lessons/:id/audio/:phraseNumber`; no permanent public object URL is stored or rendered.

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

Official references: [passwordless email auth](https://supabase.com/docs/guides/auth/auth-email-passwordless), [server-side Supabase clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), and [serving private assets](https://supabase.com/docs/guides/storage/serving/downloads).
