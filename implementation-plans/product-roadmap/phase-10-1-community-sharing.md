# Phase 10.1: Community & Sharing

## Summary

Ship URL-based sharing first using compressed base64url-encoded payload in the URL **fragment** (client-side, privacy-friendlier), fall back to a tiny serverless "pastebin" for large designs. Build gallery as static JSON catalog. Add community prompts as a later increment.

## Effort Estimate

Medium (1–2d) for URL sharing + static gallery; Large (3d+) for full community prompts with auth/moderation.

## Action Plan

1. Implement `ShareCodec` (encode/decode/versioning) and editor "Open from URL" routing for web + Tauri.
2. Add "Share" UI with **size meter** and two modes: Inline URL (default) and Hosted link (fallback).
3. Deploy minimal serverless paste service (Cloudflare Worker) with TTL storage and rate limiting.
4. Add static gallery manifest + "one-click open" flow.
5. Ship curated "Prompt Library" as static content; add "Suggest a prompt" via GitHub issue link.
6. Add backend-backed community prompts (submit/upvote/moderation) when paste service is stable.
7. Add optional social signals (views/favorites/comments) only after auth/abuse posture.

## URL Sharing — Encoding Strategy

- Encode in URL **fragment**: `/#/open#v=1&src=<payload>` (fragment not sent to servers)
- Payload: `gzip(code UTF-8) → base64url` with version prefix (`v=1`)
- Optional metadata: `title`, `author`, `mode=inline|hosted`

## URL Size Limits

- Conservative max: **8 KB** total URL for inline share
- Show meter updating as user types
- If exceeded: switch CTA to "Create hosted link"
- On load: handle oversized/malformed with friendly error + manual paste escape hatch

## Pastebin-Style Service

**Self-hosted serverless (Cloudflare Worker):**

- `POST /api/snippets` → `{id, url, expiresAt}`
- `GET /api/snippets/:id` → `{code, meta}`
- Storage: KV + TTL for ephemeral sharing
- Optional: D1 for prompts/votes/moderation later

## Gallery Architecture (Static First)

- `gallery.json` in repo, served by Cloudflare Pages
- Entries: `{ id, title, description, code, tags[], difficulty, previewImage?, createdAt }`
- No backend needed; easy review via PRs

## Example Designs

- ~20–40 examples across categories:
  - Primitives/Transforms, Boolean modeling, Parametric parts, Patterns, Text/2D→3D, Debugging, Performance tips
- Metadata: Difficulty (Beginner/Intermediate/Advanced), Tags (`2d`, `3d`, `parametric`, `tutorial`, `animation`, `printing`)

## One-Click Open

- Gallery click → load code into Monaco model
- Single loader path: `openDesign({ source: 'gallery'|'url'|'snippet', code, meta })`
- Warn on unsaved changes

## Community Prompts

**Phase 10.1 (minimal):** curated prompt library as static JSON + "Suggest prompt" → GitHub issue template.

**Phase 10.2+ (later):**

- `POST /api/prompts` (creates `pending`), `POST /api/prompts/:id/vote`, `GET /api/prompts?sort=top|new`
- Moderation: `pending → approved → (hidden|rejected)`
- Anonymous voting with IP rate limit + per-browser key

## Backend Requirements

- Cloudflare Worker (API) + KV (snippet blobs with TTL)
- Optional D1 for prompts/votes/moderation
- Near $0 on free/cheap tiers for small traffic

## Authentication

- Sharing: anonymous by default (TTL-based snippets)
- Community prompts: anonymous + rate-limited initially; add OAuth (GitHub) later if needed
- Abuse prevention: Turnstile on POST endpoints, IP throttling, content size limits

## Privacy

- Pre-share dialog: "Shared designs are public to anyone with the link"
- Don't auto-share on copy; require explicit click
- Inline fragment: clarify still shareable; hosted: show expiry

## Platform Integration

- Same `ShareCodec` and `openDesign()` path in both web + desktop
- Desktop: "Open from link" dialog or deep link (custom protocol)
- Hosted endpoint: HTTPS + CORS-friendly

## Error Handling

- Inline decode errors: "Invalid share link" with "Open empty editor" option
- Hosted snippet: `404` → "Link expired", `5xx` → "Service unavailable"
- Always provide fallback: show raw decoded payload if partially recoverable

## Edge Cases

- `include/use` dependencies: warn "This design depends on external files"
- Large files: hard cap (200–500 KB) for hosted snippets initially

## Security

- Treat shared code as plain text only; never `dangerouslySetInnerHTML`
- Enforce content-type, size limits, strict CORS origins
- Rate limit POST endpoints

## Phased Rollout

**Ship first:** Inline URL sharing + "Open from link" + static gallery + curated prompt library
**Ship next:** Hosted snippet fallback (Worker + KV, TTL)
**Later:** Community prompts in-app; social features after auth
