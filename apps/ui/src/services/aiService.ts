import { tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { eventBus, historyService } from '../platform';
import { RenderService } from './renderService';
import { captureOffscreen, type CaptureOptions } from './offscreenRenderer';
import type { PreviewSceneStyle } from './previewSceneConfig';
import type { AiProvider } from '../stores/apiKeyStore';

export interface AiToolCallbacks {
  getCurrentCode: () => string;
  captureCurrentView: () => Promise<string | null>;
  getStlBlobUrl: () => string | null;
  getPreviewSceneStyle: () => PreviewSceneStyle;
  hasProjectFileAccess: () => boolean;
  getCurrentFileRelativePath: () => string | null;
  listProjectFiles: () => Promise<string[] | null>;
  readProjectFile: (path: string) => Promise<string | null>;
}

const PROJECT_FILE_ACCESS_UNAVAILABLE_MESSAGE =
  'Project file browsing is unavailable in web mode or for unsaved files. Save the file to disk in the desktop app to let the AI inspect sibling project files.';

export const SYSTEM_PROMPT = `## OpenSCAD AI Assistant

You are an expert OpenSCAD assistant helping users design and modify 3D models. You have access to tools that let you see the current code, view the rendered preview, and make targeted code changes.

### Your Capabilities:
- **View code**: Use \`get_current_code\` to see what you're working with
- **Browse project files**: Use \`list_project_files\` to see all .scad files under the current file's directory on desktop
- **Read any file**: Use \`read_file\` to read any .scad file in that desktop project tree (for understanding includes/uses)
- **See the design**: Use \`get_preview_screenshot\` to see the rendered output
- **Check for errors**: Use \`get_diagnostics\` to check compilation errors and warnings
- **Make changes**: Use \`apply_edit\` to modify the code with exact string replacement
- **Update preview**: Use \`trigger_render\` to manually refresh the preview

### Critical Rules for Editing:
1. **ALWAYS use exact string replacement**: Never output full file replacements. Use \`apply_edit\` with exact substrings.
2. **Provide exact substrings**: The \`old_string\` must match exactly (including whitespace and indentation) and must be unique in the file.
3. **Keep changes small**: Maximum 120 lines changed per edit. Break large changes into multiple steps.
4. **Automatic validation**: \`apply_edit\` validates the edit and test-compiles the code before applying. If validation fails, the error will be returned and no changes are made.
5. **Include context**: Make the \`old_string\` large enough to be unique - include surrounding lines if needed.

### Recommended Workflow:
1. Start by calling \`get_current_code\` to understand what exists
2. Optionally use \`get_preview_screenshot\` to see the rendered output
3. For fixes, use \`get_diagnostics\` to see what errors exist
4. Use \`apply_edit\` with the exact old text, new replacement, and a rationale explaining the change
5. The preview updates automatically after successful edits

### OpenSCAD Quick Reference:

**3D Primitives:**
- \`cube([x, y, z]);\` or \`cube(size);\`
- \`sphere(r);\` or \`sphere(d);\`
- \`cylinder(h, r1, r2);\` or \`cylinder(h, d1, d2);\`

**2D Primitives:**
- \`circle(r);\` or \`circle(d);\`
- \`square([x, y]);\` or \`square(size);\`
- \`polygon(points);\`

**Transformations:**
- \`translate([x, y, z]) { ... }\`
- \`rotate([rx, ry, rz]) { ... }\`
- \`scale([sx, sy, sz]) { ... }\`
- \`mirror([x, y, z]) { ... }\`

**Boolean Operations:**
- \`union() { ... }\` - combines objects (default)
- \`difference() { ... }\` - subtracts subsequent objects from first
- \`intersection() { ... }\` - keeps only overlapping parts

**2D to 3D:**
- \`linear_extrude(height) { ... }\`
- \`rotate_extrude(angle) { ... }\`

**Modifiers:**
- \`#\` - debug (show in transparent red)
- \`%\` - background (show transparently)
- \`*\` - disable (don't render)
- \`!\` - show only this

**Control Structures:**
- \`for (i = [start:end]) { ... }\`
- \`if (condition) { ... }\`
- Variables: \`x = 10;\`
- Functions: \`function name(params) = expression;\`

### Customizer-Friendly Output:
- When creating or refactoring a design for end-user customization, expose user-facing parameters as top-level literal assignments before modules/functions.
- For numeric user-facing parameters, prefer OpenSCAD customizer ranges:
  - \`width = 60; // [40:120]\`
  - \`wall = 2.4; // [1.2:0.2:4]\`
- For enumerated options, prefer dropdown syntax:
  - \`lid_style = "snap"; // [snap, friction, screw]\`
- Group related controls with customizer tabs when helpful:
  - \`/* [Dimensions] */\`
  - \`/* [Options] */\`
- Add optional OpenSCAD Studio presentation metadata immediately above important user-facing parameters:
  - \`// @studio {"label":"Width","description":"Overall outer width","unit":"mm","group":"Body","prominence":"primary"}\`
- Use \`@studio\` metadata only for user-facing controls, not derived/internal variables.
- Prefer realistic 3D-printing-safe defaults, ranges, and steps.
`;

export function createModel(provider: AiProvider, apiKey: string, modelId: string) {
  if (provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey,
      headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    });
    return anthropic(modelId);
  }
  const openai = createOpenAI({ apiKey });
  return openai(modelId);
}

export function buildTools(callbacks: AiToolCallbacks) {
  return {
    get_current_code: tool({
      description: 'Get the current OpenSCAD code from the editor',
      inputSchema: z.object({}),
      execute: async () => {
        return callbacks.getCurrentCode();
      },
    }),

    list_project_files: tool({
      description:
        "List all .scad files under the current file's directory on desktop. Returns relative file paths. Unavailable in web mode or for unsaved files.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!callbacks.hasProjectFileAccess()) {
          return PROJECT_FILE_ACCESS_UNAVAILABLE_MESSAGE;
        }

        const paths = await callbacks.listProjectFiles();
        if (!paths || paths.length === 0) {
          return 'No project files found in the current working directory.';
        }
        return `Project files (${paths.length}):\n${paths.map((p) => `  ${p}`).join('\n')}`;
      },
    }),

    read_file: tool({
      description:
        "Read the contents of a .scad file from the current file's directory tree on desktop. Use the relative path as shown by list_project_files.",
      inputSchema: z.object({
        path: z
          .string()
          .describe('Relative path to the file (e.g. "parts.scad" or "lib/utils.scad")'),
      }),
      execute: async ({ path }) => {
        if (!callbacks.hasProjectFileAccess()) {
          return `❌ Unable to read file: ${path}\n\n${PROJECT_FILE_ACCESS_UNAVAILABLE_MESSAGE}`;
        }

        const currentFilePath = callbacks.getCurrentFileRelativePath();
        if (currentFilePath && path === currentFilePath) {
          return callbacks.getCurrentCode();
        }

        const content = await callbacks.readProjectFile(path);
        if (content === null) {
          const available = await callbacks.listProjectFiles();
          if (!available || available.length === 0) {
            return `❌ File not found: ${path}\n\nNo project files are available in the current working directory.`;
          }
          return `❌ File not found: ${path}\n\nAvailable files:\n${available.map((p) => `  ${p}`).join('\n')}`;
        }
        return content;
      },
    }),

    get_preview_screenshot: tool({
      description:
        'Capture a screenshot of the 3D/2D preview as a PNG image. Use the view parameter to see the model from different angles.',
      inputSchema: z.object({
        view: z
          .enum(['current', 'front', 'back', 'top', 'bottom', 'left', 'right', 'isometric'])
          .optional()
          .default('current')
          .describe(
            'Camera angle. "current" captures what the user sees. Named views render from that direction.'
          ),
        azimuth: z
          .number()
          .optional()
          .describe('Custom azimuth in degrees (0=front, 90=right). Overrides view if set.'),
        elevation: z
          .number()
          .optional()
          .describe('Custom elevation in degrees (0=level, 90=top-down). Overrides view if set.'),
      }),
      execute: async ({ view, azimuth, elevation }) => {
        const useOffscreen = view !== 'current' || azimuth !== undefined || elevation !== undefined;

        if (!useOffscreen) {
          const dataUrl = await callbacks.captureCurrentView();
          if (dataUrl) {
            return { image_data_url: dataUrl };
          }
          return {
            error:
              'No preview available. The code may not have been rendered yet, or the preview panel is not visible.',
          };
        }

        const stlUrl = callbacks.getStlBlobUrl();
        if (!stlUrl) {
          return {
            error:
              'No 3D model available for angle-specific views. Render the code first, or use view="current" to capture the 2D SVG preview.',
          };
        }

        try {
          const opts: CaptureOptions = {};
          if (azimuth !== undefined || elevation !== undefined) {
            opts.azimuth = azimuth;
            opts.elevation = elevation;
          } else if (view !== 'current') {
            opts.view = view;
          }
          opts.sceneStyle = callbacks.getPreviewSceneStyle();
          const dataUrl = await captureOffscreen(stlUrl, opts);
          return { image_data_url: dataUrl };
        } catch (err) {
          return {
            error: `Failed to capture screenshot: ${err instanceof Error ? err.message : String(err)}`,
          };
        }
      },
      toModelOutput({ output }) {
        if (typeof output === 'object' && output !== null && 'image_data_url' in output) {
          const dataUrl = (output as { image_data_url: string }).image_data_url;
          const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
          return {
            type: 'content' as const,
            value: [
              { type: 'image-data' as const, data: base64, mediaType: 'image/png' },
              { type: 'text' as const, text: 'Screenshot captured successfully.' },
            ],
          };
        }
        if (typeof output === 'object' && output !== null && 'error' in output) {
          return { type: 'text' as const, value: (output as { error: string }).error };
        }
        return { type: 'text' as const, value: String(output) };
      },
    }),

    apply_edit: tool({
      description:
        'Apply an exact string replacement to the OpenSCAD code. The old_string must appear exactly once in the file.',
      inputSchema: z.object({
        old_string: z.string().describe('The exact text to find (must be unique in the file)'),
        new_string: z.string().describe('The replacement text'),
        rationale: z.string().describe('Human-readable explanation of the change'),
      }),
      execute: async ({ old_string, new_string, rationale }) => {
        const currentCode = callbacks.getCurrentCode();

        const occurrences = currentCode.split(old_string).length - 1;
        if (occurrences === 0) {
          return `❌ Failed to apply edit: old_string not found in the code.\n\nRationale: ${rationale}\n\nThe edit was not applied. Please check the exact text and try again.`;
        }
        if (occurrences > 1) {
          return `❌ Failed to apply edit: old_string found ${occurrences} times. It must be unique.\n\nRationale: ${rationale}\n\nThe edit was not applied. Include more surrounding context to make old_string unique.`;
        }

        const lineCount = new_string.split('\n').length;
        if (lineCount > 120) {
          return `❌ Failed to apply edit: replacement is ${lineCount} lines (max 120).\n\nRationale: ${rationale}\n\nBreak the change into smaller edits.`;
        }

        const newCode = currentCode.replace(old_string, new_string);

        const beforeResult = await RenderService.getInstance().checkSyntax(currentCode);
        const afterResult = await RenderService.getInstance().checkSyntax(newCode);

        const beforeErrors = beforeResult.diagnostics.filter((d) => d.severity === 'error').length;
        const afterErrors = afterResult.diagnostics.filter((d) => d.severity === 'error').length;

        if (afterErrors > beforeErrors) {
          const errorMessages = afterResult.diagnostics
            .filter((d) => d.severity === 'error')
            .map((d) => `  [Error] (line ${d.line ?? '?'}): ${d.message}`)
            .join('\n');

          return `❌ Failed to apply edit: introduces ${afterErrors - beforeErrors} new error(s).\n\nCompilation errors after applying edit:\n${errorMessages}\n\nRationale: ${rationale}\n\nThe edit was rolled back. No changes were made. Please fix the errors and try again.`;
        }

        const checkpointId = historyService.createCheckpoint(
          currentCode,
          [],
          `Before AI edit: ${rationale}`,
          'ai'
        );

        eventBus.emit('code-updated', { code: newCode });

        const checkpointSuffix = `\n[CHECKPOINT:${checkpointId}]`;
        return `✅ Edit applied successfully!\n✅ Code compiles without new errors\n✅ Preview has been updated automatically\n\nRationale: ${rationale}\n\nThe changes are now live in the editor.${checkpointSuffix}`;
      },
    }),

    get_diagnostics: tool({
      description: 'Get current OpenSCAD compilation errors and warnings',
      inputSchema: z.object({}),
      execute: async () => {
        const currentCode = callbacks.getCurrentCode();
        const result = await RenderService.getInstance().checkSyntax(currentCode);

        if (result.diagnostics.length === 0) {
          return '✅ No errors or warnings. The code compiles successfully.';
        }

        const formatted = result.diagnostics
          .map((d) => {
            const severity =
              d.severity === 'error' ? 'Error' : d.severity === 'warning' ? 'Warning' : 'Info';
            const location = d.line ? ` (line ${d.line}${d.col ? `, col ${d.col}` : ''})` : '';
            return `[${severity}]${location}: ${d.message}`;
          })
          .join('\n');

        return `Current diagnostics:\n\n${formatted}`;
      },
    }),

    trigger_render: tool({
      description: 'Manually trigger a preview render',
      inputSchema: z.object({}),
      execute: async () => {
        eventBus.emit('render-requested');
        return '✅ Render triggered. Check the preview pane for the updated output.';
      },
    }),
  };
}
