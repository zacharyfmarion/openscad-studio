import { useEffect } from 'react';
import { Button } from './ui';
import { APP_VERSION } from '../constants/appInfo';

const REPOSITORY_URL = 'https://github.com/zacharyfmarion/openscad-studio';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="About OpenSCAD Studio"
      data-testid="about-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        role="document"
        className="flex w-full max-w-md flex-col items-center gap-4 rounded-2xl px-6 py-7 text-center"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.35)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex h-16 w-16 items-center justify-center rounded-2xl text-lg font-semibold"
          style={{
            backgroundColor: 'var(--bg-tertiary)',
            border: '1px solid var(--border-primary)',
            color: 'var(--text-primary)',
          }}
        >
          OS
        </div>
        <div>
          <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            OpenSCAD Studio
          </div>
          <div className="mt-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            v{APP_VERSION}
          </div>
        </div>
        <p className="text-sm leading-6" style={{ color: 'var(--text-secondary)' }}>
          A focused OpenSCAD editor for precise modeling, fast iteration, live preview, and optional
          AI assistance across web and desktop.
        </p>
        <div className="flex items-center gap-3">
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-primary)',
              color: 'var(--text-primary)',
            }}
          >
            View Repository
          </a>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
