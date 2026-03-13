import { Component, type ReactNode } from 'react';
import { notifyError } from '../utils/notifications';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    notifyError({
      operation: 'app-crash',
      error,
      fallbackMessage: 'OpenSCAD Studio hit an unexpected error',
      logLabel: '[ErrorBoundary] App crash',
    });
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#002b36',
          color: '#839496',
          fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
          padding: '2rem',
        }}
      >
        <div style={{ maxWidth: 520, textAlign: 'center' }}>
          <div
            style={{
              fontSize: '2rem',
              fontWeight: 700,
              color: '#eee8d5',
              marginBottom: '0.75rem',
            }}
          >
            Something went wrong
          </div>
          <p style={{ lineHeight: 1.6, marginBottom: '1rem' }}>
            OpenSCAD Studio encountered an unexpected error and couldn&rsquo;t recover.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: '#073642',
                color: '#cb4b16',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '0.8125rem',
                textAlign: 'left',
                overflowX: 'auto',
                marginBottom: '1.5rem',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <p style={{ lineHeight: 1.6, marginBottom: '2rem', fontSize: '0.875rem' }}>
            This app requires a modern browser with WebAssembly support (Chrome, Edge, or Firefox
            recommended).
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '0.625rem 1.5rem',
              background: '#268bd2',
              color: '#002b36',
              border: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.9375rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}

/**
 * Lightweight error boundary for isolating component-level failures (e.g. WebGL crashes).
 * Shows a friendly inline message instead of taking down the entire app.
 */
interface InlineErrorBoundaryProps {
  children: ReactNode;
  fallbackMessage?: string;
}

interface InlineErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class InlineErrorBoundary extends Component<
  InlineErrorBoundaryProps,
  InlineErrorBoundaryState
> {
  state: InlineErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): InlineErrorBoundaryState {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div
        data-testid="component-error"
        className="w-full h-full flex items-center justify-center"
        style={{ backgroundColor: 'var(--bg-primary, #002b36)' }}
      >
        <div className="text-center p-6 max-w-md">
          <p
            className="font-semibold text-lg mb-2"
            style={{ color: 'var(--text-primary, #eee8d5)' }}
          >
            {this.props.fallbackMessage || 'This component failed to render'}
          </p>
          {this.state.error && (
            <p
              className="text-sm mb-4 break-words"
              style={{ color: 'var(--color-error, #cb4b16)' }}
            >
              {this.state.error.message}
            </p>
          )}
          <button
            type="button"
            onClick={this.handleRetry}
            className="px-4 py-2 rounded text-sm font-medium"
            style={{
              background: 'var(--accent-primary, #268bd2)',
              color: 'var(--text-inverse, #002b36)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
}

interface PanelErrorBoundaryProps {
  panelId: string;
  panelName: string;
  children: ReactNode;
  onReset?: () => void | Promise<void>;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  resetCounter: number;
  isResetting: boolean;
  resetError: string | null;
}

export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = {
    hasError: false,
    error: null,
    resetCounter: 0,
    isResetting: false,
    resetError: null,
  };

  static getDerivedStateFromError(error: Error): Partial<PanelErrorBoundaryState> {
    return {
      hasError: true,
      error,
      isResetting: false,
      resetError: null,
    };
  }

  componentDidCatch(error: Error) {
    notifyError({
      operation: `${this.props.panelName.toLowerCase()}-panel-crash`,
      error,
      fallbackMessage: `${this.props.panelName} crashed`,
      toastId: `panel-crash:${this.props.panelId}`,
      logLabel: `[PanelErrorBoundary] ${this.props.panelName} crashed`,
    });
  }

  handleRetry = async () => {
    this.setState({ isResetting: true, resetError: null });

    try {
      await this.props.onReset?.();
      this.setState((prev) => ({
        hasError: false,
        error: null,
        resetCounter: prev.resetCounter + 1,
        isResetting: false,
        resetError: null,
      }));
    } catch (error) {
      this.setState({
        isResetting: false,
        resetError: error instanceof Error ? error.message : String(error),
      });
    }
  };

  render() {
    if (!this.state.hasError) {
      return <div key={this.state.resetCounter} className="h-full">{this.props.children}</div>;
    }

    return (
      <div
        data-testid={`panel-error-${this.props.panelId}`}
        className="w-full h-full flex items-center justify-center px-6"
        style={{ backgroundColor: 'var(--bg-primary)' }}
      >
        <div
          className="max-w-md w-full rounded-lg border p-5 space-y-3"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            borderColor: 'var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        >
          <div>
            <div className="text-lg font-semibold">{this.props.panelName} crashed</div>
            <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
              You can reload this panel without restarting the app.
            </p>
          </div>

          {this.state.error && (
            <div
              className="rounded-md px-3 py-2 text-sm"
              style={{
                backgroundColor: 'rgba(220, 50, 47, 0.1)',
                border: '1px solid rgba(220, 50, 47, 0.3)',
                color: 'var(--color-error)',
              }}
            >
              {this.state.error.message}
            </div>
          )}

          {this.state.resetError && (
            <div className="text-sm" style={{ color: 'var(--color-error)' }}>
              Retry failed: {this.state.resetError}
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              void this.handleRetry();
            }}
            disabled={this.state.isResetting}
            className="px-4 py-2 rounded text-sm font-medium"
            style={{
              backgroundColor: 'var(--accent-primary)',
              color: 'var(--text-inverse)',
              border: 'none',
              cursor: this.state.isResetting ? 'wait' : 'pointer',
              opacity: this.state.isResetting ? 0.7 : 1,
            }}
          >
            {this.state.isResetting ? 'Reloading...' : 'Reload Panel'}
          </button>
        </div>
      </div>
    );
  }
}
