# Multi-File Project Context for AI Copilot — Implementation Plan

## 1) Overview

Multi-file context lets the copilot "see" the actual program the renderer sees: modules/functions brought in via `use`, and full inlined code from `include`. This prevents hallucinated modules, improves diagnostics triage, and enables accurate cross-file edits.

---

## 2) Use/Include Parsing

### Recommended: Regex-based with comment/string awareness

- Recognize: `use <path.scad>`, `include <path.scad>` (with optional whitespace and `;`)
- Ignore inside: line comments, block comments, strings
- Small tokenizer with states: `NORMAL`, `LINE_COMMENT`, `BLOCK_COMMENT`, `STRING_DOUBLE`, `STRING_SINGLE`

### Recursive resolution

- Parse directives → resolve files → parse those → repeat
- Track edges with directive kind: `A --use--> B`, `A --include--> C`
- Stop on: unresolvable files, already-visited files (cycles)

### Circular dependency detection

- `visited: HashSet<NormalizedPath>` + `stack: Vec<NormalizedPath>` (DFS)
- On cycle: record chain, don't recurse further

### Path resolution order

1. Absolute paths: allow only within project root or whitelisted library paths
2. Relative paths: resolve against including file's directory first
3. Configured library directories (project root, user-configured paths)

### Path sandboxing

- Normalize paths, resolve symlinks (desktop)
- Only allow reading within `project_root` or whitelisted library paths
- Block path escapes including via symlinks

---

## 3) Context Building

### Format

````text
## Project Context (auto)
Active file: /project/main.scad
Dependency graph:
- main.scad
  - include: parts/base.scad (resolved)
  - use: lib/fasteners.scad (resolved)

### [ACTIVE] main.scad
```scad
...full content...
````

### [USE] lib/fasteners.scad (summary)

- modules: bolt(d=, l=), nut(m=)

````

### Token budget management
- `max_context_chars` with rough token estimate (chars/4)
- Active file always full; direct deps next, then transitive
- Prefer `include` over `use` when budget tight
- Oversized files → structural summary (signatures + first N lines)

### Priority ordering
Active file > direct include > direct use > transitive include > transitive use

---

## 4) New AI Tool: `explore_project`

```ts
explore_project({ root?: string, max_depth?: number, include_globs?: string[], max_entries?: number })
````

- Returns metadata only: relative path, type (file/dir), size in bytes
- Default globs: `["**/*.scad", "**/*.stl", "**/*.dxf", "**/*.svg"]`
- Default excludes: `["**/node_modules/**", "**/.git/**"]`
- Max entries: 500

---

## 5) AI Editing Across Files

### Recommended: Yes, with `file_path` parameter on `apply_edit`

- `apply_edit({ file_path?: string, old_string, new_string, rationale })`
- Default: active file (backward compatible)
- Same validations: unique match, ≤120 lines, compile check, rollback
- Auto-open edited files in new tabs with "Changed by AI" badge

---

## 6) UX Considerations

- **Context indicator**: "Project context: ON (N files, ~X tokens)" with details popover
- **Context files list**: Collapsible, grouped by depth, with badges (include/use/summary/unresolved)
- **Opt-out**: Toggle for auto-load, max context size presets
- **"Explore project" button**: Triggers tool call from AI panel

---

## 7) Edge Cases

- **Files that don't exist**: Mark unresolved; include directive location
- **Files outside project**: Block by default; allow via whitelist
- **Binary files**: Never include contents; show metadata only
- **Very large files (>10K lines)**: Structural summary only
- **Symlinks**: Resolve real path; prevent escape
- **Web VFS**: Resolution within wasm FS namespace only

---

## 8) Performance

- Read only dependency files, not whole tree
- Cap recursion depth (10) and max files (50–200)
- Cache layers: raw text, parsed directives, summaries
- Invalidate on file change events or editor save

---

## 9) Error Handling

- **File not found**: Record unresolved; include which file referenced it
- **Permission denied**: Record blocked; surface to user
- **Encoding issues**: Don't include contents; mark as unreadable

All errors visible in AI context block and UI context list.

---

## 10) Platform Considerations

- **Desktop**: `FileSystemService` for reads; canonicalization + root sandboxing
- **Web**: VFS directory APIs; POSIX-like normalization; only mounted/imported files accessible

---

## 11) Implementation Steps

1. **Dependency graph + context injection** (scanner, resolver, cycle detection, sandboxing)
2. **Token/size budgeter + summaries** (budget presets, structural summarizer)
3. **`explore_project` tool** (FileSystemService-based, bounded listing)
4. **Cross-file edits** (extend `apply_edit` with `file_path`, compile/rollback)
5. **UX and settings** (context indicator, file list, opt-out toggles)
6. **Integration fixtures** (simple include, use-only, mixed, cycle, large file)

**Effort estimate:** Medium (1–2d) for read-only context; Large (3d+) with cross-file edits + UI polish
