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
    // Grant clipboard permissions for Monaco editor interaction
    permissions: ['clipboard-read', 'clipboard-write'],
    // WebGL is required for Three.js 3D preview
    launchOptions: {
      args: [
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--enable-unsafe-webgpu',
        '--use-gl=angle',
        '--use-angle=metal',
        '--enable-features=Vulkan,UseSkiaRenderer',
      ],
    },
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
      },
      testIgnore: ['**/*.tauri.spec.ts'],
    },
    {
      name: 'web-firefox',
      use: {
        ...devices['Desktop Firefox'],
        viewport: { width: 1280, height: 720 },
        deviceScaleFactor: 1,
      },
      testIgnore: ['**/*.tauri.spec.ts'],
    },
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
