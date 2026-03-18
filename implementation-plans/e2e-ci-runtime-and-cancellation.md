# E2E CI Runtime and Cancellation

## Goal

Reduce PR web e2e wall-clock time by sharding the Playwright suite across multiple GitHub Actions jobs, and cancel superseded e2e workflow runs when newer commits are pushed to the same branch.

## Approach

- Add workflow-level concurrency to the e2e workflow so older in-progress runs are canceled automatically.
- Replace the single PR web e2e job with a 4-way matrix shard setup that keeps full PR coverage.
- Add a lightweight aggregate job so branch protection can continue targeting a stable `e2e-web` status.
- Make shard artifacts unique and tighten install/browser caching to reduce repeated setup cost.
- Leave the existing Tauri desktop e2e behavior unchanged for `main` pushes.

## Affected Files

- `.github/workflows/e2e.yml`

## Checklist

- [x] Review the current e2e workflow, Playwright config, and PR/main job split.
- [x] Add this implementation record before code changes.
- [x] Add workflow concurrency with `cancel-in-progress: true`.
- [x] Replace the PR web job with 4 matrix shards and shard-specific artifact names.
- [x] Add an aggregate `e2e-web` job that depends on all shards.
- [x] Tighten dependency installation and add Playwright browser cache.
- [x] Validate the workflow syntax locally.
- [x] Summarize the change and note any follow-up verification that must happen in GitHub Actions.
