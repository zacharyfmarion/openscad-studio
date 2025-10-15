import { useState } from 'react';
import { Button } from './ui';

interface OpenScadSetupScreenProps {
  onRetry: () => void;
  onSkip: () => void;
}

export function OpenScadSetupScreen({ onRetry, onSkip }: OpenScadSetupScreenProps) {
  const [platform] = useState(() => {
    const ua = navigator.userAgent.toLowerCase();
    if (ua.includes('mac')) return 'mac';
    if (ua.includes('win')) return 'windows';
    if (ua.includes('linux')) return 'linux';
    return 'unknown';
  });

  return (
    <div className="h-screen flex flex-col items-center justify-center px-8" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <div className="w-full max-w-2xl space-y-8">
        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-20 h-20 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--bg-elevated)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
              <line x1="12" y1="22.08" x2="12" y2="12"/>
            </svg>
          </div>
        </div>

        {/* Main heading */}
        <div className="text-center space-y-3">
          <h1 className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
            OpenSCAD Not Found
          </h1>
          <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
            OpenSCAD Studio needs OpenSCAD installed to render your 3D models.
            <br />
            Don't worry — it's quick and free!
          </p>
        </div>

        {/* Installation instructions */}
        <div className="rounded-lg p-6 space-y-4" style={{ backgroundColor: 'var(--bg-elevated)', borderColor: 'var(--border-primary)', borderWidth: '1px', borderStyle: 'solid' }}>
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            How to install OpenSCAD
          </h2>

          {platform === 'mac' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Step 1: Install OpenSCAD with Homebrew
                </p>
                <div className="rounded p-3 font-mono text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                  brew install openscad
                </div>
              </div>

              <div className="space-y-2 p-3 rounded" style={{ backgroundColor: 'rgba(255, 193, 7, 0.1)', borderColor: 'rgba(255, 193, 7, 0.3)', borderWidth: '1px', borderStyle: 'solid' }}>
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  ⚠️ If macOS blocks OpenSCAD ("cannot verify")
                </p>
                <ol className="text-sm space-y-1 ml-4 list-decimal" style={{ color: 'var(--text-tertiary)' }}>
                  <li>Open System Settings → Privacy & Security</li>
                  <li>Scroll down and click "Open Anyway" next to OpenSCAD</li>
                  <li>Or run this command in Terminal:</li>
                </ol>
                <div className="rounded p-2 font-mono text-xs mt-2" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                  xattr -cr /Applications/OpenSCAD-2021.01.app
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Alternative: Download from website
                </p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Visit{' '}
                  <a
                    href="https://openscad.org/downloads.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    openscad.org/downloads.html
                  </a>
                  {' '}and download the macOS version (you may still need to run the xattr command above)
                </p>
              </div>
            </div>
          )}

          {platform === 'windows' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Option 1: Install with Chocolatey
                </p>
                <div className="rounded p-3 font-mono text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                  choco install openscad
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Option 2: Download installer
                </p>
                <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                  Visit{' '}
                  <a
                    href="https://openscad.org/downloads.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline"
                    style={{ color: 'var(--accent-primary)' }}
                  >
                    openscad.org/downloads.html
                  </a>
                  {' '}and download the Windows installer
                </p>
              </div>
            </div>
          )}

          {platform === 'linux' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <p className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
                  Install with your package manager
                </p>
                <div className="space-y-2">
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Ubuntu/Debian:</p>
                    <div className="rounded p-3 font-mono text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                      sudo apt install openscad
                    </div>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Fedora:</p>
                    <div className="rounded p-3 font-mono text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                      sudo dnf install openscad
                    </div>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: 'var(--text-tertiary)' }}>Arch:</p>
                    <div className="rounded p-3 font-mono text-sm" style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
                      sudo pacman -S openscad
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {platform === 'unknown' && (
            <div className="space-y-2">
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>
                Visit{' '}
                <a
                  href="https://openscad.org/downloads.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                  style={{ color: 'var(--accent-primary)' }}
                >
                  openscad.org/downloads.html
                </a>
                {' '}to download OpenSCAD for your platform
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-center gap-4">
          <Button
            variant="secondary"
            onClick={onSkip}
            className="text-sm"
          >
            Skip for now
          </Button>
          <Button
            variant="primary"
            onClick={onRetry}
            className="text-sm"
          >
            I've installed it — Try again
          </Button>
        </div>

        {/* Help text */}
        <div className="text-center">
          <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            After installing, restart this app or click "Try again"
          </p>
        </div>
      </div>
    </div>
  );
}
