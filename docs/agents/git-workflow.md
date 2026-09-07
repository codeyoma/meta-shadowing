# Git and release workflow

## Branches

- `main` is the default and release branch. It starts at planning-only commit `786de68`; the MVP enters it only through an approved release PR.
- `dev` is the integration branch, initialized at tested MVP commit `b29a8fe`.
- Start each change from the latest `origin/dev` on a new `codex/<topic>` branch. Explicitly target `dev` when opening its PR; GitHub's default target is `main`.
- Keep only `main` and `dev` as long-lived branches. Delete merged feature branches after confirming their commits are included in `dev`; historical MVP commits remain in its history. Never rewrite existing branch history to adopt this workflow.

Feature flow: `dev -> codex/<topic> -> PR into dev`. Release flow: `dev -> PR into main -> human approval -> merge -> Vercel Production`.

## Pull requests and checks

Both long-lived branches require a PR, resolved conversations, and all four CI checks: `ci-branch-policy`, `ci-quality`, `ci-browser`, and `ci-database`. Checks must come from GitHub Actions and test the latest base. Rulesets have no bypass actors and block force-pushes and deletion.

The reviewed settings live in `.github/rulesets/` and `.github/environments/`. These files document GitHub API payloads; committing them does not apply them. Apply changes explicitly with `gh api` and read the live settings back before claiming the protection is active.

The route check accepts internal `codex/* -> dev`, internal `dev -> main`, and `main -> dev` for synchronizing an approved release back into development. A fork branch named `dev` is not a release source. Use a merge commit for release PRs so the long-lived branches retain shared ancestry.

CI uses Node 24 and standard Linux runners, with read-only repository tokens. Database assertions and production integration run against a disposable **local** Supabase stack, never a hosted project. Workflow changes go through the same feature PR process.

## Human release approval

Open a release PR only after the user requests the release. After all automated checks pass, GitHub pauses the `release-approval` job for `codeyoma` to approve in Actions. This environment is an approval record, not an application deployment, and contains no secrets. Self-review is allowed because this is a solo-maintainer repository; GitHub PR authors cannot approve their own PR reviews.

The `main` ruleset also requires a successful `release-approval` environment deployment, so a skipped or removed approval job does not satisfy the release gate. Agents leave this approval to the user and merge into `main` only with explicit release authorization. Approval of a workflow-setup PR into `dev` is not release authorization.

## Vercel and Supabase

Vercel's Production Branch must be explicitly set to `main`. Other permitted branches are Preview-only. Verify the project setting before enabling Git integration; a branch name or a GitHub approval job alone does not control Vercel's deployment target. A new Vercel project or paid change still requires approval. The planning-only `main` is not a deployable application; do not trigger an initial Production import during workflow setup.

Use the existing Supabase project explicitly approved by the owner. Confirm its identity privately through the authenticated dashboard before changing it; a placeholder in this public repository is not a target selection. Inspect its Auth, Storage, migrations, and access policies before changing it. An empty `public` table list is not proof that the entire project is unused. Preserve unrelated resources and scope hosted verification to explicitly disposable lesson data; use local Supabase for automated destructive tests.

Follow [the release checklist](../release.md) for credentials, Preview verification and device checks. Close an issue only when its own acceptance criteria pass; keep #11 open while hosted/PWA device acceptance is incomplete.

## Public repository privacy

This repository, its branches, commit diffs, issue/PR content and CI output are public. Before publishing, inspect the exact payload and use placeholders such as `<SUPABASE_PROJECT_REF>`, `<VERCEL_PROJECT_ID>` and `<VERCEL_TEAM_ID>` for real infrastructure identifiers. Keep actual project/account names, team slugs, dashboard links, unapproved deployment URLs, administrator email/UUID, local user paths and credentials in private setup records or the provider's authenticated settings. Include only the safe verification result in public reports; redact screenshots and logs before uploading them.

Keep local configuration in ignored `.env.local`, `.vercel/` and Supabase CLI state. Publish variable names and fictional examples, not resolved values. Before committing, confirm that the effective author and committer addresses use the owner's verified GitHub no-reply address; keep any identity override scoped to this repository or commit, not global Git configuration.

Supabase's browser-facing URL and publishable key are intentionally visible in a deployed client; this documentation policy does not make them secret or replace RLS. Secret/service-role keys, passwords and signing secrets stay server-only. Preserve the application's environment-variable wiring rather than replacing live runtime settings with placeholders. See [Supabase API key types](https://supabase.com/docs/guides/getting-started/api-keys).

After a redaction, re-scan tracked content and re-read any edited issue/PR text and its edit history. A new commit does not remove older Git versions, other branch tips, PR diffs or existing copies. Report those limits; obtain separate approval before deleting history, rewriting commits, force-pushing or changing repository visibility. Revoke or rotate a genuinely exposed credential through the provider's approved process; do not claim that replacing its text invalidates it.

References: [GitHub rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets), [environment approvals](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments), [Vercel branch tracking](https://vercel.com/docs/git#production-branch).
