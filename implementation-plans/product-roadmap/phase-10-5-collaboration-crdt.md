# Phase 10.5: Collaboration (CRDT)

## Summary

Use **Yjs + Monaco binding + WebSocket "room" service** as MVP: real-time collaboration, presence, and shareable URLs across web and desktop. Add comments/annotations as shared Yjs data structure. Treat AI edits as atomic Yjs transactions.

## Effort Estimate

Large (3d+) — collab infra + editor integration + presence + annotations + persistence/security hardening.

## Action Plan

1. **Adopt Yjs** and integrate Monaco binding (y-monaco) so shared doc becomes source of truth.
2. Stand up **WebSocket sync service** with "room ID → shared Y.Doc" routing and Awareness support.
3. Add **share links** (`/collab/<roomId>`) and join/create UX in both web and desktop.
4. Implement **presence** (cursor/selection + user list) via Yjs Awareness.
5. Add **3D annotations** stored in same Y.Doc with world-coordinate anchors.
6. Rework **undo/redo** to use Yjs UndoManager (per-user) and define AI edits as single undoable transactions.
7. Add **persistence + hardening** (snapshots, reconnection, limits, access control).

## CRDT Selection

- **Yjs** recommended: mature ecosystem (awareness, providers, bindings), proven at scale for text editing
- **Automerge** viable but heavier for continuous text editing with Monaco
- Single canonical shared structure: `Y.Text` for editor buffer; `Y.Map`/`Y.Array` for metadata + annotations

## Sync Infrastructure

- **MVP: WebSocket star topology** using standard Yjs websocket protocol
- **Defer WebRTC**: adds signaling/NAT complexity; adopt later if E2E privacy or bandwidth becomes a driver
- If adding WebRTC later: keep app-layer identical (still Yjs), swap providers

## Monaco Binding

- Use **y-monaco** to bind Monaco model ⇄ `Y.Text`
- Presence via Awareness: `{userId, name, color, cursorRange, selectionRanges}`
- Render: remote cursor decorations + user list + typing indicators
- Single Monaco model instance per doc (rebind on reconnect, don't recreate)

## Shareable Project URLs

- Unguessable room IDs (128-bit random, base64url)
- URL: `https://app.example.com/#/collab/<roomId>` (hash routing for Cloudflare Pages)
- Optional params: `?name=…`, `?token=…`
- "Copy invite link" button + "Join by link" flow

## 3D Model Comments

- Stored in same Y.Doc: `Y.Array<Comment>` or `Y.Map<id, Comment>`
- Comment schema:
  - `id`, `authorId`, `createdAt`, `text`, `status` (open/resolved)
  - `anchor`: `{type:"world", position:[x,y,z], normal?:[x,y,z], camera?:{pos,target,up}}`
  - Optional context: `{codeHash?, selectionRange?, moduleName?}`
- UI: "Add comment" mode → click in 3D view (raycast pick) → store world coords → show marker + thread panel
- If model changes and point no longer on geometry: keep marker, flag as "outdated anchor", allow re-pin

## Backend Requirements

- WebSocket room service: Yjs doc update relay + Awareness relay + optional persistence
- Scaling: each room handled by one logical owner
- Persistence: ephemeral rooms (fastest MVP) or room snapshots (periodic + on-idle) in durable storage

## Conflict Resolution

- Yjs provides **strong convergence** (all replicas reach same state given same updates)
- No manual merge logic needed
- Undo/redo: replace local `useHistory.ts` with **Yjs UndoManager** — "undo" affects only local user's operations

## AI Agent Interaction

- AI changes as **atomic CRDT transactions** applied to shared `Y.Text`, never "set full text"
- Flow:
  1. Snapshot current text (from Yjs) for AI
  2. AI produces `old_string → new_string`
  3. Validate uniqueness against current shared text
  4. Apply as one Yjs transaction with origin `"ai"`
  5. Broadcast as normal Yjs updates
- If compile validation must remain desktop-only: run locally and only commit on success

## Presence

- Yjs Awareness stores: `userId`, `displayName`, `color`, `cursor/selection`, `lastActiveAt`
- UI: colored cursor + name tag in editor; top bar "N collaborators" + dropdown; idle/active indicator

## Session Management

- **Creating**: generate roomId, connect provider, initialize doc metadata
- **Joining**: parse URL → connect → wait for initial sync → bind Monaco
- **Leaving**: disconnect provider, clear awareness, keep local doc (fast rejoin) or drop

## Persistence

- Offline-first: keep local state in memory; optionally IndexedDB for web refresh resilience
- Server persistence: doc updates or periodic snapshots; retention/TTL for inactive rooms
- Export: download `.scad` + optional annotations JSON as non-collab escape hatch

## Platform Integration

- Collaboration logic in shared TS module used by both builds
- Web + Desktop connect to same hosted sync service
- Optional "local-only collaborative session" later

## Security

- MVP: unguessable room IDs (capability URLs); optional room password
- Transport: WSS/TLS always
- E2E encryption later: WebRTC provider or application-layer encryption of Yjs updates

## Performance

- Binary Yjs updates; avoid full text except initial load
- Throttle presence updates more aggressively than text
- Large docs: lazy-load annotations panel; snapshot compression; "max room doc size" guardrails

## Error Handling

- Provider states: `connecting/connected/disconnected/reconnecting`
- On reconnect: re-announce awareness, rebind Monaco decorations, show banner
- Divergence: "reload from room" + "export local copy" recovery actions

## Edge Cases

- **Many users**: cap awareness payload, soft-limit room participants for MVP
- **Conflicting AI edits**: if `old_string` no longer matches, fail gracefully; ask user to re-run
- **Undo**: AI-origin transactions undoable by requesting user but not by others
- **Outdated annotations**: keep markers, flag as outdated, allow re-pin

## Infrastructure Costs

- Cost drivers: concurrent WebSocket connections + egress bandwidth + persistence storage
- Start with single region/service instance
- Control knobs: TTL inactive rooms, max room size, max participants, snapshot interval
