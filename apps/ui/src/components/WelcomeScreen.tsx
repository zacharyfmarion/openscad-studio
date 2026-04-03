import { useState, useEffect, useMemo } from 'react';
import type { ModelSelectionSurface } from '../analytics/runtime';
import { Button, Text } from './ui';
import { AiComposer } from './AiComposer';
import { ModelSelector } from './ModelSelector';
import { TbFileText, TbFolder, TbFolderOpen } from 'react-icons/tb';
import { getPlatform } from '../platform';
import { useHasApiKey } from '../stores/apiKeyStore';
import type { AiDraft, AttachmentStore } from '../types/aiChat';
import {
  loadRecentFiles,
  removeRecentFile,
  saveRecentFiles,
  type RecentFile,
} from '../utils/recentFiles';
import { isOpenScadProjectFilePath } from '../../../../packages/shared/src/openscadProjectFiles';

export type RecentFileOpenResult = 'opened' | 'removed' | 'cancelled';

interface WelcomeScreenProps {
  draft: AiDraft;
  attachments: AttachmentStore;
  draftErrors: string[];
  draftVisionBlockMessage?: string | null;
  draftVisionWarningMessage?: string | null;
  canSubmitDraft: boolean;
  isProcessingAttachments: boolean;
  onDraftTextChange: (text: string) => void;
  onDraftFilesSelected: (files: File[], sourceSurface?: ModelSelectionSurface) => void;
  onDraftRemoveAttachment: (attachmentId: string, sourceSurface?: ModelSelectionSurface) => void;
  onStartWithDraft: (draftOverride?: AiDraft) => void;
  onStartManually: () => void;
  onOpenRecent: (path: string, type?: 'file' | 'folder') => Promise<RecentFileOpenResult>;
  onOpenFile?: () => void;
  onOpenFolder?: () => void;
  onOpenSettings?: () => void;
  showRecentFiles?: boolean;
  currentModel?: string;
  availableProviders?: string[];
  onModelChange?: (model: string, sourceSurface?: ModelSelectionSurface) => void;
  /** Resolved default project directory path (null on web → hidden) */
  projectDirectory?: string | null;
  /** Called when user clicks "Change" to pick a different default project directory */
  onChangeProjectDirectory?: () => void;
  /** Whether the user has explicitly configured a custom project directory */
  hasCustomProjectDirectory?: boolean;
}

const EXAMPLE_PROMPTS = [
  'Create a 3D printable mini lamp',
  'Design a parametric phone stand',
  'Make a custom gear with 20 teeth',
  'Create a simple mounting bracket',
  'Design a pencil holder with holes',
];

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
  onOpenFolder,
  onOpenSettings,
  showRecentFiles = true,
  currentModel = 'claude-sonnet-4-5',
  availableProviders = [],
  onModelChange,
  projectDirectory,
  onChangeProjectDirectory,
  hasCustomProjectDirectory,
}: WelcomeScreenProps) {
  const [recentFiles, setRecentFiles] = useState<RecentFile[]>([]);
  const [recentFilesReady, setRecentFilesReady] = useState(!showRecentFiles);
  const hasApiKey = useHasApiKey();

  // Shorten home directory to ~/ for display
  const displayPath = useMemo(() => {
    if (!projectDirectory) return null;
    try {
      // Match /Users/<username>/ or /home/<username>/
      return projectDirectory.replace(/^\/(?:Users|home)\/[^/]+/, '~');
    } catch {
      return projectDirectory;
    }
  }, [projectDirectory]);

  useEffect(() => {
    if (!showRecentFiles) {
      setRecentFiles([]);
      setRecentFilesReady(true);
      return;
    }

    let cancelled = false;

    const loadAndValidateRecentFiles = async () => {
      const stored = loadRecentFiles();
      const platform = getPlatform();

      if (!platform.capabilities.hasFileSystem) {
        if (!cancelled) {
          setRecentFiles(stored);
          setRecentFilesReady(true);
        }
        return;
      }

      const validity = await Promise.all(
        stored.map(async (file) => ({
          file,
          exists: await platform.fileExists(file.path),
        }))
      );

      if (cancelled) return;

      const validFiles = validity.filter((entry) => entry.exists).map((entry) => entry.file);
      if (validFiles.length !== stored.length) {
        saveRecentFiles(validFiles);
      }

      setRecentFiles(validFiles);
      setRecentFilesReady(true);
    };

    void loadAndValidateRecentFiles();

    return () => {
      cancelled = true;
    };
  }, [showRecentFiles]);

  const handleOpenRecent = async (file: RecentFile) => {
    const result = await onOpenRecent(file.path, file.type);
    if (result === 'removed') {
      setRecentFiles(removeRecentFile(file.path));
    }
  };

  return (
    <div
      data-testid="welcome-screen"
      className="h-full flex flex-col items-center justify-center px-8"
      style={{ backgroundColor: 'var(--bg-primary)' }}
    >
      <div className="w-full max-w-3xl space-y-8">
        <Text variant="page-heading" className="text-center mb-8">
          What do you want to create?
        </Text>

        {hasApiKey ? (
          <div data-testid="welcome-ai-entry" className="space-y-6 ph-no-capture">
            <div>
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
                trailingControls={
                  <ModelSelector
                    currentModel={currentModel}
                    availableProviders={availableProviders}
                    onChange={(model) => onModelChange?.(model, 'welcome')}
                    compact
                  />
                }
                onTextChange={onDraftTextChange}
                onFilesSelected={onDraftFilesSelected}
                onRemoveAttachment={onDraftRemoveAttachment}
                onSubmit={onStartWithDraft}
              />
              {displayPath && (
                <div
                  className="flex items-center gap-2 mt-2"
                  data-testid="welcome-project-directory"
                >
                  <TbFolderOpen
                    size={14}
                    style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}
                  />
                  <Text
                    variant="caption"
                    color="tertiary"
                    className="truncate"
                    title={projectDirectory!}
                  >
                    {displayPath}
                  </Text>
                  {onChangeProjectDirectory && (
                    <a
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onChangeProjectDirectory();
                      }}
                      className="text-xs shrink-0 underline hover:no-underline"
                      style={{ color: 'var(--accent-primary)' }}
                    >
                      Change
                    </a>
                  )}
                </div>
              )}
            </div>
            <div className="space-y-3">
              <Text variant="section-heading" weight="medium" color="secondary">
                Try an example:
              </Text>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_PROMPTS.map((example) => (
                  <Button
                    key={example}
                    variant="secondary"
                    onClick={() => {
                      if (!hasApiKey) return;
                      onStartWithDraft({ text: example, attachmentIds: [] });
                    }}
                    disabled={!hasApiKey}
                    title={!hasApiKey ? 'Configure an API key in Settings to use AI' : example}
                  >
                    {example}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : hasApiKey === false ? (
          <div
            className="rounded-lg p-4 text-center"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              border: '1px solid var(--border-secondary)',
            }}
          >
            <Text variant="body" className="mb-2">
              Set up an API key to use the AI assistant
            </Text>
            <Text variant="caption" color="tertiary">
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
            </Text>
          </div>
        ) : null}

        {showRecentFiles && recentFilesReady && recentFiles.length > 0 && (
          <div className="space-y-3 -mt-2">
            <Text variant="section-heading" weight="medium" color="secondary">
              Recent:
            </Text>
            <div className="space-y-2">
              {/* eslint-disable no-restricted-syntax -- recent file rows are card-like list items with internal layout (icon + text + chevron); <Button> doesn't support full-width card layouts with multiple child columns */}
              {recentFiles.map((file) => (
                <button
                  key={file.path}
                  onClick={() => {
                    void handleOpenRecent(file);
                  }}
                  className="w-full text-left px-4 py-3 rounded-lg transition-colors border flex items-center justify-between group"
                  style={{
                    backgroundColor: 'var(--bg-secondary)',
                    borderColor: 'var(--border-primary)',
                  }}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div
                      className="flex items-center justify-center shrink-0"
                      style={{ color: 'var(--text-tertiary)' }}
                      aria-hidden="true"
                    >
                      {file.type === 'folder' || !isOpenScadProjectFilePath(file.path) ? (
                        <TbFolder size={22} />
                      ) : (
                        <TbFileText size={22} />
                      )}
                    </div>
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
              {/* eslint-enable no-restricted-syntax */}
            </div>
          </div>
        )}

        <div className="flex justify-center gap-4">
          {onOpenFile && (
            <Button
              variant="secondary"
              onClick={onOpenFile}
              className="text-sm gap-1.5"
              data-testid="welcome-open-file"
            >
              <TbFileText className="size-4" />
              Open File
            </Button>
          )}
          {onOpenFolder && (
            <Button
              variant="secondary"
              onClick={onOpenFolder}
              className="text-sm gap-1.5"
              data-testid="welcome-open-folder"
            >
              <TbFolder className="size-4" />
              Open Folder
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={onStartManually}
            className="text-sm"
            data-testid="welcome-start-empty-project"
          >
            {hasCustomProjectDirectory ? 'Start in folder →' : 'Start with empty project →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
