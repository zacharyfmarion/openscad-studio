/**
 * Agent Sidecar Server
 *
 * Runs the Claude Agent SDK with OpenSCAD-specific MCP tools.
 * Communicates with Tauri backend via JSON-RPC over stdio.
 */

// Placeholder - will be fully implemented in Checkpoint 3.2
console.error('[Sidecar] Starting OpenSCAD AI Agent Server...');

// Check for API key
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('[Sidecar] ERROR: ANTHROPIC_API_KEY not found in environment');
  process.exit(1);
}

console.error('[Sidecar] API key detected ✓');
console.error('[Sidecar] Ready for agent queries');

// Keep process alive
process.stdin.resume();
process.stdin.on('data', (data) => {
  try {
    const request = JSON.parse(data.toString());
    console.error(`[Sidecar] Received request: ${request.method}`);

    // Placeholder response
    const response = {
      jsonrpc: '2.0',
      id: request.id,
      result: { status: 'placeholder', message: 'Agent SDK not yet implemented' }
    };

    console.log(JSON.stringify(response));
  } catch (error) {
    console.error('[Sidecar] Error parsing request:', error);
  }
});

process.on('SIGTERM', () => {
  console.error('[Sidecar] Received SIGTERM, shutting down...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.error('[Sidecar] Received SIGINT, shutting down...');
  process.exit(0);
});
