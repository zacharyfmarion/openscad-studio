import '@ui/sentry';
import ReactDOM from 'react-dom/client';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import App from '@ui/App';
import {
  captureAppOpened,
  captureBootstrapError,
  initializePostHog,
} from '@ui/analytics/bootstrap';
import { shouldCaptureBootstrapAnalytics } from '@ui/analytics/bootstrapPolicy';
import { AnalyticsRuntimeProvider } from '@ui/analytics/runtime';
import { ErrorBoundary } from '@ui/components/ErrorBoundary';
import { ThemeProvider } from '@ui/contexts/ThemeContext';
import { captureSentryException } from '@ui/sentry';
import { parseShareContext } from '@ui/services/shareRouting';
import { initFormatter } from '@ui/utils/formatter';
import { initializePlatform } from '@ui/platform';
import { loadSettings } from '@ui/stores/settingsStore';
import '@ui/index.css';

const initialShareContext = parseShareContext(window.location.pathname, window.location.search);
if (initialShareContext) {
  window.__SHARE_CONTEXT = initialShareContext;
}
window.__SHARE_API_BASE = import.meta.env.VITE_SHARE_API_URL || window.location.origin;
window.__SHARE_ENABLED =
  import.meta.env.PROD || import.meta.env.VITE_ENABLE_PROD_SHARE_DEV === 'true';

// Prevent accidental tab close when there are unsaved changes.
// We import the store module at the top level (it's a singleton) and read
// state in the beforeunload handler. Registered here rather than in a React
// effect to guarantee it's never missed due to platform bridge timing.
import { getProjectState } from '@ui/stores/projectStore';

window.addEventListener('beforeunload', (e) => {
  try {
    const files = getProjectState().files;
    const anyDirty = Object.values(files).some((f) => f.content !== f.savedContent);
    if (anyDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  } catch {
    // Store not initialized yet — nothing to protect
  }
});

if (window.__UNSUPPORTED_BROWSER) {
  // eslint-disable-next-line no-console
  console.warn('[main] Browser unsupported — skipping app render');
} else {
  const analyticsEnabled = loadSettings().privacy.analyticsEnabled;
  const posthogReady = initializePostHog(posthog, { analyticsEnabled });
  const shouldCaptureBootstrapEvents = shouldCaptureBootstrapAnalytics(
    posthogReady,
    analyticsEnabled
  );

  initFormatter().catch((error) => {
    console.error('[main] Failed to initialize formatter:', error);
  });

  const root = ReactDOM.createRoot(document.getElementById('root')!);

  const renderApp = () =>
    root.render(
      <PostHogProvider client={posthog}>
        <ThemeProvider>
          <AnalyticsRuntimeProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </AnalyticsRuntimeProvider>
        </ThemeProvider>
      </PostHogProvider>
    );

  renderApp();

  initializePlatform()
    .then((platform) => {
      if (shouldCaptureBootstrapEvents) {
        captureAppOpened(posthog, {
          analyticsEnabled,
          capabilities: platform.capabilities,
        });
      }
    })
    .catch((error) => {
      captureSentryException(error, { tags: { phase: 'platform-init' } });

      if (shouldCaptureBootstrapEvents) {
        captureBootstrapError(posthog, error, {
          analyticsEnabled,
          operation: 'platform-init',
        });
      }
      console.error('[main] Failed to initialize platform:', error);
    });
}
