# Phase 5.4: AI Prompt Templates

## Summary

Implement prompt templates as a versioned JSON resource loaded via the existing themes-style resource loader into a small Zustand store, then expose them through a lightweight picker (button) plus an inline `/` command palette in the AI prompt textarea.

## Effort Estimate

Medium (1–2 days)

## Action Plan

1. Define schema + validation: `prompt-templates.schema.json` and runtime type-guard.
2. Add resource + loader: Store `prompt-templates.json` alongside theme resources; cache in Zustand store.
3. Build picker UI: "Templates" button in `AiPromptPanel.tsx` opening modal/popover with categories, search, list, preview.
4. Add variable-fill flow: For templates with variables, show compact form before insertion.
5. Implement injection: Insert into prompt textarea at cursor/selection with sensible merge rules.
6. Add `/` command palette: Inline palette for `/templates`, `/generate`, `/fix`, `/modify`, `/explain`.
7. Test + a11y: Unit tests for parsing/injection/validation + Playwright E2E + ARIA roles/labels.

## Template Data Model

```json
{
  "version": 1,
  "templates": [
    {
      "id": "generate.parametric_enclosure",
      "category": "generate",
      "title": "Create a parametric enclosure",
      "description": "Generates a printable enclosure with configurable dimensions.",
      "prompt": "Create an OpenSCAD parametric enclosure...\nOuter size: {{outer_x}}x{{outer_y}}x{{outer_z}} mm",
      "variables": [
        {
          "key": "outer_x",
          "label": "Outer X (mm)",
          "type": "number",
          "default": 80,
          "min": 1,
          "max": 500
        }
      ],
      "tags": ["enclosure", "parametric", "3d-printing"]
    }
  ]
}
```

Variable types: `string | number | boolean | enum`

## Categories

- **Generate**: "Create a parametric enclosure", "Design a gear with N teeth"
- **Fix**: "Fix compilation errors", "Optimize for 3D printing"
- **Modify**: "Add fillets to all edges", "Make this parametric", "Add mounting holes"
- **Explain**: "Explain this code", "What does this module do?"

## `/` Command System

- `/templates` → open picker
- `/generate`, `/fix`, `/modify`, `/explain` → open picker pre-filtered
- `/t <query>` → quick search
- Trigger: when current token matches `^/[\w-]*$` at start-of-line or after whitespace

## Injection Rules

- If user has selection → replace selection with template text
- Otherwise insert at cursor; prefix with `\n\n` if existing text and not at line start
- After insertion: focus textarea, cursor at first placeholder location or end
