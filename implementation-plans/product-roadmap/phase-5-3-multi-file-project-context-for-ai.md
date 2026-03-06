# Phase 5.3: Multi-File Project Context for AI

## Summary

Implement a Referenced Files Context Builder that reuses the existing include/use resolver to assemble a bounded, structured "project context" block (active file + resolved dependency closure) and inject it into the AI system prompt. Add a tightly sandboxed `explore_project` tool for on-demand discovery.

## Effort Estimate

Large (3+ days)

## Action Plan

1. Extract/reuse resolution logic from v0.7.1 into a shared service callable by both render and AI context building.
2. Build multi-file context payload: given `activeFile + working_dir`, compute dependency closure, read contents via `PlatformBridge`, produce prompt-ready structure with truncation markers.
3. Extend system prompt: inject structured multi-file context block with active file clearly marked, enforce token/size budgets.
4. Add `explore_project` tool: sandboxed file lister with depth/entry limits and strong path validation.
5. Enable AI edit targeting: extend edit tool to accept `target_path` with same compile/rollback safeguards.
6. Cache + refresh policy: cache resolved graphs by `(path, mtime/hash)`, refresh on tab switch and save.
7. Test + UX transparency: fixtures for multi-file projects, UI showing "AI context files."

## System Prompt Format

````
## Project Context (auto)
Active file: <relpath>
Resolved dependencies (in order): [...]

### FILE <relpath> (source=active|include|use, bytes=X, truncated=Y)
```fenced code with line numbers```
... <TRUNCATED head/tail> ...
````

Budget caps: max files (10–20), max chars per file, max total chars. Active file always included first.

## `explore_project` Tool Design

- **Input params**: `root?`, `max_depth?` (default 3), `include_globs?` (default `["**/*.scad"]`), `exclude_globs?`, `max_entries?` (default 200)
- **Output**: header with root/depth/counts + list of `{ path, type, size_bytes }` sorted lexicographically
- **Limits**: max depth, max entries, max output bytes; never follow symlinks outside root

## AI Edit Targeting

- Extend edit tool with `target_path?: string` (default active file)
- Apply edits against web in-memory file map or desktop Tauri filesystem (restricted to project root)
- Same safety loop: apply → compile check → rollback on new errors

## Security

- Project "root" sandbox: any path must resolve within `working_dir` or approved library roots
- Deny absolute paths, `..` traversal, symlinks escaping root (desktop)

## Edge Cases

- Deep nests: enforce max include depth, report cutoff
- Very large libs (BOSL2): truncation + omit list; optionally include symbol skim
- Binary/non-UTF8: detect null bytes, omit content and report
- Circular includes: detect via visited set, stop and report cycle path
