# CI Runs Only On PRs

## Goal

Stop routine CI jobs from running on direct pushes to `main` while keeping release and deployment workflows that are meant to run on `main`.

## Approach

- Limit the general CI workflow to pull requests targeting `main` or `master`.
- Limit the E2E workflow to pull requests targeting `main` and let both web and desktop E2E jobs run in that PR context.
- Leave release and deployment workflows unchanged.

## Affected Areas

- `.github/workflows/ci.yml`
- `.github/workflows/e2e.yml`

## Checklist

- [x] Review the current workflow triggers and identify which jobs should stay on `main`.
- [x] Add this implementation plan before making code changes.
- [x] Update the CI workflow so routine checks run only for pull requests.
- [x] Update the E2E workflow so routine E2E coverage runs only for pull requests.
- [x] Validate the workflow changes locally.
- [ ] Open a draft PR with the implementation summary.
