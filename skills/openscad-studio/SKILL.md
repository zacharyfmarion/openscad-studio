---
name: openscad-studio
description: Use this skill when working on OpenSCAD models in a repository that can be opened in OpenSCAD Studio, especially when the user wants external-agent help with rendering, diagnostics, screenshots, exports, or validation through the Studio desktop MCP server. This skill teaches the agent to edit files directly in the repo, then use OpenSCAD Studio MCP for render-oriented feedback.
license: GPL-2.0-only
metadata:
  short-description: Work with OpenSCAD Studio over MCP
---

# OpenSCAD Studio

OpenSCAD Studio is a desktop editor with a loopback-only MCP server for external agents. Use normal filesystem tools to inspect and edit project files. Use Studio MCP for workspace binding, render-target selection, diagnostics, render refreshes, 3D screenshots, and exports.

## Requirements

- OpenSCAD Studio desktop must be running.
- The local MCP server must be enabled in Studio settings. The default endpoint is `http://127.0.0.1:32123/mcp`; users can change the port in Settings > AI Assistant > External Agents.
- The MCP server is render-oriented. It does not expose file-reading or file-editing tools. Read and edit files directly in the repository with your normal agent tools.

## MCP Tools

- `get_or_create_workspace({ "folder_path": "/absolute/project/path" })`: bind this MCP session to the exact project folder. Call this before other Studio tools.
- `get_project_context()`: check the bound Studio window, workspace root, render target, window mode, and startup status.
- `set_render_target({ "file_path": "relative/path.scad" })`: choose the workspace-relative file Studio compiles and previews.
- `get_diagnostics()`: render the current target and report errors or warnings without treating compile errors as MCP transport failures.
- `trigger_render()`: render the current target, refresh the preview, and fail the tool call when render errors remain.
- `get_preview_screenshot({ "view": "isometric" })`: capture a PNG from the latest settled 3D render. Valid views are `front`, `back`, `top`, `bottom`, `left`, `right`, and `isometric`. 2D SVG previews are not supported by this screenshot tool.
- `export_file({ "format": "stl", "file_path": "exports/part.stl" })`: export the current render target to `stl`, `obj`, `amf`, `3mf`, `svg`, or `dxf`. Use an absolute output path, or a workspace-relative path when a workspace root is open.

## Workflow

1. Bind the session with `get_or_create_workspace` using the absolute repo or project folder path.
2. Use `get_project_context` to confirm the workspace and active render target.
3. Inspect and edit `.scad` files directly in the repo. Keep changes focused and preserve unrelated user edits.
4. If the wrong entry point is active, call `set_render_target` with the desired workspace-relative `.scad` path.
5. After edits, call `get_diagnostics`. Fix errors before claiming success.
6. Call `trigger_render` for final validation. For visual checks on 3D models, call `get_preview_screenshot` after a successful render.
7. Use `export_file` only after diagnostics and render validation are clean, unless the user explicitly asks to export the current failing state.

If a Studio tool reports that no workspace is bound or no render target is active, call `get_or_create_workspace` again and then set the render target.

## OpenSCAD Editing Guidance

- Prefer small, reviewable edits over full rewrites.
- Keep precise fabrication intent intact: dimensions, tolerances, coordinate systems, module boundaries, and `include`/`use` paths matter.
- Multi-file projects compile only the active render target. Supporting files are available through `include` and `use`; validate the entry point the user cares about.
- If the user provides an annotated screenshot, treat drawn circles, boxes, arrows, or marks as intentional guidance about what to inspect or change. Do not treat annotation marks as model geometry.
- When creating or refactoring user-customizable designs, place user-facing parameters as top-level literal assignments before modules/functions.
- For numeric parameters, prefer OpenSCAD customizer ranges such as `width = 60; // [40:120]` or `wall = 2.4; // [1.2:0.2:4]`.
- For option parameters, prefer dropdown syntax such as `lid_style = "snap"; // [snap, friction, screw]`.
- Group related controls with customizer tabs such as `/* [Dimensions] */` and add `// @studio {...}` metadata only for important user-facing controls.
- Prefer realistic, printable defaults and ranges.

## Reporting Back

Summarize:

- Files changed and why.
- Active render target.
- Diagnostics/render outcome.
- Screenshot or export paths when produced.
- Any remaining manual checks or Studio/MCP limitations.
