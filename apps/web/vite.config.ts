import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sentryVitePlugin } from '@sentry/vite-plugin';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const appVersion = JSON.parse(readFileSync(path.resolve(__dirname, '../../package.json'), 'utf8'))
  .version as string;
const sentryRelease = `openscad-studio@${appVersion}`;
const hasSentryBuildConfig = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

export default defineConfig({
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
  root: __dirname,
  resolve: {
    alias: {
      '@ui': path.resolve(__dirname, '../ui/src'),
    },
  },
  server: {
    port: 3000,
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
  },
  optimizeDeps: {
    exclude: ['web-tree-sitter'],
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    outDir: 'dist',
    sourcemap: hasSentryBuildConfig ? 'hidden' : false,
  },
});
