---
name: create-feature
description: Use when the user asks to take a feature or bug fix from prompt to implementation, especially prompts like "/create a new feature", "build this feature end-to-end", "take this from plan to PR", or "own this change through validation and handoff". This skill is for repo-local delivery workflows that must create and maintain implementation plans, choose appropriate tests, run deterministic validation, open a draft PR against main, and return the preview deployment URL when one is available.
---

# Create Feature

Use this skill when the user wants one agent to carry a repo change through planning, execution, validation, and PR handoff.

## What This Skill Owns

- Create and maintain an implementation plan for non-trivial work.
- Inspect the current checkout and make sure it is ready before editing.
- Implement the requested change directly unless a material product decision blocks progress.
- Add or update tests that match the changed behavior.
- Run local validation through the shared validation script.
- Open a draft PR against `main`.
- Wait for the PR preview workflow and return both the PR URL and preview URL when a web preview applies.

## Required Reads

Before changing code, read these repo guides:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `.github/PULL_REQUEST_TEMPLATE.md`
4. Any relevant existing file under `implementation-plans/`

## Checkout Readiness

Do not create a worktree in this skill.

Instead:

1. Inspect checkout state with non-interactive Git commands.
2. If the repo is in a Git worktree, make sure that worktree is actually ready for development.
3. If the repo is in a normal checkout, continue in place.
4. Treat setup as a readiness check, not a separate provisioning workflow.

Default readiness expectations:

- Ensure dependencies are installed when needed with `pnpm install --frozen-lockfile`.
- Ensure Playwright browsers are installed only when web E2E is needed.
- Ensure Rust/Tauri tooling is present only when the changed scope touches `apps/ui/src-tauri` or other desktop-only behavior.

## Planning Contract

For non-trivial work, derive a concise slug from the task and create `implementation-plans/<slug>.md`.

Use the repo's established plan format:

- `# <Title>`
- `## Goal`
- `## Approach`
- `## Affected Areas`
- `## Checklist`

Keep the checklist current while you work. Mark steps complete as soon as they are actually done.

Do not create an implementation plan for narrow housekeeping work such as typo-only edits, formatting cleanup, or other small maintenance.

## Execution Contract

After planning, implement directly unless blocked by a real product ambiguity.

Always:

- Prefer the smallest change that fully solves the task.
- Read existing patterns before introducing new ones.
- Avoid inventing new repo workflow conventions when an existing one can be extended.
- Keep a running summary of what changed and why for the PR body.

## Test Expectations

Choose tests based on the changed behavior:

- Add or update unit or component tests for changed logic.
- Add or update formatter regression tests when formatter behavior changes.
- Add or update Playwright coverage when the change introduces or materially changes a user-facing flow.
- If no new tests are needed, be ready to justify that in the PR.

## Validation Contract

Use `scripts/validate-changes.sh` for deterministic command execution.

You are responsible for choosing scopes; the script is responsible for running them consistently.

Available scopes:

- `baseline`: `pnpm format`, `pnpm lint`, `pnpm type-check`, `pnpm test:unit`
- `formatter`: `pnpm test:formatter:ci`
- `rust`: Rust formatting and static checks under `apps/ui/src-tauri`
- `e2e-web`: `pnpm test:e2e:web`

Recommended usage:

- Use explicit scopes when you already know what changed.
- Use `--changed-file <path>` inputs when you want the script to infer `formatter` and `rust`.
- Use `--dry-run` first when you want to confirm the command set before running it.

Examples:

```bash
bash scripts/validate-changes.sh --dry-run --changed-file apps/ui/src/components/AiPromptPanel.tsx
bash scripts/validate-changes.sh --changed-file apps/ui/src/utils/formatter/printer.ts
bash scripts/validate-changes.sh --scope baseline --scope e2e-web
bash scripts/validate-changes.sh --scope baseline --scope rust
```

In your final summary and PR notes, report:

- Which validations ran
- Which validations were skipped
- Why each skipped validation was not necessary

## Pull Request Handoff

Unless the user asked otherwise, open a draft PR against `main`.

Before creating the PR:

1. Confirm the working tree contains only intended changes.
2. Fill the PR body using `.github/PULL_REQUEST_TEMPLATE.md`.
3. Include the implementation plan path in the PR notes when one was created.
4. Summarize tests added, validations run, and intentionally skipped checks.

Use `gh pr create --draft --base main`.

If `gh` auth or GitHub access is unavailable, stop after local validation and report the exact blocker.

## Preview Deployment Handoff

This repo uses a PR preview workflow that deploys web-relevant pull requests to:

- `https://pr-<number>.openscad-studio.pages.dev`

After opening the PR:

1. Wait for the PR preview workflow to finish.
2. Look for the sticky preview comment or workflow success result.
3. Return both the PR URL and preview URL when a web preview applies.
4. If the PR is desktop-only or docs-only, report that no web preview was expected.

## Guardrails

- Do not create or switch worktrees from this skill.
- Do not skip the implementation plan for non-trivial work.
- Do not open the PR before required local validation succeeds.
- Do not claim a preview URL exists before the workflow has published it.
- Do not target any base branch other than `main` unless the user explicitly says so.
