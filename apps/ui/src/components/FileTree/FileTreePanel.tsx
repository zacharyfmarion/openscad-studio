import { TbLayoutSidebarLeftCollapse, TbLayoutSidebarLeftExpand, TbPlus } from 'react-icons/tb';
import { IconButton } from '../ui';
import { FileTree } from './FileTree';

interface FileTreePanelProps {
  activeFilePath: string | null;
  onFileClick: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
  onSetRenderTarget: (path: string) => void;
  onCreateFile: (parentDir: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  width: number;
}

export function FileTreePanel({
  activeFilePath,
  onFileClick,
  onRenameFile,
  onDeleteFile,
  onSetRenderTarget,
  onCreateFile,
  collapsed,
  onToggleCollapse,
  width,
}: FileTreePanelProps) {
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
      className="flex flex-col shrink-0 overflow-hidden"
      style={{
        width: `${width}px`,
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--border-subtle)',
      }}
    >
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
