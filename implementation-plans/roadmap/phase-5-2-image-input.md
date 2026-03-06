# Image Input Support — Implementation Plan (OpenSCAD Studio AI Copilot)

## 1) Overview

Users often start from a sketch, photo, or reference object. Image input lets the copilot infer proportions/features and generate OpenSCAD models faster than text-only prompting. A "send current preview" shortcut enables iterative refinement.

---

## 2) Input Methods

### A) Clipboard paste (Ctrl/Cmd+V)

- `onPaste` handler on compose area
- Inspect `event.clipboardData.items` for `kind === "file"` and `type.startsWith("image/")`
- Allow text through simultaneously

### B) File drag-and-drop

- `onDragEnter/Over/Leave/Drop` on compose container
- Filter images, show overlay "Drop image to attach"

### C) File picker button

- Hidden `<input type="file" accept="image/*" multiple />` triggered by button

### D) "Send preview to AI"

- Viewer button → `PlatformBridge.getPreviewImage()` → attach as normalized image

---

## 3) Image Processing

### Supported formats: PNG, JPEG, WebP, GIF, SVG

- **Output format**: JPEG (compression) or PNG (transparency)

### Size limits

- Input acceptance: **10MB** per file
- Post-processing: **≤5MB** (Anthropic), **≤4MB** (OpenAI)
- Max images per message: **3**

### Resizing strategy

- Max long edge: 1024px, preserve aspect ratio
- `createImageBitmap(file)` → draw to `<canvas>` at target size
- Progressive compression: JPEG quality 0.85 → 0.75 → 0.6; reduce dimensions if still too large

### EXIF stripping

- Re-encoding through canvas strips metadata by construction

---

## 4) API Integration

### Internal message representation

```ts
type MessageContentPart =
  | { type: 'text'; text: string }
  | {
      type: 'image';
      mediaType: string;
      dataUrl: string;
      base64: string;
      width?: number;
      height?: number;
      name?: string;
      bytes?: number;
    };

type ChatMessage = { role: 'user' | 'assistant' | 'system'; content: MessageContentPart[] };
```

### Anthropic format

```json
[
  {
    "type": "image",
    "source": { "type": "base64", "media_type": "image/jpeg", "data": "<base64>" }
  }
]
```

### OpenAI format

```json
[{ "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }]
```

### Vision capability gating

- Per-model `supportsVision: boolean` metadata
- Disable Send with non-vision models; show "Switch model" CTA

---

## 5) UI Design

- **Compose area**: Attachments row with thumbnails + remove "X" + size indicator
- **Conversation history**: Constrained thumbnail (max 240px wide), click for lightbox
- **Drag-drop overlay**: "Drop image to attach" when dragging files
- **Paste indicator**: Brief highlight/hint after paste

---

## 6) Edge Cases

- **Non-image paste**: Pass through as text
- **Very large images (>10MB)**: Reject with clear error
- **Animated GIFs**: Flatten to first frame via canvas
- **SVG with scripts**: Rasterize to PNG before display/transmit
- **Image persistence**: Store as `dataUrl` in conversation; migrate old `{content: string}` format

---

## 7) Error Handling

- Invalid format → inline error near attachments
- Too large → distinguish input vs compression failure
- No vision support → disable Send with clear CTA
- Network failure → keep compose state intact for retry

---

## 8) Performance

- Use `URL.createObjectURL` for instant preview; replace with processed `dataUrl` on completion
- Revoke ObjectURLs when replaced/removed
- Move `imagePipeline` to Web Worker if UI jank observed

---

## 9) Platform Considerations

- **Desktop**: Paste/drag work in webview; use PlatformBridge for preview capture
- **Web**: Clipboard via DOM `onPaste`; persistence via existing conversation storage
- Implement paste primarily via `onPaste` + `clipboardData.items`

---

## 10) Implementation Steps

1. **Data model + adapters**: `MessageContentPart[]` support; old format migration
2. **Compose attachments UI**: Thumbnails, remove, paste/drag/picker
3. **Image normalization pipeline**: Resize, compress, rasterize SVG/GIF, strip metadata
4. **Provider mapping**: Anthropic/OpenAI multimodal payloads + model capability gating
5. **"Send preview to AI"**: Viewer button → attach current preview
6. **Conversation persistence + migration**: Images in saved format
7. **Tests + QA**: Unit tests for pipeline, UI tests, manual QA matrix

**Effort estimate:** Medium (1–2d) for MVP; Large (3d+) with robust SVG sanitization + worker processing
