# Share Staging And Local Testing Plan

## Goal

Add safe pre-production testing paths for the web share feature so it can be validated before production deploys.

## Approach

1. Add a manual GitHub Actions workflow that deploys the web app to a separate staging Pages project.
2. Add a repo-supported local `wrangler pages dev` workflow that serves the built app with Pages Functions plus local KV/R2 emulation.
3. Document exactly when to use Vite dev versus the local Pages workflow, and what Cloudflare resources staging needs.

## Affected Areas

- `.github/workflows/deploy-web-staging.yml`
- `apps/web/package.json`
- `apps/web/wrangler.toml`
- `package.json`
- `README.md`
- `.gitignore`

## Checklist

- [x] Add a manual staging deploy workflow targeting `openscad-studio-staging`
- [x] Add local share-testing scripts that build with local share env vars and run `wrangler pages dev`
- [x] Ignore local Wrangler state and `.dev.vars` files
- [x] Document local share testing, staging resource requirements, and manual staging deploy steps
- [x] Verify the web build still passes
- [x] Verify the local Pages dev command can serve `/api/share`
