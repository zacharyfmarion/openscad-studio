import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))
  .version as string;
const sentryRelease = `openscad-studio@${appVersion}`;
const hasSentryBuildConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react(),
    ...(hasSentryBuildConfig
      ? [
          sentryVitePlugin({
            authToken: process.env.SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            release: {
              name: sentryRelease,
            },
          }),
        ]
      : []),
  ],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: 'ws',
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ['**/src-tauri/**'],
    },
    headers: {
      // Serve WASM files with correct MIME type
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  // Ensure WASM files are served with correct MIME type
  optimizeDeps: {
    exclude: ['web-tree-sitter'],
  },
  build: {
    sourcemap: hasSentryBuildConfig ? 'hidden' : false,
  },
  // Configure asset handling for WASM files
  assetsInclude: ['**/*.wasm'],
  // Explicitly copy WASM files to dist during build
  publicDir: 'public',
}));
