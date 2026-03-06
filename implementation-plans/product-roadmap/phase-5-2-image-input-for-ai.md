# Phase 5.2: Image Input for AI

## Summary

Extend the chat message model from "string content" to "array of typed content parts" (text + images), process/limit images client-side into safe compressed base64, and map those parts to Anthropic/OpenAI's native multimodal message formats on both Web (Vercel AI SDK) and Desktop (Tauri IPC → Rust). Keep persistence local-only and size-bounded by storing a small thumbnail inline plus an optional local blob/file reference for the full image.

## Effort Estimate

Large (3+ days)

## Action Plan

1. Define a shared message schema v2 (TS + Rust) supporting `content: ContentPart[]` with backwards-compatible parser for legacy `content: string`.
2. Implement attachment capture in AiPromptPanel: paste, drag-drop, and file picker → produce `ImageAttachmentDraft[]` shown pre-send with remove controls.
3. Add client-side image processing pipeline: validate type, downscale, re-encode (JPEG/PNG), enforce hard size limits, generate thumbnail, return base64/data URL.
4. Render thumbnails in chat history with lazy loading, click-to-expand, and accessible labels.
5. Bridge to providers: convert `ContentPart[]` into Anthropic/OpenAI request payloads.
6. Persist conversations with attachments using "inline thumbnail + local asset reference."
7. Add error handling + tests for capture/processing/serialization/provider rejection.

## Message Format

```ts
type ContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      id: string;
      mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
      dataUrl?: string;
      base64?: string;
      width?: number;
      height?: number;
      bytes?: number;
      name?: string;
      alt?: string;
      thumbDataUrl: string;
      storageRef?: { kind: 'indexeddb' | 'file'; key: string };
    };

type ChatMessageV2 = { id: string; role: Role; content: ContentPart[]; createdAt: number };
```

## Image Capture Methods

- **Clipboard paste**: Inspect `event.clipboardData.items` for images
- **Drag-drop**: `preventDefault()` + read `event.dataTransfer.files`
- **File picker**: Paperclip button with `<input type="file" accept="image/*" multiple />`
- Max 4 images per message

## Image Processing Pipeline

1. Read file/blob → `createImageBitmap()` or `Image()` decode
2. Downscale to max 2048px on longest side
3. Re-encode as JPEG (quality ~0.8) for photos, keep PNG if transparency needed
4. Generate thumbDataUrl (256px, JPEG quality ~0.7)
5. Cap: 1–2 MB per image after re-encode

## Provider Format Mapping

**Anthropic**: `{ type: "image", source: { type: "base64", media_type: "image/jpeg", data: "<base64>" } }`
**OpenAI**: `{ type: "image_url", image_url: { url: "data:image/jpeg;base64,..." } }`

## Persistence Strategy

- Always store message text + thumbnail dataUrl inline (small)
- Full image stored separately:
  - Web: IndexedDB (`storageRef: { kind:'indexeddb', key }`)
  - Desktop: app data files (`storageRef: { kind:'file', key: 'conversations/assets/<id>.jpg' }`)
- Lazy load full image on click/expand

## Security

- No remote storage — images remain in memory + local device only
- Re-encode client-side to strip EXIF metadata
- Block SVG (scriptable)

## Edge Cases

- Pasting text + image → attach images and allow text paste
- Multiple images → attach up to max count, warn about extras
- Empty text with only images → allow
- Model vision gating → warn if selected model doesn't support vision
