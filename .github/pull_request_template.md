## Change

Describe the behavior changed and link the issue. Feature PRs target `dev`; release PRs target `main` from `dev` only.

## Verification

- [ ] Required CI checks pass for the latest commit.
- [ ] Relevant acceptance criteria were checked; remaining gaps are listed.
- [ ] Hosted credentials and private lesson files are absent from the diff and logs.

## Release only

- [ ] The user requested this `dev -> main` release PR.
- [ ] Preview and applicable physical-device checks passed.
- [ ] The user approved the `release-approval` gate for this candidate.

Issue closure is based on verified acceptance criteria, not just a successful build.
