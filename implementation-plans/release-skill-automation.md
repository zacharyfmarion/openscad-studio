# AI Release Skill Automation

## Goal

Let Codex handle requests like "Please release version X.Y.Z" by using a dedicated skill plus a non-interactive release-script interface for formatted changelog input.

## Approach

- Extend `scripts/release.sh prepare` with automation-friendly changelog flags.
- Document the non-interactive release flow for skill usage.
- Install a local Codex skill that drafts a well-structured changelog section, calls the release script, and handles follow-up publish requests after merge.

## Affected Areas

- `scripts/release.sh`
- `scripts/README.md`
- `$CODEX_HOME/skills/openscad-release/`

## Checklist

- [x] Add non-interactive release notes input to `scripts/release.sh`.
- [x] Update script documentation for AI-driven release usage.
- [x] Create a local Codex skill with `SKILL.md` and `agents/openai.yaml`.
- [x] Validate the script interface and generated skill files.
