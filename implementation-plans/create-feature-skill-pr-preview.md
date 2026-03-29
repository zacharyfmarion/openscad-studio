# Create Feature Skill And PR Preview Flow

## Goal

Add a repo-local `/create` Codex skill that can take a feature request from plan to draft PR, plus a reusable validation script and a stable per-PR Cloudflare Pages preview workflow.

## Approach

1. Create a `create-feature` skill with explicit instructions for planning, implementation, testing, validation, PR creation, and preview handoff.
2. Add a generic `scripts/validate-changes.sh` helper that runs deterministic validation commands from explicit scopes or inferred file paths.
3. Add a PR preview GitHub Actions workflow that deploys web-relevant PRs to a stable `pr-<number>.openscad-studio.pages.dev` alias and posts a sticky PR comment.
4. Update repo docs and the PR template so agents and humans share the same expectations.

## Affected Areas

- `.agents/skills/create-feature/`
- `scripts/validate-changes.sh`
- `scripts/__tests__/validate-changes.test.mjs`
- `package.json`
- `.github/workflows/deploy-pr-preview.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `AGENTS.md`
- `CLAUDE.md`

## Checklist

- [x] Review existing skill, validation, and deployment conventions
- [x] Add this implementation plan record
- [x] Create the `create-feature` skill and metadata
- [x] Add `scripts/validate-changes.sh` and script-level tests
- [x] Add the PR preview deployment workflow and sticky PR comment flow
- [x] Update docs and PR template for the new workflow
- [x] Run targeted local validation and note any follow-up gaps
