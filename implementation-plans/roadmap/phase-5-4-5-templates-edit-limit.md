# AI Prompt Templates + Configurable Edit Size Limit — Implementation Plan

---

# Feature 1: AI Prompt Templates (5.4)

## 1) Template Categories + Built-in Templates

### Generate (5 templates)

- **gen-basic-shape**: "Create an OpenSCAD model for: {{shape_description}}..."
- **gen-from-dimensions**: "Generate OpenSCAD code for an object with these dimensions..."
- **gen-with-tolerances**: "Design for {{part_goal}} with {{process}} tolerances..."
- **gen-assembly**: "Create an assembly consisting of: {{assembly_description}}..."
- **gen-from-reference**: "Generate matching this reference: {{reference_description}}..."

### Fix (5 templates)

- **fix-errors**: "Fix compile errors" (auto-includes {{code}})
- **fix-manifold**: "Fix non-manifold / printability issues"
- **fix-performance**: "Optimize for faster preview/render"
- **fix-alignment**: "Fix misalignment so that: {{alignment_goal}}"
- **fix-parametrics**: "Fix parametric behavior so that: {{parametric_goal}}"

### Modify (5 templates)

- **mod-add-feature**: "Add feature: {{feature_description}}"
- **mod-change-dimensions**: "Update to: {{new_dimensions}}"
- **mod-cutouts-holes**: "Add cutouts/holes: {{cutout_description}}"
- **mod-refactor**: "Refactor for readability (no geometry changes)"
- **mod-local-edit**: "Modify only selected region: {{change_request}}"

### Explain (5 templates)

- **exp-walkthrough**: "Explain how it works (parameters, modules, flow)"
- **exp-dimensions**: "Extract key dimensions and relationships"
- **exp-debug**: "Explain likely cause of: {{visual_issue_description}}"
- **exp-best-params**: "Suggest good defaults for: {{use_case}}"
- **exp-transform-map**: "Explain coordinate system + transforms"

---

## 2) Template Data Model

```ts
interface AiPromptTemplate {
  id: string; // e.g., "gen-basic-shape"
  category: 'generate' | 'fix' | 'modify' | 'explain';
  title: string;
  description: string;
  prompt: string; // with {{variable}} placeholders
  variables?: Array<{
    name: string;
    label: string;
    helpText?: string;
    placeholder?: string;
    required?: boolean;
    defaultValue?: string;
    source?: 'user' | 'currentFile' | 'selection'; // auto-fill source
    multiline?: boolean;
  }>;
  tags?: string[];
}
```

**Storage**: `assets/ai/promptTemplates.json` (built-ins, read-only). Future custom templates in `settingsStore`.

---

## 3) UI Design

### Access points

- **Templates button** in AiPromptPanel near textarea (opens popover)
- **"/" command**: typing `/` at start of textarea opens picker with search

### Template picker

- Categorized tabs: Generate / Fix / Modify / Explain
- Search input (filters by title, description, tags)
- List + preview split (left: rows, right: full prompt preview)
- Insert button (and double-click row)

### Insert behavior

- Resolved prompt text into textarea (never auto-send)
- If textarea has content: Replace / Append / Insert at cursor

---

## 4) Variable Templates

- Support `{{varName}}` placeholders with `variables[]` definition
- Context variables via `source`: `currentFile` → editor buffer, `selection` → current selection
- Unresolved required variables block insertion

---

## 5) UX Flow

1. Click Templates (or type `/`)
2. Select category or search
3. Click template → preview shows
4. Fill variables (some auto-fill from selection/current file)
5. Choose Replace/Append/Insert-at-cursor
6. Edit in textarea
7. Send

---

## 6) Edge Cases

- **Template with `{{code}}`**: Inject buffer; if huge, truncate (first N + last M lines)
- **Template while streaming**: Keep picker usable; disable Send; allow draft editing

---

## 7) Extensibility

- User-created templates via Settings (future)
- Community templates via optional remote pack (future)

---

# Feature 2: Configurable Edit Size Limit (5.5)

## 1) Setting Design

- Location: **Settings → AI → Safety**
- Setting: **"Max AI edit size (lines)"**
- Default: **120**
- Allowed range: **20–400** (step 10), clamped on save and read

## 2) Implementation

### Desktop (Rust)

- Replace hardcoded 120 in `validate_edit()` with Tauri store read + clamp
- Error message includes: measured edit size, configured limit, suggestion to adjust

### Web (TypeScript)

- `maxAiEditLines` in Zustand settingsStore with localStorage persistence
- Same clamp logic and error wording

## 3) UX

- Warning at >200: "Higher limits increase risk of accidental large rewrites"
- Help text explaining tradeoffs

## 4) Edge Cases

- Changed mid-conversation: apply new limit at validation time
- Non-integer/null/extreme: round, clamp, or revert to default

---

# Combined Implementation Steps

1. Add `maxAiEditLines` setting + persistence (Zustand + SettingsDialog)
2. Implement clamping utility (shared constants) + unit tests
3. Desktop Rust: read setting during validation, replace hardcoded 120
4. Web TS: wire validation to settingsStore
5. Add prompt template catalog (JSON + types) + picker UI
6. Variable fill + insertion rules + currentFile/selection handling
7. Streaming-state behavior + smoke tests

**Effort estimate:** Medium (1–2d) if UI patterns exist; Large (3d+) if settings plumbing needs unification
