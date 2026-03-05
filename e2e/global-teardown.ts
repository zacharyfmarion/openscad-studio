import { FullConfig } from '@playwright/test';

async function globalTeardown(_config: FullConfig) {
  const pid = process.env.E2E_DEV_SERVER_PID;
  if (pid) {
    console.log(`[E2E Teardown] Stopping dev server (PID: ${pid})...`);
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {
      // Process may have already exited
    }
  }
}

export default globalTeardown;
