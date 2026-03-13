import ReactDOM from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ThemeProvider } from './contexts/ThemeContext';
import { initFormatter } from './utils/formatter';
import { initializePlatform } from './platform';
import './index.css';

function renderApp() {
  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
    <ThemeProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </ThemeProvider>
  );
}

function renderBootstrapError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
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
        <h1 style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>OpenSCAD Studio could not start</h1>
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

Promise.all([initFormatter(), initializePlatform()])
  .then(() => {
    renderApp();
  })
  .catch((error) => {
    console.error('[main] Failed to initialize application:', error);
    renderBootstrapError(error);
  });
