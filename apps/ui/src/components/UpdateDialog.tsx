import { type Update } from '@tauri-apps/plugin-updater';
import { Button } from './ui';

interface UpdateDialogProps {
  isOpen: boolean;
  update: Update | null;
  isDownloading: boolean;
  downloadProgress: number;
  onInstall: () => void;
  onDismiss: () => void;
}

export function UpdateDialog({
  isOpen,
  update,
  isDownloading,
  downloadProgress,
  onInstall,
  onDismiss,
}: UpdateDialogProps) {
  if (!isOpen || !update) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Update Available
        </h2>

        <div className="mb-4" style={{ color: 'var(--text-secondary)' }}>
          <p className="mb-2">A new version of OpenSCAD Studio is available!</p>
          <p className="text-sm">
            <strong>Version:</strong> {update.version}
          </p>
          {update.body && (
            <div
              className="mt-3 p-3 rounded text-sm max-h-48 overflow-y-auto"
              style={{ backgroundColor: 'var(--bg-tertiary)' }}
            >
              <strong>What's new:</strong>
              <div className="mt-1 whitespace-pre-wrap">{update.body}</div>
            </div>
          )}
        </div>

        {isDownloading && (
          <div className="mb-4">
            <div className="w-full rounded-full h-2" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
              <div
                className="h-2 rounded-full transition-all"
                style={{
                  width: `${downloadProgress}%`,
                  backgroundColor: 'var(--accent-primary)',
                }}
              />
            </div>
            <p className="text-sm mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Downloading... {Math.round(downloadProgress)}%
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onDismiss} disabled={isDownloading}>
            Later
          </Button>
          <Button variant="primary" onClick={onInstall} disabled={isDownloading}>
            {isDownloading ? 'Installing...' : 'Install & Restart'}
          </Button>
        </div>
      </div>
    </div>
  );
}
