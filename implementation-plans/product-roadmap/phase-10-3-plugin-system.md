# Phase 10.3: Plugin System

## Summary

Implement plugins as **packaged JS/TS bundles** executed in a **per-plugin Web Worker (logic)** plus optional **sandboxed iframe (UI)**, exposed through a **capability-based host API**. Ship internal-only first, stabilize API, then open community registry.

## Effort Estimate

Large (3d+) for safe end-to-end system (desktop + web + registry MVP).

## Action Plan

1. **Define plugin contract**: manifest schema, entrypoints (worker/ui), lifecycle, permissions → TypeScript types + JSON Schema.
2. **Build host runtime** (React): plugin manager, worker/iframe sandbox, message bridge, capability gating, timeouts, crash recovery.
3. **Integrate plugin types**: exporters + UI panels first, then Monaco extensions, then AI tools.
4. **Desktop bridge (Rust)**: plugin discovery/install, signature verification, request/response channel for plugin-provided AI tools/exporters.
5. **Packaging + install/update**: `.zip` bundles, local directory installs, enable/disable, version checks.
6. **Registry MVP**: static signed index + in-app marketplace UI.
7. **Hardening**: permission UX, resource limits, telemetry/logs, CI validations.

## Plugin Architecture

- Each plugin = package (manifest + assets) + runtime instances:
  - **Worker runtime** (mandatory): executes tools/exporters/extensions logic
  - **UI runtime** (optional): sandboxed iframe for panels/settings UI
- All host interactions via `postMessage` (worker/iframe) → host → (optional) Rust

## Lifecycle

- `discovered → installed → enabled → started → stopped/disabled → uninstalled`
- Runtime hooks: `onActivate(context)`, `onDeactivate()`
- Registration calls: `registerTool`, `registerExporter`, `registerPanel`, `registerMonacoExtension`

## Plugin Types

- **AI Tools**: tool schema + handler returning structured JSON/string
- **Exporters**: convert model/editor state → bytes/text + filename/MIME
- **UI Panels**: dockview panel hosting plugin iframe with bridge
- **Editor Extensions** (Monaco): completions, hover, formatting, code actions, snippets, commands

## Manifest Format (`plugin.json`)

```json
{
  "schemaVersion": "1.0",
  "id": "com.example.my-plugin",
  "name": "My Plugin",
  "version": "1.2.3",
  "compatibility": { "app": ">=10.3.0 <11.0.0", "api": ">=1.0.0 <2.0.0" },
  "entrypoints": { "worker": "dist/worker.js", "ui": "dist/ui/index.html" },
  "contributions": {
    "tools": [{ "name": "optimizeModel", "title": "Optimize model", "inputSchema": {} }],
    "exporters": [{ "format": "myfmt", "label": "My Format", "mime": "application/octet-stream" }],
    "panels": [{ "id": "myPanel", "title": "My Panel", "icon": "cube" }],
    "monaco": { "languages": ["openscad"], "features": ["completion", "hover"] }
  },
  "permissions": [
    "editor.read",
    "editor.write",
    "export.generate",
    "ai.tools.register",
    "settings.read"
  ],
  "signing": { "publisher": "Example Co", "signature": "base64...", "algo": "ed25519" }
}
```

## Plugin Loading

- **Desktop**: scan `<AppData>/OpenSCADStudio/plugins/*/plugin.json` + bundled/internal plugins
- **Web**: user-installed plugins from IndexedDB
- Validate: manifest schema, `id` uniqueness, semver, compatibility, entrypoint existence, permissions, signature
- Initialize: create worker from plugin JS (Blob URL); send `activate` with granted capabilities

## API Design (Capability-Gated)

- `editor`: `getText()`, `setText(edits)`, `getSelection()`, `applyEdits(changes)`
- `renderer`: `triggerPreviewRender()`, `getLastPreviewMetadata()`
- `export`: `requestExportContext()` → return bytes/text
- `settings`: namespaced KV store
- `ui`: register commands/menus, show notifications, open panel
- `ai`: register AI tools (definition only)
- `net` (optional, default-off): fetch with allowlisted domains

## Sandboxing

- Worker: no DOM access; terminate/restartable; isolated global scope
- UI iframe: `sandbox` without `allow-same-origin`; communicate only via postMessage
- Capabilities are concrete objects passed at activation; if revoked, host restarts plugin

## Plugin UI

- Dockview panel renders iframe to plugin UI entry
- Bridge script: plugin posts `{type:"request", id, method, params}`, host replies `{type:"response", id, result|error}`
- Theming: host sends CSS variables + dark/light + font tokens

## Language Support

- Phase 10.3: JS/TS only (bundled output is JS)
- Later: WASM as additional worker payload for heavy computation

## Community Registry

- Static signed `registry.json` on GitHub Pages / release assets
- Entries: plugin package URLs + checksums + signature metadata
- Submission: PR to registry repo + automated validation + human review

## Plugin Installation

- Marketplace: browse registry → install → permission prompt → enable
- Manual: "Install from file (.zip)" on desktop; "Import plugin package" on web
- No plugin-to-plugin dependencies for MVP

## Cross-Platform

- Single packaging format + runtime model (worker/iframe)
- Desktop adds extra capabilities; plugins tolerate "capability missing" (web)
- Manifest: `"platforms": ["desktop", "web"]`

## Error Handling

- Worker crash: mark "faulted", show error UI, allow restart with backoff
- Infinite loop: per-request timeout; terminate worker on exceed
- Permission violation: `E_PERMISSION_DENIED` with missing permission listed

## Edge Cases

- Tool name collisions: namespace as `plugin.<id>.<toolName>`
- Version incompatibility: hard block on install/enable if API/app range doesn't match
- Stale plugins: show warnings after major upgrade; keep disabled by default

## Testing

- Plugin SDK: types + helper + test harness with mocked host APIs
- App CI: manifest validation, permission gating, worker lifecycle + timeouts
- Integration: install → enable → run exporter/tool → disable → uninstall

## Security

- Require signatures for registry-distributed plugins
- Publisher identity: registry maintains public keys and reputation
- Strict capability model; worker termination/timeouts; network default-off

## Phased Rollout

1. Internal plugins (dogfood): plugin manager + worker runtime + exporters + panels
2. API stabilization: freeze `apiVersion 1.x`, compatibility checks, permission UX
3. AI tools integration: namespaced tool defs + Rust↔frontend bridge
4. Community beta registry: signed index, marketplace UI, submissions + CI validation
5. General availability: security hardening, publisher program, documentation
