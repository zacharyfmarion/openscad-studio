import { useState, useRef, useEffect } from 'react';
import { TbPlayerPlayFilled } from 'react-icons/tb';
import * as ContextMenu from '@radix-ui/react-context-menu';

interface FileTreeItemProps {
  name: string;
  fullPath: string;
  isActive: boolean;
  isDirty: boolean;
  isRenderTarget: boolean;
  onClick: () => void;
  onRename: (oldPath: string, newName: string) => void;
  onDelete: (path: string) => void;
  onSetRenderTarget: (path: string) => void;
}

export function FileTreeItem({
  name,
  fullPath,
  isActive,
  isDirty,
  isRenderTarget,
  onClick,
  onRename,
  onDelete,
  onSetRenderTarget,
}: FileTreeItemProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);

  const startRename = () => {
    setRenameValue(name);
    setIsRenaming(true);
  };

  // Auto-focus and select filename (without extension) when entering rename mode.
  // Must only depend on isRenaming — depending on renameValue would re-select on
  // every keystroke, clobbering the user's input.
  useEffect(() => {
    if (isRenaming && inputRef.current) {
      inputRef.current.focus();
      const dotIndex = name.lastIndexOf('.');
      inputRef.current.setSelectionRange(0, dotIndex > 0 ? dotIndex : name.length);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRenaming]);

  const commitRename = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== name) {
      onRename(fullPath, trimmed);
    }
    setIsRenaming(false);
  };

  if (isRenaming) {
    return (
      <input
        ref={inputRef}
        value={renameValue}
        onChange={(e) => setRenameValue(e.target.value)}
        onBlur={commitRename}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commitRename();
          }
          if (e.key === 'Escape') {
            setRenameValue(name);
            setIsRenaming(false);
          }
        }}
        className="w-full px-2 py-1 text-xs rounded"
        style={{
          backgroundColor: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          border: '1px solid var(--accent-primary)',
          outline: 'none',
        }}
        data-testid="rename-input"
      />
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        {/* eslint-disable-next-line no-restricted-syntax -- tree item row with custom layout; not a standard action button */}
        <button
          onClick={onClick}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              startRename();
            }
          }}
          className="w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded transition-colors text-left group"
          style={{
            backgroundColor: isActive ? 'var(--bg-tertiary)' : 'transparent',
            color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
          }}
          title={name}
        >
          {isRenderTarget && (
            <TbPlayerPlayFilled
              size={10}
              style={{ color: 'var(--accent-primary)', flexShrink: 0 }}
              title="Render target"
            />
          )}
          <span className="truncate flex-1">{name}</span>
          {isDirty && (
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)',
                flexShrink: 0,
              }}
              title="Unsaved changes"
            />
          )}
        </button>
      </ContextMenu.Trigger>

      <ContextMenu.Portal>
        <ContextMenu.Content
          className="min-w-[160px] rounded-md p-1 shadow-lg"
          style={{
            backgroundColor: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            zIndex: 1000,
          }}
        >
          {!isRenderTarget && (
            <ContextMenu.Item
              className="flex items-center px-3 py-1.5 text-xs rounded cursor-pointer outline-none"
              style={{ color: 'var(--text-secondary)' }}
              onSelect={() => onSetRenderTarget(fullPath)}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Set as Render Target
            </ContextMenu.Item>
          )}
          <ContextMenu.Item
            className="flex items-center px-3 py-1.5 text-xs rounded cursor-pointer outline-none"
            style={{ color: 'var(--text-secondary)' }}
            onSelect={startRename}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Rename
          </ContextMenu.Item>
          <ContextMenu.Separator
            style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }}
          />
          <ContextMenu.Item
            className="flex items-center px-3 py-1.5 text-xs rounded cursor-pointer outline-none"
            style={{ color: 'var(--status-error)' }}
            onSelect={() => onDelete(fullPath)}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
