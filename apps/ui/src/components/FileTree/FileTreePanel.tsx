import { useState, useCallback } from 'react';
import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand, TbPlus, TbFolderDown } from 'react-icons/tb';
import { IconButton } from '../ui';
import { FileTree } from './FileTree';

interface FileTreePanelProps {
  activeFilePath: string | null;
  onFileClick: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
  onSetRenderTarget: (path: string) => void;
  onCreateFile: (parentDir: string) => void;
  onDropFolder?: (files: Record<string, string>, renderTargetPath: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
}

async function readDroppedFolder(items: DataTransferItemList): Promise<Record<string, string> | null> {
  const entries: FileSystemEntry[] = [];
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
  }

  if (entries.length === 0) return null;

  const files: Record<string, string> = {};

  async function walkEntry(entry: FileSystemEntry, prefix: string): Promise<void> {
    if (entry.isFile) {
      if (entry.name.endsWith('.scad')) {
        const file = await new Promise<File>((resolve, reject) => {
          (entry as FileSystemFileEntry).file(resolve, reject);
        });
        const path = prefix ? `${prefix}/${entry.name}` : entry.name;
        files[path] = await file.text();
      }
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      const children = await new Promise<FileSystemEntry[]>((resolve, reject) => {
        reader.readEntries(resolve, reject);
      });
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
      for (const child of children) {
        await walkEntry(child, nextPrefix);
      }
    }
  }

  // If a single directory was dropped, strip the top-level folder name
  if (entries.length === 1 && entries[0].isDirectory) {
    const reader = (entries[0] as FileSystemDirectoryEntry).createReader();
    const children = await new Promise<FileSystemEntry[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    for (const child of children) {
      await walkEntry(child, '');
    }
  } else {
    for (const entry of entries) {
      await walkEntry(entry, '');
    }
  }

  return Object.keys(files).length > 0 ? files : null;
}

export function FileTreePanel({
  activeFilePath,
  onFileClick,
  onRenameFile,
  onDeleteFile,
  onSetRenderTarget,
  onCreateFile,
  onDropFolder,
  collapsed,
  onToggleCollapse,
  width,
}: FileTreePanelProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (!onDropFolder || !e.dataTransfer.items.length) return;

    const files = await readDroppedFolder(e.dataTransfer.items);
    if (!files) return;

    const scadFiles = Object.keys(files);
    const renderTargetPath =
      scadFiles.find((p) => p === 'main.scad') ??
      scadFiles.sort((a, b) => a.localeCompare(b))[0];

    onDropFolder(files, renderTargetPath);
  }, [onDropFolder]);

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
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--accent) 10%, var(--bg-secondary) 90%)',
            border: '2px dashed var(--accent)',
            borderRight: 'none',
            margin: '0',
          }}
        >
          <TbFolderDown size={24} style={{ color: 'var(--accent)' }} />
          <span
            className="text-xs font-medium"
            style={{ color: 'var(--accent)' }}
          >
            Drop folder
          </span>
        </div>
      )}
      <div
        className="flex items-center justify-between px-2 py-1.5 shrink-0"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <span
          className="text-xs font-medium uppercase tracking-wider"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Files
        </span>
        <div className="flex items-center gap-0.5">
          <IconButton onClick={() => onCreateFile('')} size="sm" title="New file">
            <TbPlus size={14} />
          </IconButton>
          <IconButton onClick={onToggleCollapse} size="sm" title="Hide file tree">
            <TbLayoutSidebarLeftCollapse size={14} />
          </IconButton>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <FileTree
          activeFilePath={activeFilePath}
          onFileClick={onFileClick}
          onRenameFile={onRenameFile}
          onDeleteFile={onDeleteFile}
          onSetRenderTarget={onSetRenderTarget}
          onCreateFile={onCreateFile}
        />
      </div>
    </div>
  );
}
