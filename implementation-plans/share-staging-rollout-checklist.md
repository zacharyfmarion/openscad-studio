# Share Staging Rollout Checklist

Working plan for getting the share feature from local development to staging validation and finally production release without leaking unfinished work into production.

Related docs:

- `implementation-plans/share-staging-and-local-testing.md`
- `implementation-plans/share-via-link-execution.md`

## 1. Branch And PR Setup

- [x] Create a dedicated feature branch for share + staging work
- [x] Commit the current share/staging implementation to that branch
- [x] Push the branch to GitHub
- [x] Open a reference PR against `main`

## 2. Local Confidence

- [ ] Run `pnpm web:share:dev`
- [ ] Confirm `POST /api/share` succeeds locally
- [ ] Create a share link from the UI locally
- [ ] Open the shared link in an incognito window
- [ ] Confirm the shared design opens as an editable copy
- [ ] Confirm editing the shared copy does not change the original session

## 3. Cloudflare Staging Setup

- [ ] Create Pages project `openscad-studio-staging`
- [ ] Create staging KV namespace
- [ ] Create staging R2 bucket
- [ ] Bind `SHARE_KV` in the staging Pages project
- [ ] Bind `SHARE_R2` in the staging Pages project
- [ ] Configure staging Pages environment variables

## 4. GitHub Staging Setup

- [ ] Create GitHub environment `staging`
- [ ] Add Cloudflare credentials to the `staging` environment
- [ ] Add web build secrets to the `staging` environment
- [ ] Verify `Deploy Web App (Staging)` is available in Actions

## 5. Staging Deployment

- [ ] Run the manual `Deploy Web App (Staging)` workflow
- [ ] Confirm the staging site loads
- [ ] Confirm the Share button is visible on staging

## 6. Staging Validation

- [ ] Create a share link successfully in staging
- [ ] Open the shared link in an incognito window
- [ ] Confirm onboarding is skipped for shared links
- [ ] Confirm customizer-first mode works
- [ ] Confirm switching to full editor works
- [ ] Confirm the recipient gets an editable copy, not collaborative edits
- [ ] Confirm the original session remains unchanged
- [ ] Confirm the shared-link layout override does not overwrite the saved default layout
- [ ] Confirm invalid or missing links show the expected error state
- [ ] Confirm OG tags and thumbnail behavior on `/s/:id`

## 7. Production Release

- [ ] Review the PR one final time
- [ ] Merge to `main`
- [ ] Confirm production deploy completes
- [ ] Create a production share link successfully
- [ ] Open the production shared link in an incognito window
- [ ] Confirm production recipients still get an editable copy
- [ ] Confirm OG behavior works in production
