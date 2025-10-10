/**
 * OpenSCAD AI Agent Sidecar Server
 *
 * Runs the Claude Agent SDK with OpenSCAD-specific MCP tools.
 * Communicates with Tauri backend via JSON-RPC over stdio.
 *
 * Security: API key provided via ANTHROPIC_API_KEY environment variable (never in renderer)
 * Architecture: Diff-based editing only, max 120 lines per diff, test-compiled before acceptance
 */

import { tool, createSdkMcpServer, query } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as readline from 'readline';

// ============================================================================
// JSON-RPC Protocol
// ============================================================================

interface JsonRpcRequest {
  jsonrpc: string;
  id: number;
  method: string;
  params: any;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: number;
  result?: any;
  error?: any;
}

// ============================================================================
// IPC Bridge to Rust Backend
// ============================================================================

let requestIdCounter = 0;
const pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (error: any) => void }>();

/**
 * Call a Rust tool handler via JSON-RPC over stdio
 */
async function callRust(method: string, params: any = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = ++requestIdCounter;
    pendingRequests.set(id, { resolve, reject });

    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    // Send to Rust via stdout
    console.log(JSON.stringify(request));
  });
}

// Setup stdin listener for responses from Rust
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false,
});

rl.on('line', (line) => {
  try {
    const response: JsonRpcResponse = JSON.parse(line);
    const pending = pendingRequests.get(response.id);

    if (pending) {
      pendingRequests.delete(response.id);
      if (response.error) {
        pending.reject(new Error(response.error.message || JSON.stringify(response.error)));
      } else {
        pending.resolve(response.result);
      }
    }
  } catch (error) {
    console.error('[Sidecar] Error parsing response from Rust:', error);
  }
});

// ============================================================================
// MCP Tools - OpenSCAD Operations
// ============================================================================

/**
 * Tool 1: Get current OpenSCAD code from editor
 */
const getCurrentCode = tool(
  'get_current_code',
  'Get the current OpenSCAD code from the editor buffer',
  {},
  async () => {
    const code = await callRust('get_current_code');
    return {
      content: [
        {
          type: 'text' as const,
          text: code || '// Empty file',
        },
      ],
    };
  }
);

/**
 * Tool 2: Get preview screenshot
 * Returns file path (not base64) for efficiency
 */
const getPreviewScreenshot = tool(
  'get_preview_screenshot',
  'Get the file path to the current 3D/2D preview render. Use this to see what the design looks like.',
  {},
  async () => {
    const path = await callRust('get_preview_screenshot');
    return {
      content: [
        {
          type: 'text' as const,
          text: `Preview image saved at: ${path}\n\nThis shows the current rendered output of the OpenSCAD code.`,
        },
      ],
    };
  }
);

/**
 * Tool 3: Propose a diff
 * Validates diff format, checks size limits, dry-runs application
 */
const proposeDiff = tool(
  'propose_diff',
  'Propose code changes as a unified diff. The diff will be validated (max 120 lines changed) and test-applied before acceptance.',
  {
    diff: z.string().describe('Unified diff format with --- / +++ / @@ / - / + lines'),
    rationale: z.string().describe('Brief explanation of what these changes accomplish'),
  },
  async ({ diff, rationale }) => {
    try {
      const validation = await callRust('validate_diff', { diff });

      if (!validation.ok) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Diff validation failed: ${validation.error}\n\nPlease fix the diff and try again.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `✅ Diff validated successfully\n- Lines changed: ${validation.lines_changed}\n- Rationale: ${rationale}\n\nThe diff is ready to apply. Use apply_diff with the same diff string.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Error validating diff: ${error}\n\nMake sure the diff is in unified format.`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool 4: Apply diff
 * Applies validated diff, test-compiles with OpenSCAD, rolls back on errors
 */
const applyDiff = tool(
  'apply_diff',
  'Apply a previously validated unified diff to the code. The code will be test-compiled with OpenSCAD and rolled back if errors are introduced.',
  {
    diff: z.string().describe('The same unified diff string from propose_diff'),
  },
  async ({ diff }) => {
    try {
      const result = await callRust('apply_diff', { diff });

      if (!result.success) {
        const errorMsg = result.error || 'Unknown error';
        const diagText = result.diagnostics?.length
          ? `\n\nNew errors:\n${JSON.stringify(result.diagnostics, null, 2)}`
          : '';

        return {
          content: [
            {
              type: 'text' as const,
              text: `❌ Failed to apply diff: ${errorMsg}${diagText}\n\nThe diff was rolled back. No changes were made.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `✅ Diff applied successfully!\n✅ Code compiles without new errors\n✅ Preview has been updated automatically\n\nThe changes are now live in the editor.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `❌ Error applying diff: ${error}\n\nNo changes were made.`,
          },
        ],
        isError: true,
      };
    }
  }
);

/**
 * Tool 5: Get diagnostics
 * Retrieve current compilation errors and warnings
 */
const getDiagnostics = tool(
  'get_diagnostics',
  'Get current compilation errors and warnings from OpenSCAD',
  {},
  async () => {
    const diagnostics = await callRust('get_diagnostics');

    if (!diagnostics || diagnostics.length === 0) {
      return {
        content: [
          {
            type: 'text' as const,
            text: '✅ No errors or warnings. The code compiles successfully.',
          },
        ],
      };
    }

    const formatted = diagnostics
      .map((d: any) => {
        const location = d.line ? ` (line ${d.line}${d.col ? `, col ${d.col}` : ''})` : '';
        return `[${d.severity.toUpperCase()}]${location}: ${d.message}`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text' as const,
          text: `Current diagnostics:\n\n${formatted}`,
        },
      ],
    };
  }
);

/**
 * Tool 6: Trigger render
 * Manually trigger a preview render
 */
const triggerRender = tool(
  'trigger_render',
  'Manually trigger a render to update the preview pane with the latest code changes',
  {},
  async () => {
    await callRust('trigger_render');
    return {
      content: [
        {
          type: 'text' as const,
          text: '✅ Render triggered. Check the preview pane for the updated output.',
        },
      ],
    };
  }
);

// ============================================================================
// MCP Server Creation
// ============================================================================

export const openscadMcpServer = createSdkMcpServer({
  name: 'openscad-tools',
  version: '1.0.0',
  tools: [getCurrentCode, getPreviewScreenshot, proposeDiff, applyDiff, getDiagnostics, triggerRender],
});

// ============================================================================
// System Prompt Builder
// ============================================================================

function buildOpenScadSystemPrompt(mode: string): string {
  const baseContext = `
## OpenSCAD AI Assistant

You are an expert OpenSCAD assistant helping users design 3D models. You have access to tools that let you see the current code, view the rendered preview, and make targeted code changes.

### Critical Rules:
1. **ALWAYS use diffs**: Never output full file replacements. Use \`propose_diff\` followed by \`apply_diff\`.
2. **Keep diffs small**: Maximum 120 lines changed per diff. Break large changes into multiple steps.
3. **Validate first**: Always use \`propose_diff\` to validate before applying.
4. **Check your work**: After applying a diff, use \`get_diagnostics\` to verify no new errors were introduced.
5. **Visual feedback**: Use \`get_preview_screenshot\` to see what the current design looks like.

### Workflow:
1. Use \`get_current_code\` to see what you're working with
2. Optionally use \`get_preview_screenshot\` to see the rendered output
3. Use \`get_diagnostics\` to check for existing errors
4. Create a targeted diff with \`propose_diff\`
5. Once validated, apply it with \`apply_diff\`
6. Verify success with \`get_diagnostics\`

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
`;

  const modeInstructions: Record<string, string> = {
    generate: `
### Mode: GENERATE
Generate complete new OpenSCAD code from scratch based on the user's description. Start fresh and create well-structured, parametric designs.`,

    edit: `
### Mode: EDIT
Modify existing code with targeted changes. Always get the current code first, then create precise diffs that preserve the structure and style.`,

    fix: `
### Mode: FIX
Fix compilation errors in the code. Start by getting diagnostics, then the current code, analyze the issues, and propose fixes that resolve the errors without breaking working parts.`,

    explain: `
### Mode: EXPLAIN
Explain what the code does. Get the current code and optionally the preview screenshot to understand the design, then provide clear documentation or comments.`,
  };

  return (
    baseContext +
    '\n' +
    (modeInstructions[mode] || modeInstructions.edit)
  );
}

// ============================================================================
// Agent Query Handler
// ============================================================================

/**
 * Run an agent query with the OpenSCAD MCP tools
 */
export async function runAgentQuery(prompt: string, mode: string = 'edit'): Promise<AsyncGenerator<any>> {
  const systemPrompt = buildOpenScadSystemPrompt(mode);

  console.error(`[Sidecar] Starting agent query in ${mode} mode`);

  const session = query({
    prompt,
    options: {
      model: 'claude-sonnet-4-5',
      fallbackModel: 'claude-3-5-sonnet-20241022',
      systemPrompt,
      includePartialMessages: true,
      allowedTools: [
        'get_current_code',
        'get_preview_screenshot',
        'propose_diff',
        'apply_diff',
        'get_diagnostics',
        'trigger_render',
      ],
      mcpServers: {
        openscad: {
          type: 'sdk' as const,
          name: 'openscad-tools',
          instance: openscadMcpServer.instance,
        },
      },
      env: process.env,
      maxTurns: 10,
    },
  });

  return session;
}

// ============================================================================
// Main Entry Point
// ============================================================================

console.error('[Sidecar] OpenSCAD AI Agent Server starting...');

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[Sidecar] ERROR: ANTHROPIC_API_KEY not found in environment');
  process.exit(1);
}

console.error('[Sidecar] API key detected ✓');
console.error('[Sidecar] MCP server initialized with 6 tools');
console.error('[Sidecar] Ready for agent queries');

// Handle shutdown signals
process.on('SIGTERM', () => {
  console.error('[Sidecar] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[Sidecar] Received SIGINT, shutting down...');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[Sidecar] Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Sidecar] Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
