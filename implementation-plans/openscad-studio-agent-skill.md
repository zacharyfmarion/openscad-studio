# OpenSCAD Studio Agent Skill

## Goal

Publish an installable `openscad-studio` Agent Skill from this repository and surface skill installation alongside the desktop MCP onboarding UI.

## Approach

- Add a standalone skill package under `skills/openscad-studio/` with metadata, license, and guidance aligned with the current Studio MCP tools and in-app AI prompt.
- Add skills.sh repository metadata so the skill can be discovered and installed from the public repo.
- Add shared install helper constants/functions and show the skill install command/link in desktop MCP onboarding surfaces.
- Update README copy so MCP is described as render-oriented feedback while external agents keep file edits in the repo.
- Update component tests and run targeted validation, followed by the shared repo validation script when feasible.

## Affected Areas

- `skills/openscad-studio/`
- `skills.sh.json`
- `apps/ui/src/services/desktopMcp.ts`
- `apps/ui/src/components/settings/ExternalAgentsCard.tsx`
- `apps/ui/src/components/WelcomeScreen.tsx`
- `apps/ui/src/components/__tests__/SettingsDialog.test.tsx`
- `apps/ui/src/components/__tests__/WelcomeScreen.test.tsx`
- `README.md`

## Checklist

- [x] Add the skill package and skills.sh metadata
- [x] Add shared skill install helpers
- [x] Surface skill installation in settings MCP onboarding
- [x] Surface skill installation on the desktop welcome screen
- [x] Update README MCP copy
- [x] Update tests for new onboarding copy
- [x] Validate skill installation listing
- [x] Run formatting, linting, type checking, and targeted tests
