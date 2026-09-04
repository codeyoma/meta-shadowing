# Administrator and Supabase setup

Issue #3 adds the administrator text-import slice but does not attach this repository to an existing remote Supabase project. Create a dedicated project for Meta Shadowing before deployment; do not reuse an unrelated database.

## 1. Apply the schema

Use the CLI version verified for this migration:

```bash
npx supabase@2.116.0 link --project-ref <meta-shadowing-project-ref>
npx supabase@2.116.0 db push
```

The migration creates `public.lesson_drafts`, enables RLS, explicitly grants only the authenticated role, and restricts every operation to the authenticated row owner whose signed `app_metadata.role` is `admin`.

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
```

The publishable key is intentionally usable by the browser-facing application and remains constrained by RLS. Never add a Supabase secret or service-role key to a `NEXT_PUBLIC_` variable; this slice does not require either key at runtime.

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

`test:integration` creates a temporary local administrator, signs in through the real OTP route, posts a draft through the production Next.js API, reads the stored row back through RLS, and then removes the temporary user and its cascade-owned draft.

Official references: [passwordless email auth](https://supabase.com/docs/guides/auth/auth-email-passwordless), [server-side Supabase clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client), and [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).
