import { useState, useRef, useEffect } from 'react';
import { Button } from './ui';

interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

interface WelcomeScreenProps {
  onStartWithPrompt: (prompt: string) => void;
  onStartManually: () => void;
  onOpenRecent: (path: string) => void;
  onOpenFile?: () => void;
}

const EXAMPLE_PROMPTS = [
  'Create a 3D printable mini lamp',
  'Design a parametric phone stand',
  'Make a custom gear with 20 teeth',
  'Create a simple mounting bracket',
  'Design a pencil holder with holes',
];

const RECENT_FILES_KEY = 'openscad-studio-recent-files';

export function WelcomeScreen({
  onStartWithPrompt,
  onStartManually,
  onOpenRecent,
  onOpenFile,
}: WelcomeScreenProps) {
  const [prompt, setPrompt] = useState('');
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load recent files from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_FILES_KEY);
      if (stored) {
        const files: RecentFile[] = JSON.parse(stored);
        // Sort by last opened, most recent first
        files.sort((a, b) => b.lastOpened - a.lastOpened);
        setRecentFiles(files.slice(0, 3)); // Show max 3 recent files
      }
    } catch (err) {
      console.error('Failed to load recent files:', err);
    }
  }, []);

  const handleSubmit = () => {
    if (!prompt.trim()) return;
    onStartWithPrompt(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div
      className="h-full flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-3xl space-y-8">
        {/* Main heading */}
        <h1
          className="text-4xl font-bold text-center mb-8"
          style={{ color: 'var(--text-primary)' }}
        >
          What do you want to create?
        </h1>

        {/* Main input */}
        <div className="space-y-2">
          <div className="relative">
            <textarea
              ref={inputRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe your OpenSCAD project..."
              className="w-full rounded-lg px-4 py-3 resize-none focus:outline-none focus:ring-2 text-base"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color: 'var(--text-primary)',
                borderColor: 'var(--border-secondary)',
                borderWidth: '1px',
                borderStyle: 'solid',
                minHeight: '120px',
                paddingRight: prompt.trim() ? '3rem' : '1rem',
              }}
              rows={4}
            />
            {prompt.trim() && (
              <button
                onClick={handleSubmit}
                className="absolute right-3 bottom-3 p-2 rounded-lg transition-colors"
                style={{
                  backgroundColor: 'var(--accent-primary)',
                  color: 'var(--text-inverse)',
                }}
                title="Start with AI (⌘↵)"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                </svg>
              </button>
            )}
          </div>
          {/* Keyboard hint */}
          {prompt.trim() && (
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Press <span className="font-medium">⌘↵</span> to start with AI
            </div>
          )}
        </div>

        {/* Example prompts */}
        <div className="space-y-3">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Try an example:
          </h3>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example, idx) => (
              <button
                key={idx}
                onClick={() => onStartWithPrompt(example)}
                className="px-3 py-1.5 rounded-lg text-sm transition-colors border"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: 'var(--text-secondary)',
                  borderColor: 'var(--border-secondary)',
                }}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {/* Recent files */}
        {recentFiles.length > 0 && (
          <div className="space-y-3 pt-4">
            <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              Recent files:
            </h3>
            <div className="space-y-2">
              {recentFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => onOpenRecent(file.path)}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors border flex items-center justify-between group"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="text-lg">📄</div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {file.name}
                      </div>
                      <div
                        className="text-xs truncate"
                        style={{ color: 'var(--text-tertiary)' }}
                        title={file.path}
                      >
                        {file.path}
                      </div>
                    </div>
                  </div>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    style={{ color: 'var(--text-tertiary)' }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex justify-center gap-4 pt-4">
          {onOpenFile && (
            <Button variant="secondary" onClick={onOpenFile} className="text-sm">
              Open File
            </Button>
          )}
          <Button variant="ghost" onClick={onStartManually} className="text-sm">
            Start with empty project →
          </Button>
        </div>
      </div>
    </div>
  );
}

// Helper function to add a file to recent files
// eslint-disable-next-line react-refresh/only-export-components
export function addToRecentFiles(path: string) {
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    let files: RecentFile[] = stored ? JSON.parse(stored) : [];

    // Remove if already exists
    files = files.filter((f) => f.path !== path);

    // Add to front
    const name = path.split('/').pop() || path;
    files.unshift({
      path,
      name,
      lastOpened: Date.now(),
    });

    // Keep max 10 recent files
    files = files.slice(0, 10);

    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  } catch (err) {
    console.error('Failed to save recent file:', err);
  }
}
