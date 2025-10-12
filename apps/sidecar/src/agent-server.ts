/**
 * OpenSCAD AI Agent Sidecar Server
 *
 * Runs the Vercel AI SDK with OpenSCAD-specific tools.
 * Communicates with Tauri backend via JSON-RPC over stdio.
 *
 * Security: API key provided via environment variable (never in renderer)
 * Architecture: Diff-based editing only, max 120 lines per diff, test-compiled before acceptance
 */

import { streamText } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
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

rl.on('line', async (line) => {
  try {
    const input = JSON.parse(line);

    // Handle query requests
    if (input.type === 'query') {
      const { messages } = input;
      console.error(`[Sidecar] Processing query with ${messages?.length || 0} messages`);

      try {
        await runAgentQuery(messages || []);
        console.error('[Sidecar] Query completed');
        console.log(JSON.stringify({ type: 'done' }));
      } catch (error) {
        console.error('[Sidecar] Error processing query:', error);
        console.log(JSON.stringify({ type: 'error', error: String(error) }));
      }
      return;
    }

    // Handle JSON-RPC responses from Rust
    const response: JsonRpcResponse = input;
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
// AI SDK Tools - OpenSCAD Operations
// ============================================================================

const tools = {
  get_current_code: {
    description: 'Get the current OpenSCAD code from the editor buffer',
    parameters: z.object({}),
    execute: async () => {
      const code = await callRust('get_current_code');
      return code || '// Empty file';
    },
  },

  get_preview_screenshot: {
    description: 'Get the file path to the current 3D/2D preview render. Use this to see what the design looks like.',
    parameters: z.object({}),
    execute: async () => {
      const path = await callRust('get_preview_screenshot');
      return `Preview image saved at: ${path}\n\nThis shows the current rendered output of the OpenSCAD code.`;
    },
  },

  apply_edit: {
    description: 'Apply code changes by replacing an exact substring with new content. The old text must exist exactly once in the code. Max 120 lines changed. The code will be test-compiled with OpenSCAD and rolled back if validation fails or new errors are introduced.',
    parameters: z.object({
      old_string: z.string().describe('The exact text to find and replace. Must be unique in the file.'),
      new_string: z.string().describe('The replacement text'),
      rationale: z.string().describe('Brief explanation of what this change accomplishes'),
    }),
    execute: async ({ old_string, new_string, rationale }: { old_string: string; new_string: string; rationale: string }) => {
      try {
        const result = await callRust('apply_edit', { old_string, new_string });

        if (!result.success) {
          const errorMsg = result.error || 'Unknown error';
          const diagText = result.diagnostics?.length
            ? `\n\nNew errors:\n${JSON.stringify(result.diagnostics, null, 2)}`
            : '';

          return `❌ Failed to apply edit: ${errorMsg}${diagText}\n\nRationale: ${rationale}\n\nThe edit was rolled back. No changes were made.`;
        }

        return `✅ Edit applied successfully!\n✅ Code compiles without new errors\n✅ Preview has been updated automatically\n\nRationale: ${rationale}\n\nThe changes are now live in the editor.`;
      } catch (error) {
        return `❌ Error applying edit: ${error}\n\nNo changes were made.`;
      }
    },
  },

  get_diagnostics: {
    description: 'Get current compilation errors and warnings from OpenSCAD',
    parameters: z.object({}),
    execute: async () => {
      const diagnostics = await callRust('get_diagnostics');

      if (!diagnostics || diagnostics.length === 0) {
        return '✅ No errors or warnings. The code compiles successfully.';
      }

      const formatted = diagnostics
        .map((d: any) => {
          const location = d.line ? ` (line ${d.line}${d.col ? `, col ${d.col}` : ''})` : '';
          return `[${d.severity.toUpperCase()}]${location}: ${d.message}`;
        })
        .join('\n');

      return `Current diagnostics:\n\n${formatted}`;
    },
  },

  trigger_render: {
    description: 'Manually trigger a render to update the preview pane with the latest code changes',
    parameters: z.object({}),
    execute: async () => {
      await callRust('trigger_render');
      return '✅ Render triggered. Check the preview pane for the updated output.';
    },
  },
};

// ============================================================================
// System Prompt Builder
// ============================================================================

function buildOpenScadSystemPrompt(): string {
  return `
## OpenSCAD AI Assistant

You are an expert OpenSCAD assistant helping users design and modify 3D models. You have access to tools that let you see the current code, view the rendered preview, and make targeted code changes.

### Your Capabilities:
- **View code**: Use \`get_current_code\` to see what you're working with
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
`;
}

// ============================================================================
// Provider Configuration
// ============================================================================

function getModelProvider() {
  const provider = process.env.AI_PROVIDER || 'anthropic';

  if (provider === 'openai') {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not found in environment');
    }
    return openai('gpt-4-turbo');
  }

  // Default to Anthropic
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY not found in environment');
  }
  return anthropic('claude-sonnet-4-5');
}

// ============================================================================
// Agent Query Handler
// ============================================================================

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Run an agent query with the OpenSCAD tools
 */
export async function runAgentQuery(messages: Message[]): Promise<void> {
  const systemPrompt = buildOpenScadSystemPrompt();

  console.error(`[Sidecar] Starting agent query`);
  console.error(`[Sidecar] Messages: ${messages.length} total`);
  console.error(`[Sidecar] System prompt length: ${systemPrompt.length} chars`);

  const model = getModelProvider();
  console.error(`[Sidecar] Model configured`);

  try {
    console.error(`[Sidecar] Calling streamText...`);
    const result = streamText({
      model,
      system: systemPrompt,
      messages,
      tools,
      maxSteps: 10,
    });

    console.error(`[Sidecar] streamText returned, awaiting fullStream...`);

    // Stream the full response including tool calls
    for await (const part of result.fullStream) {
      console.error(`[Sidecar] Received stream part:`, JSON.stringify(part));

      if (part.type === 'text-delta') {
        console.log(JSON.stringify({
          type: 'text',
          content: part.textDelta,
        }));
      } else if (part.type === 'tool-call') {
        console.error(`[Sidecar] Tool call: ${part.toolName}`);
        console.log(JSON.stringify({
          type: 'tool-call',
          toolName: part.toolName,
          args: part.args,
        }));
      } else if (part.type === 'tool-result') {
        console.error(`[Sidecar] Tool result for: ${part.toolName}`);
        console.log(JSON.stringify({
          type: 'tool-result',
          toolName: part.toolName,
          result: part.result,
        }));
      } else if (part.type === 'error') {
        console.error(`[Sidecar] Stream error:`, part.error);
        console.log(JSON.stringify({
          type: 'error',
          error: String(part.error),
        }));
      } else {
        console.error(`[Sidecar] Unknown part type: ${part.type}`);
      }
    }

    console.error(`[Sidecar] Stream completed successfully`);
  } catch (error) {
    console.error(`[Sidecar] Error in runAgentQuery:`, error);
    console.log(JSON.stringify({
      type: 'error',
      error: String(error),
    }));
    throw error;
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

console.error('[Sidecar] OpenSCAD AI Agent Server starting...');

// Check for API key
const provider = process.env.AI_PROVIDER || 'anthropic';
const apiKeyVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY';

if (!process.env[apiKeyVar]) {
  console.error(`[Sidecar] ERROR: ${apiKeyVar} not found in environment`);
  process.exit(1);
}

console.error(`[Sidecar] Using provider: ${provider}`);
console.error('[Sidecar] API key detected ✓');
console.error('[Sidecar] Initialized with 5 tools: get_current_code, get_preview_screenshot, apply_edit, get_diagnostics, trigger_render');
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
