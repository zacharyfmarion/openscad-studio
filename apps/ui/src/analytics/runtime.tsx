/* eslint-disable react-refresh/only-export-components -- analytics runtime intentionally exports provider, hook, types, and helpers from one module. */
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { usePostHog } from '@posthog/react';
import { APP_VERSION } from '../constants/appInfo';
import { getPlatform, type PlatformCapabilities } from '../platform';
import { useHasApiKey } from '../stores/apiKeyStore';
import { useSettings } from '../stores/settingsStore';
import { type RuntimeSurface } from './bootstrap';
import { sanitizeAnalyticsProperties } from './sanitize';
import { clearStableId, getOrCreateStableId } from './stableId';

export type RenderTrigger =
  | 'initial'
  | 'manual'
  | 'auto_idle'
  | 'save'
  | 'tab_switch'
  | 'file_open'
  | 'history_restore'
  | 'code_update'
  | 'ai_edit';

export type SettingsSection = 'appearance' | 'viewer' | 'editor' | 'privacy' | 'ai' | 'libraries';
export type ModelSelectionSurface = 'welcome' | 'ai_panel' | 'viewer_annotation' | 'unknown';
export type ViewerKind = '2d' | '3d';
export type ViewerTool =
  | 'pan'
  | 'orbit'
  | 'measure_distance'
  | 'measure_bbox'
  | 'section_plane'
  | 'annotate';
export type LayoutSelectionSource = 'nux' | 'settings' | 'layout_reset' | 'header';
export type CustomizerAction = 'open_ai_refine' | 'open_editor' | 'open_export';
export type ViewerPreferenceKey =
  | 'measurement_unit'
  | 'measurement_snap_enabled'
  | 'show_model_colors';
export type AnalyticsErrorDomain =
  | 'bootstrap'
  | 'render'
  | 'ai'
  | 'file_io'
  | 'settings'
  | 'panel'
  | 'runtime';

export interface AnalyticsErrorContext {
  operation: string;
  error?: unknown;
  errorDomain?: AnalyticsErrorDomain;
  handled?: boolean;
  sourceComponent?: string;
  properties?: Record<string, unknown>;
}

export interface AnalyticsApi {
  track: (eventName: string, properties?: Record<string, unknown>) => void;
  trackError: (context: AnalyticsErrorContext) => void;
  setAnalyticsEnabled: (enabled: boolean, options?: { capturePreferenceChange?: boolean }) => void;
}

interface PostHogCaptureClient {
  capture: (eventName: string, properties?: Record<string, unknown>) => void;
  identify: (distinctId: string) => void;
  reset: () => void;
  opt_in_capturing: (options?: Record<string, unknown>) => void;
  opt_out_capturing: () => void;
  register: (properties: Record<string, unknown>) => void;
}

const ERROR_DEDUPE_WINDOW_MS = 30_000;
const recentErrorKeys = new Map<string, number>();

const NOOP_ANALYTICS: AnalyticsApi = {
  track: () => {},
  trackError: () => {},
  setAnalyticsEnabled: () => {},
};

const AnalyticsContext = createContext<AnalyticsApi>(NOOP_ANALYTICS);

let runtimeAnalytics: AnalyticsApi = NOOP_ANALYTICS;

function getRuntimeSurface(): RuntimeSurface {
  return '__TAURI_INTERNALS__' in window ? 'desktop' : 'web';
}

function getFallbackCapabilities(runtimeSurface: RuntimeSurface): PlatformCapabilities {
  if (runtimeSurface === 'desktop') {
    return {
      multiFile: true,
      hasNativeMenu: true,
      hasFileSystem: true,
      canSetWindowTitle: true,
    };
  }

  return {
    multiFile: true,
    hasNativeMenu: false,
    hasFileSystem: false,
    canSetWindowTitle: true,
  };
}

function getSafePlatformCapabilities(): PlatformCapabilities {
  try {
    return getPlatform().capabilities;
  } catch {
    return getFallbackCapabilities(getRuntimeSurface());
  }
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message || error.name || 'unknown-error';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return (error as { message: string }).message;
  }
  return 'unknown-error';
}

function buildErrorFingerprint(operation: string, error: unknown): string {
  return `${operation}:${normalizeErrorMessage(error)}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function inferErrorDomain(operation: string): AnalyticsErrorDomain {
  if (operation.includes('render') || operation.includes('openscad')) return 'render';
  if (operation.includes('ai')) return 'ai';
  if (
    operation.includes('file') ||
    operation.includes('save') ||
    operation.includes('open') ||
    operation.includes('export')
  ) {
    return 'file_io';
  }
  if (operation.includes('setting') || operation.includes('library')) return 'settings';
  if (operation.includes('panel')) return 'panel';
  return 'runtime';
}

function shouldTrackErrorOnce(key: string): boolean {
  const now = Date.now();

  for (const [existingKey, timestamp] of recentErrorKeys.entries()) {
    if (now - timestamp > ERROR_DEDUPE_WINDOW_MS) {
      recentErrorKeys.delete(existingKey);
    }
  }

  const previousTimestamp = recentErrorKeys.get(key);
  if (previousTimestamp && now - previousTimestamp < ERROR_DEDUPE_WINDOW_MS) {
    return false;
  }

  recentErrorKeys.set(key, now);
  return true;
}

function createSharedProperties(options: {
  analyticsEnabled: boolean;
  hasApiKey: boolean;
  defaultLayoutPreset: string;
  capabilities: PlatformCapabilities;
}): Record<string, unknown> {
  return {
    app_version: APP_VERSION,
    runtime_surface: getRuntimeSurface(),
    has_file_system: options.capabilities.hasFileSystem,
    has_native_menu: options.capabilities.hasNativeMenu,
    multi_file: options.capabilities.multiFile,
    analytics_enabled: options.analyticsEnabled,
    has_api_key: options.hasApiKey,
    default_layout_preset: options.defaultLayoutPreset,
  };
}

export function createAnalyticsApi(options: {
  client: PostHogCaptureClient | null;
  sharedProperties: Record<string, unknown>;
  analyticsEnabled: boolean;
}): AnalyticsApi {
  const { client, sharedProperties, analyticsEnabled } = options;

  const capture = (eventName: string, properties?: Record<string, unknown>) => {
    if (!client || !analyticsEnabled) return;

    const sanitized = sanitizeAnalyticsProperties({
      ...sharedProperties,
      ...properties,
    });

    client.capture(eventName, sanitized);
  };

  return {
    track: capture,
    trackError: (context) => {
      const errorDomain = context.errorDomain ?? inferErrorDomain(context.operation);
      const fingerprint = buildErrorFingerprint(context.operation, context.error);
      const dedupeKey = `${errorDomain}:${context.operation}:${fingerprint}`;

      if (!shouldTrackErrorOnce(dedupeKey)) {
        return;
      }

      capture('app error', {
        error_domain: errorDomain,
        operation: context.operation,
        handled: context.handled ?? true,
        source_component: context.sourceComponent ?? context.operation,
        fingerprint,
        ...context.properties,
      });
    },
    setAnalyticsEnabled: (enabled, runtimeOptions) => {
      if (!client) return;

      if (enabled) {
        client.opt_in_capturing({ captureEventName: false });
        client.identify(getOrCreateStableId());
        if (runtimeOptions?.capturePreferenceChange) {
          client.capture(
            'analytics preference changed',
            sanitizeAnalyticsProperties({
              ...sharedProperties,
              analytics_enabled: true,
              enabled: true,
            })
          );
        }
      } else {
        if (runtimeOptions?.capturePreferenceChange) {
          client.capture(
            'analytics preference changed',
            sanitizeAnalyticsProperties({
              ...sharedProperties,
              analytics_enabled: true,
              enabled: false,
            })
          );
        }
        clearStableId();
        client.reset();
        client.opt_out_capturing();
      }

      client.register({
        ...sharedProperties,
        analytics_enabled: enabled,
      });
    },
  };
}

export function resetAnalyticsErrorDedupeForTests() {
  recentErrorKeys.clear();
}

export function AnalyticsRuntimeProvider({ children }: { children: ReactNode }) {
  const posthog = usePostHog() as PostHogCaptureClient | undefined;
  const [settings] = useSettings();
  const hasApiKey = useHasApiKey();
  const capabilities = useMemo(() => getSafePlatformCapabilities(), []);

  const sharedProperties = useMemo(
    () =>
      createSharedProperties({
        analyticsEnabled: settings.privacy.analyticsEnabled,
        hasApiKey,
        defaultLayoutPreset: settings.ui.defaultLayoutPreset,
        capabilities,
      }),
    [capabilities, hasApiKey, settings.privacy.analyticsEnabled, settings.ui.defaultLayoutPreset]
  );

  const analytics = useMemo(
    () =>
      createAnalyticsApi({
        client: posthog ?? null,
        sharedProperties,
        analyticsEnabled: settings.privacy.analyticsEnabled,
      }),
    [posthog, settings.privacy.analyticsEnabled, sharedProperties]
  );

  const syncConsent = useCallback(
    (enabled: boolean) => {
      analytics.setAnalyticsEnabled(enabled);
    },
    [analytics]
  );

  useLayoutEffect(() => {
    runtimeAnalytics = analytics;
    return () => {
      if (runtimeAnalytics === analytics) {
        runtimeAnalytics = NOOP_ANALYTICS;
      }
    };
  }, [analytics]);

  useLayoutEffect(() => {
    if (!posthog) return;
    posthog.register(sharedProperties);
  }, [posthog, sharedProperties]);

  useLayoutEffect(() => {
    syncConsent(settings.privacy.analyticsEnabled);
  }, [settings.privacy.analyticsEnabled, syncConsent]);

  return <AnalyticsContext.Provider value={analytics}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics(): AnalyticsApi {
  return useContext(AnalyticsContext);
}

export function trackAnalyticsEvent(eventName: string, properties?: Record<string, unknown>) {
  runtimeAnalytics.track(eventName, properties);
}

export function trackAnalyticsError(context: AnalyticsErrorContext) {
  runtimeAnalytics.trackError(context);
}

export function setAnalyticsEnabled(
  enabled: boolean,
  options?: { capturePreferenceChange?: boolean }
) {
  runtimeAnalytics.setAnalyticsEnabled(enabled, options);
}

export function bucketCount(value: number, thresholds: number[]): string {
  for (const threshold of thresholds) {
    if (value <= threshold) {
      return `<=${threshold}`;
    }
  }

  return `>${thresholds[thresholds.length - 1]}`;
}
