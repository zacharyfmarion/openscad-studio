# Share via Link Implementation Plan

## Context

OpenSCAD Studio is a web + desktop OpenSCAD editor at `openscad-studio.pages.dev`. The product roadmap (Phase 2) calls for shareable design links so every design becomes a growth vector.

This plan implements:

1. Share-via-URL: Users click "Share" to get a short link containing their design
2. Customizer-first mode: Shared links open in a customizer layout by default (preview + sliders, code hidden)
3. OpenGraph previews: Shared links render rich cards on Twitter/Discord/Reddit with a thumbnail of the design
4. Remix flow: Anyone who opens a shared link can modify and re-share with attribution to the original

Backend: Cloudflare Workers (Pages Functions) + KV + R2. Stays within free tier for a long time (see cost analysis in conversation).

Scope: Single-file designs only. No user accounts, no marketplace. Anonymous sharing. Web-only. Share button only shown in the web app, not Tauri desktop, for the first pass. Shared links bypass the welcome screen and NUX so first-time visitors land directly in the shared design.

## Product Decisions

- Shared-link layout overrides are transient for the current session only. Opening a shared design must not change `defaultLayoutPreset` or persist a share-driven Dockview layout to local storage.
- Thumbnail previews are immutable after creation. Upload is allowed once per share and must be authorized with a one-time token returned from `POST /api/share`.
- Share APIs are production-backed for v1. The client intentionally targets `https://openscad-studio.pages.dev` unless explicitly overridden for development or ops work.
- Shared-link entry bypasses the welcome screen and onboarding picker so the shared design is the first visible state.

## Architecture Overview

```text
User clicks "Share"
    |
    v
┌─────────────────────────────┐
│  ShareDialog (new component)│  <- Title input, share button, URL display
│  calls shareService.ts      │
└──────────┬──────────────────┘
           │ POST /api/share { code, title, forkedFrom? }
           v
┌─────────────────────────────┐
│  Pages Function (Worker)    │  <- Validates, compresses, stores
│  apps/web/functions/api/    │
│  share.ts                   │
└──────────┬──────────────────┘
           │ KV put share:{id} + one-time thumbnail upload token
           v
┌─────────────────────────────┐
│  Cloudflare KV              │  <- Compressed code + metadata
│  SHARE_KV namespace         │
└─────────────────────────────┘

After share succeeds, client uploads thumbnail:
    |
    | PUT /api/share/{id}/thumbnail (PNG blob + one-time token)
    v
┌─────────────────────────────┐
│  Cloudflare R2              │  <- thumbnails/{id}.png
│  share-thumbnails bucket    │
└─────────────────────────────┘

Someone opens https://openscad-studio.pages.dev/s/{id}?mode=customizer
    |
    v
┌─────────────────────────────┐
│  Pages Function             │  <- Injects OG meta tags into index.html
│  functions/s/[[shareId]].ts │     (title, thumbnail URL, description)
└──────────┬──────────────────┘
           │ Returns modified SPA HTML
           v
┌─────────────────────────────┐
│  React SPA boots            │  <- useShareLoader detects /s/{id} path
│  fetches GET /api/share/{id}│     loads code into editor
│  applies customizer layout  │     shows share banner
└─────────────────────────────┘
```

## URL Scheme

`https://openscad-studio.pages.dev/s/{shareId}`
Opens in customizer-first mode by default.

`https://openscad-studio.pages.dev/s/{shareId}?mode=editor`
Opens in full editor mode.

- `shareId`: 8-character nanoid (alphanumeric, URL-safe). Approximately 2.8 trillion combinations.
- Default mode for shared links is customizer. Users can toggle to editor mode via a URL param or UI toggle.
- No hash-based encoding. OG crawlers do not execute JS, so server-side meta tag injection is required. KV-backed short codes are cleaner.

## Data Model

KV namespace: `SHARE_KV`

Key: `share:{shareId}`

```ts
interface ShareRecord {
  id: string;                // "a3bK9xmQ"
  code: string;              // gzip-compressed, base64-encoded OpenSCAD source
  title: string;             // User-provided or tab name (max 100 chars)
  createdAt: string;         // ISO 8601
  forkedFrom: string | null; // Parent shareId if this is a remix
  thumbnailKey: string | null; // R2 object key, e.g. "thumbnails/a3bK9xmQ.png"
  thumbnailUploadTokenHash: string | null; // cleared after first successful upload
  codeSize: number;          // Uncompressed size in bytes (for display)
}
```

KV expiration: none initially. Designs persist indefinitely. TTL can be added later if storage becomes a concern.

R2 bucket: `share-thumbnails`

Path: `thumbnails/{shareId}.png`

- `1200x630` PNG for OG previews
- Max `512KB`
- `Content-Type: image/png`
- No egress fees with Cloudflare R2

## Worker API (Pages Functions)

All functions go in `apps/web/functions/`.

### `POST /api/share`

File: `apps/web/functions/api/share.ts`

Request:

```json
{ "code": "string", "title": "string?", "forkedFrom": "string?" }
```

Response:

```json
{ "id": "string", "url": "string", "thumbnailUploadToken": "string" }
```

Logic:

1. Validate `Content-Type: application/json`
2. Parse body and validate `code` exists and is a string
3. Check code size: `new TextEncoder().encode(code).length <= 51200`
4. Sanitize title: trim, truncate to 100 chars, default to `Untitled Design`
5. If `forkedFrom` is provided, validate it is an 8-char alphanumeric string without verifying existence
6. Generate 8-char nanoid
7. Compress code using `CompressionStream('gzip')`
8. Base64-encode compressed bytes
9. Generate a cryptographically random one-time `thumbnailUploadToken` and store only its hash in the record
10. Write to KV: `SHARE_KV.put('share:${id}', JSON.stringify(record))`
11. Return `{ id, url: 'https://openscad-studio.pages.dev/s/${id}', thumbnailUploadToken }`

Rate limiting:

- IP-based counter in KV
- Key: `ratelimit:{ip}:{hour}`
- Value: count
- TTL: `3600`
- Limit: `30 shares/hour/IP`

Errors:

- `400`: missing or invalid code
- `413`: code exceeds 50KB
- `429`: rate limited
- `500`: KV write failure

### `GET /api/share/[id]`

File: `apps/web/functions/api/share/[id].ts`

Response:

```json
{
  "id": "string",
  "code": "string",
  "title": "string",
  "createdAt": "string",
  "forkedFrom": "string | null",
  "thumbnailUrl": "string | null"
}
```

Logic:

1. Extract id from path params
2. Read from KV: `SHARE_KV.get('share:${id}')`
3. If not found, return `404 { error: 'Design not found' }`
4. Decompress code using base64 decode and `DecompressionStream`
5. Build `thumbnailUrl` from `thumbnailKey` if present
6. Return JSON with decompressed code

### `PUT /api/share/[id]/thumbnail`

File: `apps/web/functions/api/share/[id]/thumbnail.ts`

Request: binary PNG body with `Content-Type: image/png` and `Authorization: Bearer {thumbnailUploadToken}`

Response:

```json
{ "thumbnailUrl": "string" }
```

Logic:

1. Validate content type is `image/png`
2. Validate body size `<= 512KB`
3. Verify share exists in KV
4. Verify `thumbnailKey === null` and `thumbnailUploadTokenHash` is present
5. Hash the provided bearer token and compare it to `thumbnailUploadTokenHash`
6. Write PNG to R2: `SHARE_R2.put('thumbnails/${id}.png', body)`
7. Update KV record `thumbnailKey` and clear `thumbnailUploadTokenHash`
8. Return `thumbnailUrl`

Errors:

- `401`: missing or invalid thumbnail upload token
- `409`: thumbnail already exists for this share

### `GET /s/[[shareId]]`

File: `apps/web/functions/s/[[shareId]].ts`

Logic:

1. Extract `shareId` from catch-all params
2. Fetch share metadata from KV without decompressing code
3. Call `context.next()` to get the SPA `index.html`
4. Read HTML as text
5. Replace OG tags:
   - `og:title` -> `{title} — OpenSCAD Studio`
   - `og:description` -> `Open this parametric design in OpenSCAD Studio. Customize parameters and download STL for 3D printing.`
   - `og:image` -> thumbnail URL or `/icon-512.png`
   - `og:url` -> share URL
   - `twitter:card` -> `summary_large_image` if thumbnail exists, otherwise `summary`
   - `twitter:title`, `twitter:description`, `twitter:image` -> same values
6. Preserve:
   - `Cross-Origin-Embedder-Policy: require-corp`
   - `Cross-Origin-Opener-Policy: same-origin`
7. Return modified HTML

If KV read fails or share is not found, still serve the SPA so client-side handling can show the error state.

## Frontend: New Files

### `apps/ui/src/services/shareService.ts`

API client for share operations.

```ts
const SHARE_API_BASE =
  import.meta.env.VITE_SHARE_API_URL || 'https://openscad-studio.pages.dev';

const SHARE_ENABLED =
  import.meta.env.PROD || import.meta.env.VITE_ENABLE_PROD_SHARE_DEV === 'true';

export interface CreateShareRequest {
  code: string;
  title: string;
  forkedFrom?: string;
}

export interface ShareData {
  id: string;
  code: string;
  title: string;
  createdAt: string;
  forkedFrom: string | null;
  thumbnailUrl: string | null;
}

export async function createShare(
  req: CreateShareRequest,
): Promise<{ id: string; url: string; thumbnailUploadToken: string }>;

export async function getShare(shareId: string): Promise<ShareData>;

export async function uploadThumbnail(
  shareId: string,
  pngBlob: Blob,
  thumbnailUploadToken: string,
): Promise<void>;
```

Notes:

- `createShare`: `POST /api/share`, surface descriptive error messages by status code
- `getShare`: `GET /api/share/{id}`, throw on `404`
- `uploadThumbnail`: `PUT /api/share/{id}/thumbnail`, fire-and-forget, silent caller-side failure handling
- Sharing stays production-backed for v1. Keep the explicit production default, and gate Share UI behind `SHARE_ENABLED` so local/preview builds do not accidentally write to production unless intentionally opted in.
- Desktop note: sharing is web-only for v1, but `VITE_SHARE_API_URL` already supports later Tauri use

### `apps/ui/src/hooks/useShareLoader.ts`

Detects a share URL on initial load and fetches the design.

```ts
interface ShareContext {
  shareId: string;
  mode: 'customizer' | 'editor';
}

interface ShareLoaderResult {
  isLoading: boolean;
  shareData: ShareData | null;
  error: string | null;
  shareContext: ShareContext | null;
  retry: () => void;
}

export function useShareLoader(): ShareLoaderResult;
```

Implementation:

1. On mount, parse `window.location.pathname` for `/s/{id}`
2. Parse `?mode=editor`, otherwise default to `customizer`
3. Fetch `getShare(shareId)`
4. Return `shareData` on success
5. On `404`, set `This design doesn't exist or has been removed.`
6. On network error, set `Couldn't load this design. Check your connection.`
7. After success, clean the URL with `window.history.replaceState({}, document.title, '/')` so refresh preserves local edits instead of re-fetching the original
8. Expose enough state for `App.tsx` to bypass welcome/NUX and enter the shared design immediately

### `apps/ui/src/components/ShareDialog.tsx`

Modal for creating and copying share links. Follows the `ExportDialog` pattern.

```ts
interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  source: string;
  tabName: string;
  forkedFrom?: string | null;
  capturePreview: () => Promise<string | null>;
  stlBlobUrl: string | null;
  previewKind: RenderKind | null;
}
```

States:

1. Initial: title input, code size indicator, create button
2. Sharing: spinner and `Creating link...`
3. Success: share URL, copy button, browser link, mode toggle
4. Error: error message with retry

Layout:

```text
┌──────────────────────────────────────┐
│  Share Design                     ✕  │
│                                      │
│  Title: [Phone Stand V2          ]   │
│  Size: 1.2 KB                        │
│                                      │
│  [Create Share Link]                 │
│                                      │
│  ─── After sharing ───               │
│                                      │
│  Link: [openscad-studio.../s/abc] 📋 │
│                                      │
│  Default view:                       │
│  (●) Customizer  ( ) Full Editor     │
│                                      │
│  ✓ Link copied to clipboard          │
└──────────────────────────────────────┘
```

### `apps/ui/src/components/ShareBanner.tsx`

Thin banner shown when viewing a shared design.

```text
┌──────────────────────────────────────────────────────────────┐
│ 📌 Shared design: "Phone Stand V2"  [Share your remix]  [✕] │
└──────────────────────────────────────────────────────────────┘
```

Behavior:

- Show original design title
- If `forkedFrom` is set, show `Remixed from {parentTitle}` and fetch parent title lazily
- `Share your remix` opens `ShareDialog` with `forkedFrom` pre-set
- Dismiss hides the banner for the session
- Render above the Dockview area in the main app layout

## Frontend: Modified Files

### `apps/web/src/main.tsx`

Add share-context detection before app render:

```ts
declare global {
  interface Window {
    __UNSUPPORTED_BROWSER?: boolean;
    __SHARE_CONTEXT?: { shareId: string; mode: 'customizer' | 'editor' };
  }
}

const shareMatch = window.location.pathname.match(/^\/s\/([a-zA-Z0-9_-]{1,20})$/);
if (shareMatch) {
  const params = new URLSearchParams(window.location.search);
  window.__SHARE_CONTEXT = {
    shareId: shareMatch[1],
    mode: params.get('mode') === 'editor' ? 'editor' : 'customizer',
  };
}
```

### `apps/ui/src/App.tsx`

Changes:

1. Import `ShareDialog`, `ShareBanner`, `useShareLoader`
2. Add `showShareDialog` state
3. Add `shareOrigin` state to track whether the current tab came from a share
4. On successful share load:
   - `replaceWelcomeTab({ filePath: null, name: shareData.title, content: shareData.code })`
   - hide welcome screen
   - suppress NUX for this entry path so the shared design opens immediately
   - set `shareOrigin`
5. In `onDockviewReady`, apply a transient share-mode layout override when share mode is `customizer`
   - do not call `updateSetting('ui', { defaultLayoutPreset: ... })`
   - do not persist the share-driven Dockview layout with `saveLayout()`
   - do not clear the user's previously saved non-share layout while in share mode
6. Add web-only Share button in header toolbar after Export when `SHARE_ENABLED` is true
7. Render `ShareBanner` above Dockview when `shareOrigin` is set
8. Render `ShareDialog` next to existing dialogs
9. Show loading overlay while a share is loading
10. Show error screen with `Go to editor` and `Retry` when share load fails

### `apps/ui/src/components/WebMenuBar.tsx`

Add `Share...` to the File menu after Export and wire `onShare` through props:

```ts
{ type: 'action', id: 'file.export', label: 'Export...' },
{ type: 'action', id: 'file.share', label: 'Share...' },
```

### `apps/web/index.html`

Ensure `og:url` exists:

```html
<meta property="og:url" content="https://openscad-studio.pages.dev" />
```

## Thumbnail Generation

Timing:

- Run after `createShare()` succeeds
- Non-blocking
- Share URL is available immediately

Implementation sketch:

```ts
async function uploadShareThumbnail(shareId: string, thumbnailUploadToken: string) {
  try {
    let dataUrl: string | null = null;

    if (stlBlobUrl) {
      dataUrl = await captureOffscreen(stlBlobUrl, {
        view: 'isometric',
        width: 1200,
        height: 630,
      });
    }

    if (!dataUrl && capturePreview) {
      dataUrl = await capturePreview();
    }

    if (!dataUrl) return;

    const response = await fetch(dataUrl);
    const blob = await response.blob();

    await uploadThumbnail(shareId, blob, thumbnailUploadToken);
  } catch (err) {
    console.warn('[share] Thumbnail upload failed:', err);
  }
}
```

Offscreen renderer changes:

- Extend `captureOffscreen()` to accept optional `width` and `height`
- Default to existing screenshot dimensions when omitted
- Use `1200x630` for share thumbnails

For `svg` previews, reuse the existing SVG-to-PNG rasterization path and center the SVG inside a `1200x630` output.

## Remix Flow

Mental model: opening a shared link gives the user an editable copy. There is no read-only state.

Attribution chain:

- `forkedFrom` stores only the immediate parent share ID
- Shared-design banner shows `Remixed from {parentTitle}` when present
- Parent title is fetched lazily via `GET /api/share/{forkedFrom}`

Re-sharing:

- Opening from a share pre-fills `forkedFrom` in `ShareDialog`
- User can clear attribution if desired
- New shares from scratch use `forkedFrom: null`

## Error Handling Matrix

| Scenario | Where | Behavior |
| --- | --- | --- |
| Code > 50KB | ShareDialog client validation | Disable create button and show `Design is too large (50KB max)` |
| Empty code | ShareDialog client validation | Disable create button |
| `POST /api/share` network error | ShareDialog | Show `Couldn't create link. Check your connection.` and Retry |
| `POST /api/share` 429 | ShareDialog | Show `Too many shares. Try again in a few minutes.` |
| `POST /api/share` 500 | ShareDialog | Show `Something went wrong. Try again.` |
| `GET /api/share` 404 | Share load screen | Show missing-design message and `Go to Editor` |
| `GET /api/share` network error | Share load screen | Show network message plus Retry and `Go to Editor` |
| `PUT /api/share/{id}/thumbnail` 401 | Background flow | Console warning only; token missing/invalid |
| `PUT /api/share/{id}/thumbnail` 409 | Background flow | Console warning only; thumbnail already exists |
| Thumbnail capture fails | Background flow | Console warning only |
| Thumbnail upload fails | Background flow | Console warning only |
| OG function cannot read KV | Pages Function | Serve SPA with default OG tags |
| Share opened on desktop app | Product behavior | Share button hidden in Tauri for v1 |
| Clipboard write fails | ShareDialog | Select URL text and show `Copy the link above` |

## Implementation Phases

### Phase A: Cloudflare Infrastructure Setup

1. Create KV namespace `SHARE_KV`
2. Create R2 bucket `share-thumbnails`
3. Create `apps/web/wrangler.toml` with bindings
4. Update web deployment so Cloudflare Pages actually uploads `apps/web/functions`
   - either run `wrangler pages deploy dist` from `apps/web`
   - or deploy from repo root with `--cwd apps/web` / explicit config so Wrangler sees the `functions/` directory
5. Update `.github/workflows/deploy-web.yml` to use the new deploy shape
6. Create `apps/web/functions/api/share.ts`
7. Create `apps/web/functions/api/share/[id].ts`
8. Create `apps/web/functions/api/share/[id]/thumbnail.ts`
9. Create `apps/web/functions/s/[[shareId]].ts`
10. Test endpoints with `curl`
11. Verify COOP/COEP headers pass through functions

### Phase B: Frontend - Share Creation

1. Create `apps/ui/src/services/shareService.ts`
2. Create `apps/ui/src/components/ShareDialog.tsx`
3. Add Share button to `App.tsx`
4. Add `showShareDialog` state and dialog render
5. Add `Share...` to `WebMenuBar.tsx`
6. Wire `onShare` from `WebMenuBar` to `App`
7. Gate Share UI behind `SHARE_ENABLED` so local/preview builds do not write to production by accident
8. Add thumbnail generation after successful share using the one-time upload token returned by `createShare()`

### Phase C: Frontend - Share Loading

1. Add `__SHARE_CONTEXT` detection to `apps/web/src/main.tsx`
2. Create `apps/ui/src/hooks/useShareLoader.ts`
3. Integrate `useShareLoader` into `App.tsx`
4. Bypass welcome/NUX when booting from a shared link
5. Handle customizer-first layout override in `onDockviewReady` without persisting it to user settings or saved layout
6. Create `apps/ui/src/components/ShareBanner.tsx`
7. Render `ShareBanner` when `shareOrigin` is set

### Phase D: Polish and Testing

1. Add `og:url` meta tag to `index.html`
2. Update `offscreenRenderer.ts` for custom width and height
3. Add analytics events: `design_shared`, `shared_design_opened`, `share_link_copied`
4. Test OG tags with Twitter Card Validator, Facebook Sharing Debugger, and Discord
5. Verify COOP/COEP headers still work through Pages Functions
6. Test on mobile web
7. Verify Share button is hidden in Tauri desktop
8. Verify share-mode layout does not overwrite the user's saved layout or `defaultLayoutPreset`
9. Verify second thumbnail upload is rejected after the first succeeds
10. Add E2E coverage for share creation and loading

## Key Files Reference

| File | Action | Purpose |
| --- | --- | --- |
| `apps/web/functions/api/share.ts` | Create | POST endpoint for share creation |
| `apps/web/functions/api/share/[id].ts` | Create | GET endpoint for loading shares |
| `apps/web/functions/api/share/[id]/thumbnail.ts` | Create | PUT endpoint for thumbnails |
| `apps/web/functions/s/[[shareId]].ts` | Create | OG tag injection |
| `apps/web/wrangler.toml` | Create | KV and R2 bindings |
| `.github/workflows/deploy-web.yml` | Modify | Deploy `apps/web/functions` alongside `dist` |
| `apps/ui/src/services/shareService.ts` | Create | Frontend API client |
| `apps/ui/src/hooks/useShareLoader.ts` | Create | Share URL detection and loading |
| `apps/ui/src/components/ShareDialog.tsx` | Create | Share creation modal |
| `apps/ui/src/components/ShareBanner.tsx` | Create | Shared-design banner |
| `apps/ui/src/App.tsx` | Modify | Button, dialog, loader integration, banner, layout override |
| `apps/ui/src/components/WebMenuBar.tsx` | Modify | Add `Share...` menu item |
| `apps/web/src/main.tsx` | Modify | Detect `/s/{id}` and set share context |
| `apps/web/index.html` | Modify | Add `og:url` meta tag |
| `apps/ui/src/services/offscreenRenderer.ts` | Modify | Thumbnail dimensions |

## Verification Plan

### Manual Testing

1. Share creation: click Share, enter title, get URL, verify it works in incognito
2. Share loading: open shared URL, confirm code loads, customizer-first layout is active, preview renders, and welcome/NUX are skipped
3. Mode toggle: open with `?mode=editor` and verify full editor layout
4. Remix: open shared link, modify code, click `Share your remix`, verify `forkedFrom`
5. OG tags: paste share URL into card validators and verify title and thumbnail
6. Clipboard: verify copy works and fallback appears when clipboard API is unavailable
7. Error states: test nonexistent share ID, offline network, and `>50KB` code
8. Desktop: verify shared URLs still point to the web app and Share UI remains hidden in Tauri
9. Open a shared design, close it, then reopen the app normally and confirm the user's saved layout/preset is unchanged
10. Attempt a second thumbnail upload for the same share and verify the endpoint rejects it

### Automated Testing

- E2E: create share, open share URL, verify code loads
- E2E: open shared URL, confirm welcome/NUX do not appear, and confirm share-mode layout does not persist after leaving the shared design
- Unit: `shareService` error handling, `useShareLoader` URL parsing, code-size validation

### Infrastructure Testing

- Verify Workers deploy with `wrangler pages deploy` from a location/config that includes `apps/web/functions`
- Verify KV reads and writes
- Verify R2 uploads and public thumbnail access
- Verify one-time thumbnail upload tokens are invalid after first successful use
- Verify COOP/COEP headers are preserved through Pages Functions
- Load test rate limiting behavior
