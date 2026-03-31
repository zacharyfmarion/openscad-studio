import { useState, useCallback } from 'react';
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand, TbPlus } from 'react-icons/tb';
import { IconButton } from '../ui';
import { FileTree } from './FileTree';
import { useProjectStore } from '../../stores/projectStore';

interface FileTreePanelProps {
  activeFilePath: string | null;
  onFileClick: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onSetRenderTarget: (path: string) => void;
  onCreateFile: (parentDir: string) => Promise<string>;
  onCreateFolder: (parentDir: string, folderName: string) => Promise<void>;
  onMoveItem: (sourcePath: string, destFolderPath: string, isFolder: boolean) => void;
  onAddExternalFiles: (files: Record<string, string>, targetFolderPath: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
}

export function FileTreePanel({
  activeFilePath,
  onFileClick,
  onRenameFile,
  onDeleteFile,
  onDeleteFolder,
  onSetRenderTarget,
  onCreateFile,
  onCreateFolder,
  onMoveItem,
  onAddExternalFiles,
  collapsed,
  onToggleCollapse,
  width,
}: FileTreePanelProps) {
  const projectRoot = useProjectStore((s) => s.projectRoot);
  const folderName = projectRoot
    ? (projectRoot.split('/').filter(Boolean).pop() ?? 'Files')
    : 'Files';
  const [pendingRenameFile, setPendingRenameFile] = useState<string | null>(null);

  const handleCreateFile = useCallback(
    async (parentDir: string) => {
      const newPath = await onCreateFile(parentDir);
      setPendingRenameFile(newPath);
    },
    [onCreateFile]
  );

  const handleCreateFolder = useCallback(
    async (parentDir: string, folderName: string) => {
      await onCreateFolder(parentDir, folderName);
    },
    [onCreateFolder]
  );

  if (collapsed) {
    return (
      <div
        className="flex flex-col shrink-0"
        style={{
          width: '36px',
          backgroundColor: 'var(--bg-secondary)',
          borderRight: '1px solid var(--border-subtle)',
        }}
      >
        <div className="flex items-center justify-center py-2">
          <IconButton onClick={onToggleCollapse} size="sm" title="Show file tree">
            <TbLayoutSidebarLeftExpand size={16} />
          </IconButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative flex flex-col shrink-0 overflow-hidden"
      style={{
        width: `${width}px`,
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
      <div
        className="flex items-center justify-between px-2 shrink-0"
        style={{
          height: 'var(--dv-tabs-and-actions-container-height, 35px)',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <span
          className="text-xs font-medium truncate"
          style={{ color: 'var(--text-secondary)' }}
          title={projectRoot ?? undefined}
        >
          {folderName}
        </span>
        <div className="flex items-center gap-0.5">
          {/* eslint-disable-next-line no-restricted-syntax -- these icon buttons are embedded in a tab-height header strip; <IconButton> size="sm" (h-7) is too tall */}
          <button
            type="button"
            onClick={() => handleCreateFile('')}
            title="New file"
            className="flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] transition-colors"
            style={{ width: 22, height: 22, color: 'var(--text-secondary)' }}
          >
            <TbPlus size={14} />
          </button>
          {/* eslint-disable-next-line no-restricted-syntax -- same as above */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Hide file tree"
            className="flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] transition-colors"
            style={{ width: 22, height: 22, color: 'var(--text-secondary)' }}
          >
            <TbLayoutSidebarLeftCollapse size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <FileTree
          activeFilePath={activeFilePath}
          pendingRenameFile={pendingRenameFile}
          onFileClick={onFileClick}
          onRenameFile={onRenameFile}
          onDeleteFile={onDeleteFile}
          onDeleteFolder={onDeleteFolder}
          onSetRenderTarget={onSetRenderTarget}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onClearPendingRename={() => setPendingRenameFile(null)}
          onMoveItem={onMoveItem}
          onAddExternalFiles={onAddExternalFiles}
        />
      </div>
    </div>
  );
}
