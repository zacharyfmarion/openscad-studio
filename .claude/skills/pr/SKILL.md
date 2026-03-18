---
name: pr
description: Use when the user wants to open a pull request. Reads the PR template, inspects changes vs main, runs the release skill first if the branch name looks like a version, then opens a PR targeting main.
---

# Open Pull Request

1. Read `.github/PULL_REQUEST_TEMPLATE.md` and understand its required sections.
2. Inspect what has changed on this branch vs `main`.
3. If the current branch name looks like a version branch (e.g. `v0.11`, `zac/v0.11`), invoke the `openscad-release` skill before creating the PR.
4. Draft a PR title and body that follow the template exactly, filling each section based on the actual changes.
5. Open the PR against `main` using `gh pr create` and return the URL.
