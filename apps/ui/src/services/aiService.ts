import { tool } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { eventBus, historyService } from '../platform';
import { RenderService } from './renderService';
import { captureOffscreen, type CaptureOptions } from './offscreenRenderer';
import type { PreviewSceneStyle } from './previewSceneConfig';
import type { AiProvider } from '../stores/apiKeyStore';
import type { MeasurementUnit } from '../stores/settingsStore';

export interface AiToolCallbacks {
  getCurrentCode: () => string;
  captureCurrentView: () => Promise<string | null>;
  getStlBlobUrl: () => string | null;
  getPreviewSceneStyle: () => PreviewSceneStyle;
  listProjectFiles: () => string[];
  readProjectFile: (path: string) => string | null;
  getRenderTargetPath: () => string | null;
  getFileContent: (path: string) => string | null;
  createProjectFile: (path: string, content: string) => boolean;
  editProjectFile: (path: string, oldString: string, newString: string) => string | null;
  setRenderTarget: (path: string) => boolean;
  getMeasurementUnit: () => MeasurementUnit;
  setMeasurementUnit: (unit: MeasurementUnit) => void;
}

export const SYSTEM_PROMPT = `## OpenSCAD AI Assistant

You are an expert OpenSCAD assistant helping users design and modify 3D models. You have access to tools that let you see the current code, view the rendered preview, and make targeted code changes.

### Your Capabilities:
- **View code**: Use \`get_current_code\` to see the render target's current code
- **Browse project files**: Use \`list_project_files\` to see all files in the project and which is the render target
- **Read any file**: Use \`read_file\` to read any file in the project
- **See the design**: Use \`get_preview_screenshot\` to see the rendered output
- **Check for errors**: Use \`get_diagnostics\` to check compilation errors and warnings
- **Make changes**: Use \`apply_edit\` to modify code with exact string replacement (specify \`file_path\` to edit a specific file, or omit to edit the render target)
- **Create files**: Use \`create_file\` to add new files to the project
- **Switch render target**: Use \`set_render_target\` to change which file is compiled and previewed
- **Update preview**: Use \`trigger_render\` to manually refresh the preview

### Critical Rules for Editing:
1. **ALWAYS use exact string replacement**: Never output full file replacements. Use \`apply_edit\` with exact substrings.
2. **Provide exact substrings**: The \`old_string\` must match exactly (including whitespace and indentation) and must be unique in the file.
3. **Keep changes focused**: Each edit should change one logical unit. Break unrelated changes into separate steps.
4. **Always validate when done**: After finishing all edits, always call \`get_diagnostics\` to confirm the code compiles cleanly. Fix any errors before declaring success.
5. **Include context**: Make the \`old_string\` large enough to be unique - include surrounding lines if needed.

### Recommended Workflow:
1. Start by calling \`get_current_code\` to understand what exists
2. Optionally use \`get_preview_screenshot\` to see the rendered output
3. For fixes, use \`get_diagnostics\` to see what errors exist
4. Use \`apply_edit\` with the exact old text, new replacement, and a rationale explaining the change
5. The preview updates automatically after successful edits
6. After all edits are complete, call \`get_diagnostics\` to verify the code compiles without new errors. If there are errors, fix them with additional \`apply_edit\` calls.

### Multi-File Projects:
- The **render target** is the file that gets compiled and previewed. Other files are available via \`include\`/\`use\`.
- Use \`list_project_files\` to see all files and which is the render target.
- Use \`apply_edit\` with \`file_path\` to edit any file in the project by its relative path.
- Use \`create_file\` to split code into modules (e.g., shared libraries, separate parts).
- Use \`set_render_target\` to switch which file is being previewed (e.g., to check a different entry point).

### Interpreting Annotated Screenshots:
- If an attached viewer screenshot includes drawn circles, boxes, ovals, arrows, or freehand marks, treat that markup as intentional user annotation highlighting the area to focus on.
- Do not describe annotation marks as part of the OpenSCAD geometry or as rendering artifacts unless the user explicitly asks about the annotation itself.

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
        'List all files in the project. Returns relative file paths and indicates which is the render target.',
      inputSchema: z.object({}),
      execute: async () => {
        const paths = callbacks.listProjectFiles();
        if (paths.length === 0) {
          return 'No project files found.';
        }
        const renderTarget = callbacks.getRenderTargetPath();
        const lines = paths.map((p) => (p === renderTarget ? `  ${p} (render target)` : `  ${p}`));
        return `Project files (${paths.length}):\n${lines.join('\n')}`;
      },
    }),

    read_file: tool({
      description:
        'Read the contents of a file in the project. Use the relative path as shown by list_project_files.',
      inputSchema: z.object({
        path: z
          .string()
          .describe('Relative path to the file (e.g. "parts.scad" or "lib/utils.scad")'),
      }),
      execute: async ({ path }) => {
        const content = callbacks.readProjectFile(path);
        if (content === null) {
          const available = callbacks.listProjectFiles();
          if (available.length === 0) {
            return `❌ File not found: ${path}\n\nNo project files are available.`;
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
        'Apply an exact string replacement to an OpenSCAD file. The old_string must appear exactly once in the target file. Omit file_path to edit the render target.',
      inputSchema: z.object({
        file_path: z
          .string()
          .optional()
          .describe(
            'Relative path of the file to edit (e.g. "lib/utils.scad"). Omit to edit the render target.'
          ),
        old_string: z.string().describe('The exact text to find (must be unique in the file)'),
        new_string: z.string().describe('The replacement text'),
        rationale: z.string().describe('Human-readable explanation of the change'),
      }),
      execute: async ({ file_path, old_string, new_string, rationale }) => {
        const renderTarget = callbacks.getRenderTargetPath();

        // If targeting a specific non-render-target file, use editProjectFile
        if (file_path && file_path !== renderTarget) {
          const error = callbacks.editProjectFile(file_path, old_string, new_string);
          if (error) {
            return `❌ Failed to apply edit to ${file_path}: ${error}\n\nRationale: ${rationale}\n\nThe edit was not applied.`;
          }
          return `✅ Edit applied to ${file_path}!\n✅ Preview will update automatically if this file is included by the render target.\n\nRationale: ${rationale}`;
        }

        // Edit the render target (backward-compatible path with checkpoints)
        const currentCode = callbacks.getCurrentCode();

        const occurrences = currentCode.split(old_string).length - 1;
        if (occurrences === 0) {
          return `❌ Failed to apply edit: old_string not found in the code.\n\nRationale: ${rationale}\n\nThe edit was not applied. Please check the exact text and try again.`;
        }
        if (occurrences > 1) {
          return `❌ Failed to apply edit: old_string found ${occurrences} times. It must be unique.\n\nRationale: ${rationale}\n\nThe edit was not applied. Include more surrounding context to make old_string unique.`;
        }

        const newCode = currentCode.replace(old_string, new_string);

        const checkpointId = historyService.createCheckpoint(
          currentCode,
          [],
          `Before AI edit: ${rationale}`,
          'ai'
        );

        eventBus.emit('code-updated', { code: newCode, source: 'ai' });

        const checkpointSuffix = `\n[CHECKPOINT:${checkpointId}]`;
        return `✅ Edit applied successfully!\n✅ Preview has been updated automatically\n\nRationale: ${rationale}\n\nThe changes are now live in the editor.${checkpointSuffix}`;
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

    create_file: tool({
      description:
        'Create a new file in the project. Use this to split code into modules or create new entry points.',
      inputSchema: z.object({
        file_path: z
          .string()
          .describe('Relative path for the new file (e.g. "lib/utils.scad" or "box_lid.scad")'),
        content: z.string().describe('Initial file content'),
        rationale: z
          .string()
          .describe('Human-readable explanation of why this file is being created'),
      }),
      execute: async ({ file_path, content, rationale }) => {
        const success = callbacks.createProjectFile(file_path, content);
        if (!success) {
          return `❌ Failed to create ${file_path}: the file already exists or the path is invalid.\n\nRationale: ${rationale}\n\nUse \`apply_edit\` with \`file_path\` to modify an existing file.`;
        }
        return `✅ Created ${file_path}\n\nRationale: ${rationale}\n\nThe file is now available for \`include\`/\`use\` from other files.`;
      },
    }),

    set_render_target: tool({
      description:
        'Change which file is compiled and previewed. The render target is the entry point file that OpenSCAD compiles.',
      inputSchema: z.object({
        file_path: z.string().describe('Relative path of the file to set as the render target'),
      }),
      execute: async ({ file_path }) => {
        const success = callbacks.setRenderTarget(file_path);
        if (!success) {
          const files = callbacks.listProjectFiles();
          if (files.length === 0) {
            return `❌ File not found: ${file_path}\n\nNo project files available.`;
          }
          return `❌ File not found: ${file_path}\n\nAvailable files:\n${files.map((p) => `  ${p}`).join('\n')}`;
        }
        return `✅ Render target changed to ${file_path}. The preview now compiles and renders this file.`;
      },
    }),

    set_measurement_unit: tool({
      description: 'Change the display unit for measurements shown in the viewer panels',
      inputSchema: z.object({
        unit: z.enum(['mm', 'cm', 'in', 'units']).describe('The unit to display measurements in'),
      }),
      execute: async ({ unit }) => {
        callbacks.setMeasurementUnit(unit);
        const labels: Record<string, string> = {
          mm: 'millimeters (mm)',
          cm: 'centimeters (cm)',
          in: 'inches (in)',
          units: 'dimensionless units',
        };
        return `✅ Measurement unit changed to ${labels[unit]}.`;
      },
    }),
  };
}
