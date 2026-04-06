/* eslint-disable react-refresh/only-export-components */

import './sentry';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import ReactDOM from 'react-dom/client';
import posthog from 'posthog-js';
import { PostHogProvider } from '@posthog/react';
import App from './App';
import { captureAppOpened, captureBootstrapError, initializePostHog } from './analytics/bootstrap';
import { shouldCaptureBootstrapAnalytics } from './analytics/bootstrapPolicy';
import { AnalyticsRuntimeProvider } from './analytics/runtime';
import { Button } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { getPlatform, initializePlatform } from './platform';
import {
  consumeDesktopBootstrapLaunchIntent,
  initializeDesktopMcpBridge,
  reportDesktopWindowOpenResult,
  syncDesktopMcpWindowContext,
  type DesktopWindowLaunchIntent,
  type DesktopWindowOpenRequest,
} from './services/desktopMcp';
import { openFileInWindow, openWorkspaceFolderInWindow } from './services/windowOpenService';
import { captureSentryException } from './sentry';
import { getProjectState } from './stores/projectStore';
import { loadSettings } from './stores/settingsStore';
import { workspaceStore } from './stores/workspaceStore';
import { initFormatter } from './utils/formatter';
import './index.css';

type BootstrapWindowMode =
  | 'booting'
  | 'welcome'
  | 'opening_folder'
  | 'opening_file'
  | 'ready'
  | 'open_failed';

interface BootstrapWindowState {
  mode: BootstrapWindowMode;
  targetPath?: string | null;
  errorMessage?: string | null;
  failedRequest?: DesktopWindowOpenRequest | null;
}

const INITIAL_WINDOW_STATE: BootstrapWindowState = {
  mode: 'booting',
  targetPath: null,
  errorMessage: null,
  failedRequest: null,
};

function renderLoadingScreen(
  title = 'Starting OpenSCAD Studio',
  body = 'Loading the editor and desktop services for this window.'
) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #002b36)',
        color: 'var(--text-primary, #eee8d5)',
        padding: '2rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '420px',
          width: '100%',
          padding: '2rem',
          borderRadius: '1rem',
          background: 'rgba(7, 54, 66, 0.75)',
          border: '1px solid rgba(131, 148, 150, 0.35)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: '2rem',
            height: '2rem',
            margin: '0 auto 1rem',
            borderRadius: '999px',
            border: '2px solid rgba(131, 148, 150, 0.35)',
            borderTopColor: '#268bd2',
            animation: 'spin 1s linear infinite',
          }}
        />
        <h1 style={{ fontSize: '1.5rem', marginBottom: '0.75rem' }}>{title}</h1>
        <p style={{ lineHeight: 1.6, color: '#93a1a1', whiteSpace: 'pre-wrap' }}>{body}</p>
      </div>
    </div>
  );
}

function renderBootstrapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #002b36)',
        color: 'var(--text-primary, #eee8d5)',
        padding: '2rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          padding: '2rem',
          borderRadius: '1rem',
          background: 'rgba(7, 54, 66, 0.75)',
          border: '1px solid rgba(131, 148, 150, 0.35)',
        }}
      >
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>
          OpenSCAD Studio could not start
        </h1>
        <p style={{ lineHeight: 1.6, marginBottom: '1rem', color: '#93a1a1' }}>
          A required startup step failed, so the app cannot safely continue.
        </p>
        <pre
          style={{
            background: '#073642',
            color: '#cb4b16',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            fontSize: '0.8125rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            marginBottom: '1.5rem',
          }}
        >
          {message}
        </pre>
        <Button
          type="button"
          onClick={() => window.location.reload()}
          variant="primary"
          style={{
            padding: '0.625rem 1.5rem',
            borderRadius: 'var(--radius-md, 8px)',
            fontSize: '0.9375rem',
            fontWeight: 600,
          }}
        >
          Reload
        </Button>
      </div>
    </div>
  );
}

function renderOpenFailureScreen(args: {
  state: BootstrapWindowState;
  onRetry: () => void;
  onOpenFolder: () => void;
  onOpenFile: () => void;
  onGoToWelcome: () => void;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg-primary, #002b36)',
        color: 'var(--text-primary, #eee8d5)',
        padding: '2rem',
        fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '560px',
          width: '100%',
          padding: '2rem',
          borderRadius: '1rem',
          background: 'rgba(7, 54, 66, 0.75)',
          border: '1px solid rgba(131, 148, 150, 0.35)',
        }}
      >
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>
          Couldn&apos;t open this workspace
        </h1>
        {args.state.targetPath ? (
          <p style={{ lineHeight: 1.6, marginBottom: '0.75rem', color: '#93a1a1' }}>
            Target: {args.state.targetPath}
          </p>
        ) : null}
        <pre
          style={{
            background: '#073642',
            color: '#cb4b16',
            padding: '0.75rem 1rem',
            borderRadius: '0.5rem',
            fontSize: '0.8125rem',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            marginBottom: '1.5rem',
          }}
        >
          {args.state.errorMessage ?? 'Failed to open the requested target.'}
        </pre>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Button type="button" onClick={args.onRetry} variant="primary" style={primaryButtonStyle}>
            Retry
          </Button>
          <Button
            type="button"
            onClick={args.onOpenFolder}
            variant="secondary"
            style={secondaryButtonStyle}
          >
            Open Folder
          </Button>
          <Button
            type="button"
            onClick={args.onOpenFile}
            variant="secondary"
            style={secondaryButtonStyle}
          >
            Open File
          </Button>
          <Button
            type="button"
            onClick={args.onGoToWelcome}
            variant="secondary"
            style={secondaryButtonStyle}
          >
            Go to Welcome
          </Button>
        </div>
      </div>
    </div>
  );
}

const primaryButtonStyle: CSSProperties = {
  padding: '0.625rem 1.5rem',
  background: '#268bd2',
  color: '#002b36',
  border: 'none',
  borderRadius: 'var(--radius-md, 8px)',
  fontSize: '0.9375rem',
  fontWeight: 600,
  cursor: 'pointer',
};

const secondaryButtonStyle: CSSProperties = {
  padding: '0.625rem 1.5rem',
  background: '#073642',
  color: '#eee8d5',
  border: '1px solid rgba(131, 148, 150, 0.35)',
  borderRadius: 'var(--radius-md, 8px)',
  fontSize: '0.9375rem',
  fontWeight: 500,
  cursor: 'pointer',
};

function intentToRequest(intent: DesktopWindowLaunchIntent): DesktopWindowOpenRequest | null {
  switch (intent.kind) {
    case 'welcome':
      return null;
    case 'open_folder':
      return {
        kind: 'open_folder',
        folder_path: intent.folder_path,
        create_if_empty: intent.create_if_empty,
      };
    case 'open_file':
      return {
        kind: 'open_file',
        file_path: intent.file_path,
      };
  }
}

function normalizeErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function BootstrapApp() {
  const [startupError, setStartupError] = useState<unknown>(null);
  const [platformReady, setPlatformReady] = useState(false);
  const [windowState, setWindowState] = useState<BootstrapWindowState>(INITIAL_WINDOW_STATE);
  const [bridgeReady, setBridgeReady] = useState(false);
  const activeRequestRef = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);

  const syncWindowContext = useCallback(
    async (
      nextState: BootstrapWindowState,
      args?: {
        requestId?: string | null;
        workspaceRoot?: string | null;
        renderTargetPath?: string | null;
      }
    ) => {
      if (!bridgeReady || !getPlatform().capabilities.hasFileSystem) {
        return;
      }

      const projectState = getProjectState();
      await syncDesktopMcpWindowContext({
        title: document.title || 'OpenSCAD Studio',
        workspaceRoot: args?.workspaceRoot ?? projectState.projectRoot,
        renderTargetPath: args?.renderTargetPath ?? projectState.renderTargetPath,
        showWelcome: nextState.mode === 'welcome',
        mode:
          nextState.mode === 'welcome'
            ? 'welcome'
            : nextState.mode === 'open_failed'
              ? 'open_failed'
              : nextState.mode === 'ready'
                ? 'ready'
                : 'opening',
        pendingRequestId: args?.requestId ?? null,
      });
    },
    [bridgeReady]
  );

  const runOpenRequest = useCallback(
    async (
      request: DesktopWindowOpenRequest,
      options: {
        requestId?: string;
        reportResult?: boolean;
      } = {}
    ) => {
      const key =
        request.kind === 'open_folder'
          ? `folder:${request.folder_path}`
          : `file:${request.file_path}`;

      if (activeRequestRef.current) {
        if (activeRequestRef.current.key === key) {
          await activeRequestRef.current.promise;
          return;
        }

        const busyMessage = 'This window is already opening another target.';
        if (options.reportResult && options.requestId) {
          await reportDesktopWindowOpenResult({
            requestId: options.requestId,
            success: false,
            message: busyMessage,
          });
        }
        setWindowState((state) => ({
          ...state,
          mode: 'open_failed',
          errorMessage: busyMessage,
          failedRequest: request,
          targetPath: request.kind === 'open_folder' ? request.folder_path : request.file_path,
        }));
        return;
      }

      const nextWindowState: BootstrapWindowState = {
        mode: request.kind === 'open_folder' ? 'opening_folder' : 'opening_file',
        targetPath: request.kind === 'open_folder' ? request.folder_path : request.file_path,
        errorMessage: null,
        failedRequest: null,
      };
      setWindowState(nextWindowState);
      await syncWindowContext(nextWindowState, {
        requestId: options.requestId ?? null,
        workspaceRoot: null,
        renderTargetPath: null,
      });

      const promise = (async () => {
        try {
          if (request.kind === 'open_folder') {
            const result = await openWorkspaceFolderInWindow(request.folder_path, {
              createIfEmpty: request.create_if_empty,
            });
            const readyState: BootstrapWindowState = {
              mode: 'ready',
              targetPath: null,
              errorMessage: null,
              failedRequest: null,
            };
            setWindowState(readyState);
            await syncWindowContext(readyState, {
              workspaceRoot: result.workspaceRoot,
              renderTargetPath: result.renderTargetPath,
            });
            if (options.reportResult && options.requestId) {
              const action = result.createdDefaultFile ? 'Created' : 'Opened';
              await reportDesktopWindowOpenResult({
                requestId: options.requestId,
                success: true,
                message: `✅ ${action} workspace at ${request.folder_path}.\n\nRender target: ${result.renderTargetPath}`,
                openedWorkspaceRoot: result.workspaceRoot,
              });
            }
            return;
          }

          const fileResult = await getPlatform().fileRead(request.file_path);
          if (!fileResult) {
            throw new Error(`Could not read file at ${request.file_path}.`);
          }
          const result = await openFileInWindow(fileResult);
          const readyState: BootstrapWindowState = {
            mode: 'ready',
            targetPath: null,
            errorMessage: null,
            failedRequest: null,
          };
          setWindowState(readyState);
          await syncWindowContext(readyState, {
            workspaceRoot: result.projectRoot,
            renderTargetPath: result.projectPath,
          });
          if (options.reportResult && options.requestId) {
            await reportDesktopWindowOpenResult({
              requestId: options.requestId,
              success: true,
              message: `✅ Opened file at ${request.file_path}.`,
              openedFilePath: request.file_path,
            });
          }
        } catch (error) {
          const message = normalizeErrorMessage(error, 'Failed to open the requested target.');
          const failedState: BootstrapWindowState = {
            mode: 'open_failed',
            targetPath: request.kind === 'open_folder' ? request.folder_path : request.file_path,
            errorMessage: message,
            failedRequest: request,
          };
          setWindowState(failedState);
          await syncWindowContext(failedState, {
            workspaceRoot: null,
            renderTargetPath: null,
          });
          if (options.reportResult && options.requestId) {
            await reportDesktopWindowOpenResult({
              requestId: options.requestId,
              success: false,
              message,
            });
          }
        }
      })();

      activeRequestRef.current = { key, promise };
      try {
        await promise;
      } finally {
        if (activeRequestRef.current?.promise === promise) {
          activeRequestRef.current = null;
        }
      }
    },
    [syncWindowContext]
  );

  useEffect(() => {
    let cancelled = false;
    let bridgeCleanup: (() => void) | null = null;

    void initializePlatform()
      .then(async (platform) => {
        if (cancelled) return;

        if (shouldCaptureBootstrapEvents) {
          captureAppOpened(posthog, {
            analyticsEnabled,
            capabilities: platform.capabilities,
          });
        }

        setPlatformReady(true);
        void initFormatter().catch((error) => {
          captureSentryException(error, { tags: { phase: 'formatter-init' } });
          console.warn('[main] Formatter warmup failed:', error);
        });

        if (platform.capabilities.hasFileSystem) {
          bridgeCleanup = await initializeDesktopMcpBridge({
            onOpenRequest: async (payload) => {
              await runOpenRequest(payload.request, {
                requestId: payload.requestId,
                reportResult: true,
              });
            },
          });
          if (cancelled) {
            bridgeCleanup?.();
            return;
          }
          setBridgeReady(true);
        }

        const launchIntent = consumeDesktopBootstrapLaunchIntent();
        if (launchIntent) {
          const request = intentToRequest(launchIntent);
          if (request) {
            await runOpenRequest(request, {
              requestId: launchIntent.kind === 'welcome' ? undefined : launchIntent.request_id,
              reportResult: launchIntent.kind !== 'welcome',
            });
            return;
          }
        }

        const welcomeState: BootstrapWindowState = {
          mode: 'welcome',
          targetPath: null,
          errorMessage: null,
          failedRequest: null,
        };
        setWindowState(welcomeState);
        if (platform.capabilities.hasFileSystem) {
          await syncDesktopMcpWindowContext({
            title: document.title || 'OpenSCAD Studio',
            workspaceRoot: null,
            renderTargetPath: null,
            showWelcome: true,
            mode: 'welcome',
          });
        }
      })
      .catch((error) => {
        if (cancelled) return;

        captureSentryException(error, { tags: { phase: 'startup' } });
        if (shouldCaptureBootstrapEvents) {
          captureBootstrapError(posthog, error, {
            analyticsEnabled,
            capabilities: undefined,
            operation: 'startup',
          });
        }
        console.error('[main] Failed to initialize application:', error);
        setStartupError(error);
      });

    return () => {
      cancelled = true;
      bridgeCleanup?.();
    };
  }, [runOpenRequest]);

  const handleRetry = useCallback(() => {
    const failedRequest = windowState.failedRequest;
    if (!failedRequest) {
      return;
    }
    void runOpenRequest(failedRequest);
  }, [runOpenRequest, windowState.failedRequest]);

  const handleOpenFolder = useCallback(() => {
    const platform = getPlatform();
    void platform.pickDirectory().then((dirPath) => {
      if (!dirPath) {
        return;
      }
      void runOpenRequest({
        kind: 'open_folder',
        folder_path: dirPath,
        create_if_empty: true,
      });
    });
  }, [runOpenRequest]);

  const handleOpenFile = useCallback(() => {
    void getPlatform()
      .fileOpen([{ name: 'OpenSCAD Files', extensions: ['scad'] }])
      .then((result) => {
        if (!result?.path) {
          return;
        }
        void runOpenRequest({
          kind: 'open_file',
          file_path: result.path,
        });
      });
  }, [runOpenRequest]);

  const handleGoToWelcome = useCallback(() => {
    workspaceStore.getState().resetWorkspace();
    const welcomeState: BootstrapWindowState = {
      mode: 'welcome',
      targetPath: null,
      errorMessage: null,
      failedRequest: null,
    };
    setWindowState(welcomeState);
    void syncWindowContext(welcomeState, {
      workspaceRoot: null,
      renderTargetPath: null,
    });
  }, [syncWindowContext]);

  if (startupError) {
    return renderBootstrapError(startupError);
  }

  if (!platformReady || windowState.mode === 'booting') {
    return renderLoadingScreen();
  }

  if (windowState.mode === 'opening_folder') {
    return renderLoadingScreen('Opening workspace...', windowState.targetPath ?? '');
  }

  if (windowState.mode === 'opening_file') {
    return renderLoadingScreen('Opening file...', windowState.targetPath ?? '');
  }

  if (windowState.mode === 'open_failed') {
    return renderOpenFailureScreen({
      state: windowState,
      onRetry: handleRetry,
      onOpenFolder: handleOpenFolder,
      onOpenFile: handleOpenFile,
      onGoToWelcome: handleGoToWelcome,
    });
  }

  return (
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
}

const analyticsEnabled = loadSettings().privacy.analyticsEnabled;
window.__SHARE_API_BASE = import.meta.env.VITE_SHARE_API_URL || 'https://openscad-studio.pages.dev';
window.__SHARE_ENABLED =
  import.meta.env.PROD || import.meta.env.VITE_ENABLE_PROD_SHARE_DEV === 'true';
const posthogReady = initializePostHog(posthog, { analyticsEnabled });
const shouldCaptureBootstrapEvents = shouldCaptureBootstrapAnalytics(
  posthogReady,
  analyticsEnabled
);

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(<BootstrapApp />);
