import { FullConfig } from '@playwright/test';
import { ChildProcess, spawn } from 'child_process';
import * as http from 'http';

const WEB_DEV_PORT = 3000;

async function isServerReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForServer(port: number, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerReady(port)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Server on port ${port} not ready after ${timeoutMs}ms`);
}

let devServer: ChildProcess | null = null;

async function globalSetup(_config: FullConfig) {
  // Check if web dev server is already running
  if (await isServerReady(WEB_DEV_PORT)) {
    console.log(`[E2E Setup] Dev server already running on port ${WEB_DEV_PORT}`);
    return;
  }

  console.log(`[E2E Setup] Starting web dev server on port ${WEB_DEV_PORT}...`);
  devServer = spawn('pnpm', ['web:dev'], {
    cwd: process.cwd(),
    stdio: 'pipe',
    env: {
      ...process.env,
      BROWSER: 'none',
      VITE_ENABLE_PROD_SHARE_DEV: 'true',
      VITE_SHARE_API_URL: `http://localhost:${WEB_DEV_PORT}`,
    },
    detached: false,
  });

  devServer.stdout?.on('data', (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes('error') || msg.includes('Error')) {
      console.error(`[E2E Dev Server] ${msg.trim()}`);
    }
  });

  devServer.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    // Suppress noisy warnings
    if (msg.includes('baseline-browser-mapping')) return;
    if (msg.length > 0) {
      console.error(`[E2E Dev Server stderr] ${msg}`);
    }
  });

  // Store PID for teardown
  if (devServer.pid) {
    process.env.E2E_DEV_SERVER_PID = String(devServer.pid);
  }

  await waitForServer(WEB_DEV_PORT, 60_000);
  console.log(`[E2E Setup] Dev server ready on port ${WEB_DEV_PORT}`);
}

export default globalSetup;
