import { useState, useCallback, useMemo } from 'react';
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand, TbPlus } from 'react-icons/tb';
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

  // Track which folders are collapsed. Folders NOT in this set are expanded (default).
  // This state lives here (not in FileTree) so it survives panel collapse/expand.
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  // Use stable store references for deriving folder paths
  const files = useProjectStore((s) => s.files);
  const emptyFolders = useProjectStore((s) => s.emptyFolders);

  // expandedFolders = all folders that aren't explicitly collapsed
  const expandedFolders = useMemo(() => {
    const allFolders = new Set<string>();
    for (const filePath of Object.keys(files)) {
      const parts = filePath.split('/');
      for (let i = 1; i < parts.length; i++) {
        allFolders.add(parts.slice(0, i).join('/'));
      }
    }
    if (emptyFolders) {
      for (const folder of emptyFolders) {
        allFolders.add(folder);
      }
    }
    return new Set([...allFolders].filter((p) => !collapsedFolders.has(p)));
  }, [files, emptyFolders, collapsedFolders]);

  const toggleFolder = useCallback((path: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

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
        <div
          className="flex items-center justify-center shrink-0 box-border"
          style={{
            height: 'var(--dv-tabs-and-actions-container-height, 28px)',
            borderBottom: '1px solid var(--border-subtle)',
            boxSizing: 'border-box',
          }}
        >
          {/* eslint-disable-next-line no-restricted-syntax -- compact icon button for tab-height header */}
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Show file tree"
            className="flex items-center justify-center rounded hover:bg-[var(--bg-elevated)] transition-colors"
            style={{ width: 22, height: 22, color: 'var(--text-secondary)' }}
          >
            <TbLayoutSidebarLeftExpand size={14} />
          </button>
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
        className="flex items-center justify-between px-2 shrink-0 box-border"
        style={{
          height: 'var(--dv-tabs-and-actions-container-height, 28px)',
          borderBottom: '1px solid var(--border-subtle)',
          boxSizing: 'border-box',
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
          expandedFolders={expandedFolders}
          toggleFolder={toggleFolder}
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
