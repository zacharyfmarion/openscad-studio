import { useState, useEffect } from 'react';
import { Button } from './ui';
import { AiComposer } from './AiComposer';
import { useHasApiKey } from '../stores/apiKeyStore';
import type { AiDraft, AttachmentStore } from '../types/aiChat';

interface RecentFile {
  path: string;
  name: string;
  lastOpened: number;
}

interface WelcomeScreenProps {
  draft: AiDraft;
  attachments: AttachmentStore;
  draftErrors: string[];
  draftVisionBlockMessage?: string | null;
  draftVisionWarningMessage?: string | null;
  canSubmitDraft: boolean;
  isProcessingAttachments: boolean;
  onDraftTextChange: (text: string) => void;
  onDraftFilesSelected: (files: File[]) => void;
  onDraftRemoveAttachment: (attachmentId: string) => void;
  onStartWithDraft: (draftOverride?: AiDraft) => void;
  onStartManually: () => void;
  onOpenRecent: (path: string) => void;
  onOpenFile?: () => void;
  onOpenSettings?: () => void;
  showRecentFiles?: boolean;
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
  draft,
  attachments,
  draftErrors,
  draftVisionBlockMessage,
  draftVisionWarningMessage,
  canSubmitDraft,
  isProcessingAttachments,
  onDraftTextChange,
  onDraftFilesSelected,
  onDraftRemoveAttachment,
  onStartWithDraft,
  onStartManually,
  onOpenRecent,
  onOpenFile,
  onOpenSettings,
  showRecentFiles = true,
}: WelcomeScreenProps) {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const hasApiKey = useHasApiKey();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(RECENT_FILES_KEY);
      if (stored) {
        const files: RecentFile[] = JSON.parse(stored);
        files.sort((a, b) => b.lastOpened - a.lastOpened);
        setRecentFiles(files.slice(0, 3));
      }
    } catch (error) {
      console.error('Failed to load recent files:', error);
    }
  }, []);

  return (
    <div
      data-testid="welcome-screen"
      className="h-full flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-3xl space-y-8">
        <h1
          className="text-4xl font-bold text-center mb-8"
          style={{ color: 'var(--text-primary)' }}
        >
          What do you want to create?
        </h1>

        {hasApiKey ? (
          <div className="space-y-2">
            <AiComposer
              draft={draft}
              attachments={attachments}
              isProcessingAttachments={isProcessingAttachments}
              canSubmit={canSubmitDraft}
              blockedMessage={draftVisionBlockMessage}
              warningMessage={draftVisionWarningMessage}
              errors={draftErrors}
              placeholder="Describe what you want to build..."
              rows={3}
              variant="welcome"
              submitLabel="Build"
              submitTitle="Build"
              onTextChange={onDraftTextChange}
              onFilesSelected={onDraftFilesSelected}
              onRemoveAttachment={onDraftRemoveAttachment}
              onSubmit={onStartWithDraft}
            />
          </div>
        ) : hasApiKey === false ? (
          <div
            className="rounded-lg p-4 text-center"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-secondary)',
            }}
          >
            <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>
              Set up an API key to use the AI assistant
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  onOpenSettings?.();
                }}
                className="underline hover:no-underline"
                style={{ color: 'var(--accent-primary)' }}
              >
                Open Settings
              </a>{' '}
              to configure (⌘,)
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
            Try an example:
          </h3>
          <div className="flex flex-wrap gap-2">
            {EXAMPLE_PROMPTS.map((example) => (
              <button
                key={example}
                onClick={() => {
                  if (!hasApiKey) return;
                  onStartWithDraft({ text: example, attachmentIds: [] });
                }}
                disabled={!hasApiKey}
                className="px-3 py-1.5 rounded-lg text-sm transition-colors border"
                style={{
                  backgroundColor: 'var(--bg-secondary)',
                  color: hasApiKey ? 'var(--text-secondary)' : 'var(--text-tertiary)',
                  borderColor: 'var(--border-secondary)',
                  opacity: hasApiKey ? 1 : 0.5,
                  cursor: hasApiKey ? 'pointer' : 'not-allowed',
                }}
                title={!hasApiKey ? 'Configure an API key in Settings to use AI' : example}
              >
                {example}
              </button>
            ))}
          </div>
        </div>

        {showRecentFiles && recentFiles.length > 0 && (
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

// eslint-disable-next-line react-refresh/only-export-components
export function addToRecentFiles(path: string) {
  try {
    const stored = localStorage.getItem(RECENT_FILES_KEY);
    const files: RecentFile[] = stored ? JSON.parse(stored) : [];
    const fileName = path.split('/').pop() || path;

    const existingIndex = files.findIndex((file) => file.path === path);
    if (existingIndex !== -1) {
      files[existingIndex].lastOpened = Date.now();
    } else {
      files.push({
        path,
        name: fileName,
        lastOpened: Date.now(),
      });
    }

    localStorage.setItem(RECENT_FILES_KEY, JSON.stringify(files));
  } catch (error) {
    console.error('Failed to save recent file:', error);
  }
}
