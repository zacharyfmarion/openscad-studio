# Web SEO Hardening

## Goal

Make the production web app's search and social surface feel production-ready by improving homepage metadata, adding crawler-friendly static assets, and tightening indexation rules for non-marketing share pages.

## Approach

- Upgrade `apps/web/index.html` with stronger title/description copy, canonical + robots tags, richer Open Graph and Twitter metadata, JSON-LD structured data, and a meaningful static HTML shell inside `#root` for crawlers before React hydrates.
- Add missing public SEO assets such as `robots.txt`, `sitemap.xml`, and a dedicated social preview image under `apps/web/public/`.
- Update the share metadata edge route so `/s/:id` pages keep their social cards while advertising `noindex` to search engines.
- Add focused web tests that assert the static SEO shell and share-page indexation behavior.

## Affected Areas

- `apps/web/index.html`
- `apps/web/public/robots.txt`
- `apps/web/public/sitemap.xml`
- `apps/web/public/og-image.png`
- `apps/web/functions/s/[[shareId]].ts`
- `apps/web/functions/s/__tests__/shareMeta.test.ts`
- `apps/web/functions/__tests__/seoShell.test.ts`

## Checklist

- [x] Audit the current live homepage SEO shell and repo metadata files
- [x] Harden homepage metadata and add crawlable static HTML content
- [x] Add missing public SEO assets and a dedicated social preview image
- [x] Mark share pages as noindex while preserving social metadata
- [x] Add focused regression tests for the SEO shell and share metadata behavior
- [x] Run formatting and targeted validation, then prepare PR handoff
