# Phase 10.2: Offline LLM

## Summary

Use **llama.cpp's `llama-server` as a Tauri sidecar** and treat it as a third "provider" behind `PlatformBridge`, reusing existing OpenAI/Vercel AI SDK-shaped streaming + tool loop. Ship MVP with local chat + streaming + model download/management, then add tool-calling hardening and fine-tuned model.

## Effort Estimate

Large (3d+) for production-quality (realistically 2–6 weeks for GPU support + fine-tune); Medium (1–2d) for desktop-only MVP (CPU-only, single model).

## Action Plan

1. **Provider plumbing**: Add `LocalLlamaCppProvider` under `PlatformBridge`; start/stop sidecar, health-check, route chat requests.
2. **Sidecar packaging**: CI builds for `llama-server` (macOS universal, Windows x64, Linux x64); bundle as Tauri sidecar.
3. **Model manager MVP**: Manifest-driven download UI (sizes + quantization), resumable downloads, checksum verification, models screen.
4. **Streaming compatibility**: Normalize llama.cpp SSE tokens into same streaming event shape as Vercel AI SDK.
5. **Tool calling**: Start with JSON parsing; harden with llama.cpp grammar-constrained JSON for tool-call envelopes.
6. **Offline mode**: Explicit toggle forcing local provider, blocking network AI, indicating state via banner.
7. **Fine-tune track**: Build dataset + eval harness first, then LoRA/QLoRA fine-tune, export merged GGUF variants.

## llama.cpp Integration

- Use `llama-server` (HTTP API + SSE streaming); bind to `127.0.0.1` on ephemeral port
- Build matrix: `cpu` baseline everywhere; optional `metal` (macOS), `cuda` (Windows/Linux) as separate artifacts
- Tauri: spawn sidecar from Rust, capture stdout/stderr, `/health` polling + graceful shutdown

## Model Format

- Standardize on GGUF only
- Manifest records: `model_id`, `display_name`, `arch`, `ctx_len`, `quant`, `size_bytes`, `sha256`, `license`, `recommended_ram`
- Defaults: Q4_K_M (fast/smaller), Q8_0 (higher quality/larger)
- Practical guidance: "7B–8B Q4 ≈ usable on 16GB RAM; Q8 often needs 24–32GB"

## Model Download UI

- Manifest-driven picker with total size, disk required, "recommended for your machine" badge
- Downloads: resumable (HTTP range), progress bar + speed + ETA, pause/cancel
- Verify sha256 post-download before marking "Installed"
- Storage: Tauri AppData under `models/`; optional "change model directory"

## Model Management

- Installed list: size, quant, last-used, "Set active" button; delete removes partial downloads + cache
- Switching: stop sidecar, restart with new `--model` path; "warming up" state in chat UI
- Keep conversation histories provider-specific

## API Compatibility

- Expose llama.cpp as "OpenAI-compatible base URL" behind `PlatformBridge`
- Normalize responses into internal stream event contract: `{type: text_delta | tool_call | tool_result | error | done}`

## Tool Calling

- Assume tool calling not reliably supported across local instruct models
- Require model to emit strict JSON envelope: `{ "tool": "apply_edit", "arguments": {...}}`
- Enforce JSON via llama.cpp grammar (GBNF) or "JSON-only" mode
- Fallback: degrade to text-only assistant

## Streaming

- Consume SSE in Rust, convert token deltas to frontend stream events
- Ensure cancellation propagates (user cancel → abort HTTP + interrupt sidecar)
- Handle partial UTF-8/token boundaries; throttle UI updates (~30–50ms)

## Performance

- Use mmap model loading; keep process warm between requests
- Runtime knobs: threads, context size, GPU layers with conservative defaults + "Auto" mode
- UX truth: "First response may take 5–30s on CPU; subsequent faster once warmed"

## Offline Mode

- Toggle does two things: force local provider selection + block network AI calls
- UI: persistent "Offline" indicator near model selector + tooltip
- Clear capability caveats

## Fine-Tuning Strategy

- Base: 7B–8B instruct model
- Data: OpenSCAD examples + docs + GitHub repos; instruction pairs (prompt → snippet); bugfix pairs
- Eval: OpenSCAD compile success, lint heuristics, golden-image render diffs
- Train: LoRA/QLoRA; export merged GGUF variants; add to manifest

## System Requirements

- Publish minimums per quant in model picker
- GPU: Metal on macOS (first accelerator target), CUDA as advanced/optional
- Always support CPU-only as safe fallback

## Web Version

- Default: web doesn't ship offline LLM (download size + memory + performance)
- Optional: separate "Web experimental" path using WebGPU/WebLLM with tiny (1–3B) models, clearly labeled

## Error Handling

- Detect: missing model file, checksum mismatch, insufficient RAM, sidecar start failure, inference OOM
- Recovery: "Re-verify model", "Re-download", "Switch to smaller quant", "Switch to Cloud"

## Edge Cases

- Switching model mid-conversation: start new conversation or add visible divider
- Disk space: check required bytes before download; handle partial downloads and cleanup

## Security

- Require sha256 verification for every download
- Only load models from managed directory unless user enables "custom path"
- Checksums in signed/embedded manifest shipped with app

## UX (Managing Expectations)

- Bake into model picker: "Local = private/offline, but slower and sometimes less accurate than cloud"
- Quick recommendation: Q4 for most users; Q8 for high-quality on high-RAM machines
