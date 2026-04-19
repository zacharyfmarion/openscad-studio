# Development

This document covers local development, share-feature testing, project structure, and contributor-facing setup details.

## Local Setup

```bash
# Install dependencies
pnpm install

# Run web version in fast UI-only development mode
pnpm web:dev

# Run web version with Pages Functions + local KV/R2 for share testing
pnpm web:share:dev

# Run desktop version in development mode (requires Rust toolchain)
pnpm tauri:dev

# First-time desktop setup: download the OpenSCAD binary
bash apps/ui/src-tauri/scripts/download-openscad.sh

# Build for production
pnpm web:build    # Web
pnpm tauri:build  # Desktop
```

Desktop development requires the [Rust toolchain](https://rustup.rs/) and the OpenSCAD binary (run `bash apps/ui/src-tauri/scripts/download-openscad.sh` once). Web development only needs Node.js 18+ and pnpm.

## Share Feature Testing

The share feature depends on Cloudflare Pages Functions plus the `SHARE_KV` and `SHARE_R2`
bindings. Because of that:

- `pnpm web:dev` is still the fastest way to iterate on the web UI, but share link creation will not work there.
- `pnpm web:share:dev` is the local workflow for real share testing.

`pnpm web:share:dev` does three things:

1. builds the web app with local share env vars baked in
2. starts `wrangler pages dev` from `apps/web/dist`
3. emulates `SHARE_KV` and `SHARE_R2` locally with persistence in `.wrangler/state/share-dev`

The repo currently uses `wrangler@3` for local Pages dev to stay aligned with existing deploy
scripts. If you see a compatibility-date fallback warning while running `pnpm web:share:dev`, that
warning is expected with the current pinned CLI version and does not prevent local share testing.

Use it when you need to verify:

- `POST /api/share`
- `GET /api/share/:id`
- `/s/:id` shared-link loading
- local thumbnail storage behavior

If you change frontend code while using `pnpm web:share:dev`, stop it and rerun the command so the built assets are refreshed.

## Staging Share Testing

Use a separate Cloudflare Pages project for staging:

- Pages project: `openscad-studio-staging`
- KV binding: `SHARE_KV`
- R2 binding: `SHARE_R2`

Recommended Cloudflare resources:

- KV namespace: `SHARE_KV_STAGING`
- R2 bucket: `share-thumbnails-staging`

The repo includes a manual GitHub Actions workflow:

- `Deploy Web App (Staging)`

Before running it, configure the GitHub `staging` environment with:

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_PUBLIC_POSTHOG_KEY`
- `VITE_PUBLIC_POSTHOG_HOST`
- `VITE_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

Then:

1. create the staging Pages project and bind `SHARE_KV` and `SHARE_R2` in Cloudflare
2. open GitHub Actions
3. run `Deploy Web App (Staging)`
4. test share creation on the staging URL in a fresh browser session

Minimum staging verification:

- create a share link successfully
- open the shared link in an incognito window
- confirm the recipient gets an editable copy rather than changing the original
- confirm onboarding is skipped for shared links
- confirm the shared-link layout override does not overwrite the user’s saved default layout
- confirm the `/s/:id` page returns OpenGraph tags and a thumbnail when available

## Project Structure

```text
openscad-studio/
├── apps/
│   ├── ui/                      # Desktop app (Tauri + React)
│   │   ├── src/                 # Shared React frontend
│   │   │   ├── components/      # React components
│   │   │   ├── hooks/           # Custom React hooks
│   │   │   ├── platform/        # Platform abstraction layer
│   │   │   │   ├── types.ts     # PlatformBridge interface
│   │   │   │   ├── tauriBridge.ts # Desktop implementation
│   │   │   │   └── webBridge.ts # Web implementation
│   │   │   ├── services/        # Render services (WASM + native), AI service, OpenSCAD worker
│   │   │   ├── stores/          # Zustand state (project files, workspace, settings)
│   │   │   └── themes/          # 27 editor themes
│   │   └── src-tauri/           # Rust backend (desktop only)
│   └── web/                     # Web app entry point (Vite)
└── packages/
    └── shared/                  # Shared TypeScript types
```

## AI Copilot Setup

The AI copilot uses the [Vercel AI SDK](https://sdk.vercel.ai/) with streaming support. AI requests are made client-side in both the web app and the Tauri desktop app, and API keys are currently stored in obfuscated localStorage-backed state inside the browser/webview. This is a convenience tradeoff, not backend-style secret isolation.

1. Open Settings (⌘,)
2. Navigate to "AI" tab
3. Enter your Anthropic / OpenAI API key

**Supported Providers:**
All models from the following providers are supported:

- Anthropic
- OpenAI

The AI can:

- View your current code and preview
- Make targeted code changes
- Check for compilation errors
- Generate new OpenSCAD designs from natural language
- Browse and create files in multi-file projects

## Contributor References

- [CLAUDE.md](CLAUDE.md) - Comprehensive guide for AI assistants and contributors
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines
- [engineering-roadmap.md](engineering-roadmap.md) - Detailed development roadmap
