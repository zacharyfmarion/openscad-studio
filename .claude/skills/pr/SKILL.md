---
name: pr
description: Use when the user wants to open a pull request or finish a branch handoff. Read the PR template, inspect changes vs main, run the release skill first if the branch name looks like a version, validate the branch with the shared repo checks, open a draft PR targeting main, and return the preview deployment URL when one applies.
---

# Open Pull Request

1. Read `.github/PULL_REQUEST_TEMPLATE.md` and understand its required sections.
2. Inspect what has changed on this branch vs `main`. If there are unrelated changes, stop and ask the user what to do.
3. If the branch name looks like a release branch or versioned release workflow, run the release skill first before continuing.
4. Choose the right validation scopes for the changed files and run them through `scripts/validate-changes.sh`.
5. Prefer `bash scripts/validate-changes.sh --scope baseline` for normal TS or workflow changes. Add scopes when needed:
   - `--scope formatter` for formatter behavior changes
   - `--scope rust` for `apps/ui/src-tauri` or other desktop-only changes
   - `--scope e2e-web` for materially changed user-facing web flows
6. If formatting fixes are still needed before validation, run `pnpm format` intentionally first, then rerun the validation helper in check mode. Do not rely on the helper to mutate files unless you explicitly choose `--fix`.
7. Draft a PR title and body that follow the template exactly, filling each section from the actual branch changes, validations run, validations skipped, and tests added.
8. Open or update a draft PR against `main`:
   - Create with `gh pr create --draft --base main` when no PR exists for the branch.
   - Update the existing PR body when one already exists.
9. After the PR exists, wait for the `Deploy PR Preview` workflow when the change is web-relevant.
10. Return:
   - the full PR URL
   - the preview URL when one applies
   - any explicit follow-up if the preview deploy or sticky comment failed

## Preview Expectations

- Web-relevant PRs should publish to `https://pr-<number>.openscad-studio.pages.dev`
- Docs-only and desktop-only PRs may skip preview deployment
- If Cloudflare deploy succeeds but the sticky comment fails, report that separately instead of pretending the preview is unavailable
