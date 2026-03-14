import type { PlatformCapabilities } from '../platform';
import { APP_VERSION } from '../constants/appInfo';
import { scrubAndFilterEvent } from './sanitize';

export type RuntimeSurface = 'web' | 'desktop';

export interface PostHogClientLike {
  init: (token: string, config: Record<string, unknown>) => void;
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
  register: (properties: Record<string, unknown>) => void;
  opt_in_capturing: (options?: Record<string, unknown>) => void;
  opt_out_capturing: () => void;
}

interface BootstrapOptions {
  analyticsEnabled: boolean;
}

interface PostHogEnvironment {
  VITE_PUBLIC_POSTHOG_KEY?: string;
  VITE_PUBLIC_POSTHOG_HOST?: string;
  DEV?: boolean;
}

interface AppOpenedOptions extends BootstrapOptions {
  capabilities?: PlatformCapabilities;
}

interface BootstrapErrorOptions extends AppOpenedOptions {
  operation: string;
}

function getRuntimeSurface(): RuntimeSurface {
  return '__TAURI_INTERNALS__' in window ? 'desktop' : 'web';
}

function fallbackCapabilities(runtimeSurface: RuntimeSurface): PlatformCapabilities {
  if (runtimeSurface === 'desktop') {
    return {
      multiFile: true,
      hasNativeMenu: true,
      hasFileSystem: true,
      canSetWindowTitle: true,
    };
  }

  return {
    multiFile: false,
    hasNativeMenu: false,
    hasFileSystem: false,
    canSetWindowTitle: true,
  };
}

export function getBootstrapSharedProperties(options: AppOpenedOptions): Record<string, unknown> {
  const runtimeSurface = getRuntimeSurface();
  const capabilities = options.capabilities ?? fallbackCapabilities(runtimeSurface);

  return {
    app_version: APP_VERSION,
    runtime_surface: runtimeSurface,
    has_file_system: capabilities.hasFileSystem,
    has_native_menu: capabilities.hasNativeMenu,
    multi_file: capabilities.multiFile,
    analytics_enabled: options.analyticsEnabled,
  };
}

export function initializePostHog(
  client: PostHogClientLike,
  options: BootstrapOptions,
  env?: PostHogEnvironment
): boolean {
  const resolvedEnv = env ?? import.meta.env;
  const key = resolvedEnv.VITE_PUBLIC_POSTHOG_KEY;
  const host = resolvedEnv.VITE_PUBLIC_POSTHOG_HOST;

  if (!key || !host) {
    if (resolvedEnv.DEV) {
      console.info('[analytics] PostHog disabled: missing VITE_PUBLIC_POSTHOG_KEY or host');
    }
    return false;
  }

  client.init(key, {
    api_host: host,
    defaults: '2026-01-30',
    autocapture: true,
    capture_pageview: true,
    capture_pageleave: false,
    capture_dead_clicks: false,
    rageclick: false,
    disable_session_recording: true,
    disable_surveys: true,
    mask_all_text: true,
    mask_all_element_attributes: true,
    person_profiles: 'identified_only',
    before_send: scrubAndFilterEvent,
  });

  client.register(getBootstrapSharedProperties(options));
  if (options.analyticsEnabled) {
    client.opt_in_capturing({ captureEventName: false });
  } else {
    client.opt_out_capturing();
  }

  return true;
}
export function captureAppOpened(
  client: Pick<PostHogClientLike, 'capture'>,
  options: AppOpenedOptions
) {
  client.capture('app opened', getBootstrapSharedProperties(options));
}

function fingerprintError(operation: string, error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message
          : 'unknown';

  return `${operation}:${message}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function captureBootstrapError(
  client: Pick<PostHogClientLike, 'capture'>,
  error: unknown,
  options: BootstrapErrorOptions
) {
  client.capture('app error', {
    ...getBootstrapSharedProperties(options),
    error_domain: 'bootstrap',
    operation: options.operation,
    handled: true,
    source_component: 'bootstrap',
    fingerprint: fingerprintError(options.operation, error),
  });
}
