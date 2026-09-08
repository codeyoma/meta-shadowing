# Learner sign-in

Learner access now has two independent checks:

1. `/` accepts the beta password and stores the existing signed, 30-day invitation cookie.
2. `/login` offers only **Google로 로그인하기**. A same-origin `POST /auth/google` starts Supabase Google OAuth with PKCE. `/auth/callback` exchanges the authorization code and redirects to `/languages`.

An invitation cookie alone does not authorize learner pages or the dictionary, syntax, and audio APIs. Missing beta access redirects pages to `/`; beta access without a verified Google identity redirects to `/login`. APIs return `401`. The server verifies Supabase claims and checks server-controlled `app_metadata`, never user-editable metadata. A trusted, linked Google identity is accepted. Proxy refresh covers the learner and authentication routes; access decisions remain in the server guard and API handlers.

Callback success, cancellation, and failures use fixed, relative destinations and private/no-store responses. They preserve the browser's current hostname. Do not change between `localhost`, `127.0.0.1`, or another hostname during a flow: both the invitation and PKCE verifier are host-scoped cookies.

Administrator email OTP and `/auth/confirm` remain separate and unchanged. No learner email/password form is provided. Learning history and preferences remain browser-local; signing in does **not** upload, synchronize, or migrate them.

## Provider setup

Use the existing approved Supabase project. Inspect its configuration before changing project-wide settings, preserve other applications' required redirects, and follow [the Git/release rules](agents/git-workflow.md).

- Enable Google in Supabase Auth with a Google OAuth web client. Store its client secret only in Supabase's provider settings, never `NEXT_PUBLIC_*` or this repository.
- In Google, authorize the Supabase provider callback: `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback`. This differs from the application's callback below.
- In Supabase Auth URL Configuration, allow the exact app callback for each intended environment, for example `http://localhost:3000/auth/callback`, `http://127.0.0.1:3000/auth/callback`, and `https://<APP_HOST>/auth/callback`. Keep required administrator `/auth/confirm` URLs. Prefer explicit production/preview hosts over broad wildcards.
- First-time Google sign-in creates a Supabase Auth user, so the project's signup policy must permit it. If signups are disabled for existing consumers, obtain approval before changing that shared setting. The beta gate is an application invitation check; it does not disable the public Supabase OAuth endpoint.
- Validate consent, cancellation, a new Google account, an existing Google account, expiry/re-login, and the return to `/languages` on the actual deployment. A successful provider redirect or mocked callback is not proof of real-account consent and session exchange.

Reference: [Supabase Google OAuth](https://supabase.com/docs/guides/auth/social-login/auth-google), [SSR authentication](https://supabase.com/docs/guides/auth/server-side/creating-a-client), [Google button branding](https://developers.google.com/identity/branding-guidelines).

## Automated checks

`npm test` exercises the two-step guard, trusted identity metadata, same-origin start, and callback/error handling. `e2e/google-login.spec.ts` starts signed out and follows a real SDK PKCE exchange against a loopback-only fake external Auth server. It tests the login screen, retry, fixed redirects, and page/API denial. Other development browser tests start with a signed test Google session; there is no learner-auth test bypass in application code.

Use an unused `PLAYWRIGHT_PORT` and its following port (or `PLAYWRIGHT_AUTH_PORT`) for the fake Auth server. Use a separate `NEXT_DIST_DIR` if a user dev server is already running. Production/local-Supabase integration remains distinct from this development mock. Never point test fixtures at the hosted project.
