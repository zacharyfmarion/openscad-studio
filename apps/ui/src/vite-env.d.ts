/// <reference types="vite/client" />

import type { ShareContext } from './types/share';

interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_ENVIRONMENT?: string;
  readonly VITE_SHARE_API_URL?: string;
  readonly VITE_ENABLE_PROD_SHARE_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    __UNSUPPORTED_BROWSER?: boolean;
    __SHARE_CONTEXT?: ShareContext;
    __SHARE_API_BASE?: string;
    __SHARE_ENABLED?: boolean;
  }
}

export {};
