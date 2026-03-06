import { defineConfig, devices } from '@playwright/test';

const WEB_DEV_PORT = 3000;
const TAURI_ENABLED = !!process.env.TAURI_TEST;

export default defineConfig({
  testDir: './e2e/tests',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
    ...(process.env.CI ? [['github' as const]] : []),
  ],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',

  use: {
    baseURL: `http://localhost:${WEB_DEV_PORT}`,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    acceptDownloads: true,
  },
  projects: [
    // --- Web Projects ---
    {
      name: 'web-chromium',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',  // Use real Chrome for WebGL/GPU support
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
        // Clipboard permissions are Chromium-only — Webkit rejects clipboard-write
        permissions: ['clipboard-read', 'clipboard-write'],
        // WebGL args are Chromium-specific — Webkit rejects them
        launchOptions: {
          args: [
            '--enable-webgl',
            '--ignore-gpu-blocklist',
            '--enable-unsafe-webgpu',
            '--use-gl=angle',
            '--enable-features=Vulkan,UseSkiaRenderer',
          ],
        },
      },
      testIgnore: ['**/*.tauri.spec.ts'],
    },
    // Firefox removed — fails to launch with WebGL flags, all tests timeout at 0ms
    // WebKit doesn't support the Chromium launch args, so skip WebGL-heavy tests there
    {
      name: 'web-webkit',
      use: {
        ...devices['Desktop Safari'],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      },
      testIgnore: ['**/*.tauri.spec.ts'],
    },

    // --- Desktop Project (opt-in via TAURI_TEST=1) ---
    ...(TAURI_ENABLED
      ? [
          {
            name: 'tauri-desktop',
            use: {
              browserName: 'chromium' as const,
              viewport: { width: 1280, height: 720 },
              deviceScaleFactor: 1,
            },
            testIgnore: ['**/*.web.spec.ts'],
          },
        ]
      : []),
  ],
});
