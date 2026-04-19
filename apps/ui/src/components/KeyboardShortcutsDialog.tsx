import { useEffect } from 'react';
import { Button } from './ui';
import { SHORTCUT_REGISTRY } from '../shortcuts/registry';
import { groupShortcutsByCategory } from '../shortcuts/formatDisplay';

interface KeyboardShortcutsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function KeyboardShortcutsDialog({ isOpen, onClose }: KeyboardShortcutsDialogProps) {
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

  const categories = groupShortcutsByCategory(SHORTCUT_REGISTRY);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      data-testid="keyboard-shortcuts-dialog"
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.45)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        role="document"
        className="flex w-full max-w-3xl flex-col overflow-hidden rounded-2xl"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          boxShadow: '0 20px 48px rgba(0, 0, 0, 0.35)',
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-6 py-5"
          style={{ borderBottom: '1px solid var(--border-subtle)' }}
        >
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Keyboard Shortcuts
            </div>
            <p className="mt-1 text-xs" style={{ color: 'var(--text-secondary)' }}>
              Shared app shortcuts adapted from Cascade for OpenSCAD Studio.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid gap-6 overflow-y-auto px-6 py-6 md:grid-cols-2">
          {categories.map((category) => (
            <section key={category.title} className="flex flex-col gap-3">
              <div
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'var(--text-tertiary)' }}
              >
                {category.title}
              </div>
              <div
                className="rounded-xl px-3 py-2"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {category.items.map((item) => (
                  <div
                    key={item.action}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    <span>{item.action}</span>
                    <kbd
                      className="rounded-md px-2 py-1 text-xs font-medium"
                      style={{
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-primary)',
                        color: 'var(--text-primary)',
                        minWidth: '3.25rem',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.shortcut}
                    </kbd>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
