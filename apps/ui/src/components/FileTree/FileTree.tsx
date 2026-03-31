import { useState, useRef, useEffect } from 'react';
import { TbChevronDown, TbChevronRight, TbFolder, TbFolderOpen } from 'react-icons/tb';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useProjectStore } from '../../stores/projectStore';
import { FileTreeItem } from './FileTreeItem';
import { readDroppedItems } from '../../utils/readDroppedItems';

interface TreeNode {
  name: string;
  fullPath: string;
  children: TreeNode[];
  isFile: boolean;
}

function buildTree(filePaths: string[], emptyFolderPaths: string[] = []): TreeNode[] {
  const root: TreeNode = { name: '', fullPath: '', children: [], isFile: false };

  // Process empty folders first so they appear even with no file descendants
  for (const folderPath of emptyFolderPaths) {
    const parts = folderPath.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const fullPath = parts.slice(0, i + 1).join('/');
      let child = current.children.find((c) => c.name === parts[i]);
      if (!child) {
        child = { name: parts[i], fullPath, children: [], isFile: false };
        current.children.push(child);
      }
      current = child;
    }
  }

  // Process file paths
  for (const path of filePaths) {
    const parts = path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join('/');

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, fullPath, children: [], isFile };
        current.children.push(child);
      }
      current = child;
    }
  }

  // Sort: folders first, then files, both alphabetical
  function sortNodes(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
    for (const node of nodes) {
      if (!node.isFile) sortNodes(node.children);
    }
    return nodes;
  }

  return sortNodes(root.children);
}

/**
 * Returns true if dragging sourcePath onto targetFolderPath is a valid move.
 * Exported so it can be imported by App.tsx and tested directly.
 */
export function isValidDrop(
  sourcePath: string,
  sourceIsFolder: boolean,
  targetFolderPath: string
): boolean {
  const currentParent = sourcePath.includes('/')
    ? sourcePath.substring(0, sourcePath.lastIndexOf('/'))
    : '';
  // Already in this folder
  if (targetFolderPath === currentParent) return false;
  if (sourceIsFolder) {
    // Can't drop folder onto itself
    if (targetFolderPath === sourcePath) return false;
    // Can't drop folder into one of its own descendants
    if (targetFolderPath.startsWith(sourcePath + '/')) return false;
  }
  return true;
}

interface DragState {
  draggingPath: string;
  draggingIsFolder: boolean;
}

interface FileTreeCallbacks {
  onFileClick: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onSetRenderTarget: (path: string) => void;
  onCreateFile: (parentDir: string) => void;
  onCreateFolder: (parentDir: string, folderName: string) => void;
  onClearPendingRename: () => void;
  onMoveItem: (sourcePath: string, destFolderPath: string, isFolder: boolean) => void;
  onAddExternalFiles: (files: Record<string, string>, targetFolderPath: string) => void;
  getDragState: () => DragState | null;
  setDragState: (s: DragState | null) => void;
  setPendingFolderParent: (path: string | null) => void;
}

// ── Inline folder name input ──────────────────────────────────────────────────

function FolderCreationInput({
  depth,
  onConfirm,
  onCancel,
}: {
  depth: number;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
    else onCancel();
  };

  return (
    <div style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: '8px' }}>
      <div className="flex items-center gap-1 px-2 py-0.5">
        <TbFolder
          size={13}
          style={{ color: 'var(--accent-secondary, var(--text-tertiary))', flexShrink: 0 }}
        />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
          }}
          className="flex-1 px-1 py-0.5 text-xs rounded"
          style={{
            backgroundColor: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: '1px solid var(--accent-primary)',
            outline: 'none',
          }}
          placeholder="folder name"
        />
      </div>
    </div>
  );
}

// ── Context menu shared styles ────────────────────────────────────────────────

const ctxItemStyle: React.CSSProperties = { color: 'var(--text-secondary)' };
const ctxItemClass = 'flex items-center px-3 py-1.5 text-xs rounded cursor-pointer outline-none';

function useCtxHover() {
  return {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-tertiary)';
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
    },
  };
}

// ── FolderNode ────────────────────────────────────────────────────────────────

interface FolderNodeProps {
  node: TreeNode;
  activeFilePath: string | null;
  renderTargetPath: string | null;
  pendingRenameFile: string | null;
  pendingFolderParent: string | null;
  dropTargetPath: string | null;
  onSetDropTarget: (path: string | null) => void;
  files: Record<string, { isDirty: boolean }>;
  callbacks: FileTreeCallbacks;
  depth: number;
}

function FolderNode({
  node,
  activeFilePath,
  renderTargetPath,
  pendingRenameFile,
  pendingFolderParent,
  dropTargetPath,
  onSetDropTarget,
  files,
  callbacks,
  depth,
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hover = useCtxHover();

  const isDropTarget = dropTargetPath === node.fullPath;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/x-file-tree-node', node.fullPath);
    e.stopPropagation();
    callbacks.setDragState({ draggingPath: node.fullPath, draggingIsFolder: true });
  };

  const handleDragEnd = () => {
    callbacks.setDragState(null);
    onSetDropTarget(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    const isInternal = e.dataTransfer.types.includes('text/x-file-tree-node');
    const isExternal = e.dataTransfer.types.includes('Files');
    if (!isInternal && !isExternal) return;

    e.preventDefault();
    e.stopPropagation();

    if (isInternal) {
      const drag = callbacks.getDragState();
      const valid =
        drag !== null && isValidDrop(drag.draggingPath, drag.draggingIsFolder, node.fullPath);
      e.dataTransfer.dropEffect = valid ? 'move' : 'none';
      onSetDropTarget(valid ? node.fullPath : null);
    } else {
      e.dataTransfer.dropEffect = 'copy';
      onSetDropTarget(node.fullPath);
    }
  };

  const handleDragEnter = (e: React.DragEvent) => {
    const isInternal = e.dataTransfer.types.includes('text/x-file-tree-node');
    const isExternal = e.dataTransfer.types.includes('Files');
    if (!isInternal && !isExternal) return;

    // Auto-expand collapsed folders after hovering for 600ms
    if (!expanded) {
      expandTimeoutRef.current = setTimeout(() => setExpanded(true), 600);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
        expandTimeoutRef.current = null;
      }
      if (dropTargetPath === node.fullPath) {
        onSetDropTarget(null);
      }
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
      expandTimeoutRef.current = null;
    }
    onSetDropTarget(null);

    if (e.dataTransfer.types.includes('text/x-file-tree-node')) {
      const drag = callbacks.getDragState();
      if (drag && isValidDrop(drag.draggingPath, drag.draggingIsFolder, node.fullPath)) {
        callbacks.onMoveItem(drag.draggingPath, node.fullPath, drag.draggingIsFolder);
      }
      callbacks.setDragState(null);
    } else if (e.dataTransfer.types.includes('Files')) {
      // Clone items before first await — DataTransfer items become inaccessible after
      const droppedFiles = await readDroppedItems(e.dataTransfer.items);
      if (droppedFiles) {
        callbacks.onAddExternalFiles(droppedFiles, node.fullPath);
      }
    }
  };

  return (
    <div>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          {/* eslint-disable-next-line no-restricted-syntax -- tree folder toggle with custom layout */}
          <button
            draggable={true}
            onClick={() => setExpanded(!expanded)}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className="w-full flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors text-left"
            style={{
              paddingLeft: `${depth * 12 + 8}px`,
              color: 'var(--text-secondary)',
              ...(isDropTarget
                ? {
                    backgroundColor: 'color-mix(in srgb, var(--accent-primary) 15%, transparent)',
                    outline: '1px solid var(--accent-primary)',
                    outlineOffset: '-1px',
                  }
                : {}),
            }}
          >
            {expanded ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
            {expanded ? (
              <TbFolderOpen
                size={13}
                style={{ color: 'var(--accent-secondary, var(--text-tertiary))', flexShrink: 0 }}
              />
            ) : (
              <TbFolder
                size={13}
                style={{ color: 'var(--accent-secondary, var(--text-tertiary))', flexShrink: 0 }}
              />
            )}
            <span className="truncate">{node.name}</span>
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
            <ContextMenu.Item
              className={ctxItemClass}
              style={ctxItemStyle}
              onSelect={() => {
                if (!expanded) setExpanded(true);
                callbacks.onCreateFile(node.fullPath);
              }}
              {...hover}
            >
              New File
            </ContextMenu.Item>
            <ContextMenu.Item
              className={ctxItemClass}
              style={ctxItemStyle}
              onSelect={() => {
                if (!expanded) setExpanded(true);
                callbacks.setPendingFolderParent(node.fullPath);
              }}
              {...hover}
            >
              New Folder
            </ContextMenu.Item>
            <ContextMenu.Separator
              style={{ height: '1px', backgroundColor: 'var(--border-subtle)', margin: '4px 0' }}
            />
            <ContextMenu.Item
              className={ctxItemClass}
              style={{ color: 'var(--status-error)' }}
              onSelect={() => callbacks.onDeleteFolder(node.fullPath)}
              {...hover}
            >
              Delete
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {expanded && (
        <>
          {pendingFolderParent === node.fullPath && (
            <FolderCreationInput
              depth={depth + 1}
              onConfirm={(name) => {
                callbacks.setPendingFolderParent(null);
                callbacks.onCreateFolder(node.fullPath, name);
              }}
              onCancel={() => callbacks.setPendingFolderParent(null)}
            />
          )}
          <TreeNodes
            nodes={node.children}
            activeFilePath={activeFilePath}
            renderTargetPath={renderTargetPath}
            pendingRenameFile={pendingRenameFile}
            pendingFolderParent={pendingFolderParent}
            dropTargetPath={dropTargetPath}
            onSetDropTarget={onSetDropTarget}
            files={files}
            callbacks={callbacks}
            depth={depth + 1}
          />
        </>
      )}
    </div>
  );
}

// ── TreeNodes ─────────────────────────────────────────────────────────────────

interface TreeNodesProps {
  nodes: TreeNode[];
  activeFilePath: string | null;
  renderTargetPath: string | null;
  pendingRenameFile: string | null;
  pendingFolderParent: string | null;
  dropTargetPath: string | null;
  onSetDropTarget: (path: string | null) => void;
  files: Record<string, { isDirty: boolean }>;
  callbacks: FileTreeCallbacks;
  depth: number;
}

function TreeNodes({
  nodes,
  activeFilePath,
  renderTargetPath,
  pendingRenameFile,
  pendingFolderParent,
  dropTargetPath,
  onSetDropTarget,
  files,
  callbacks,
  depth,
}: TreeNodesProps) {
  return (
    <>
      {nodes.map((node) => {
        if (node.isFile) {
          const parentDir = node.fullPath.includes('/')
            ? node.fullPath.substring(0, node.fullPath.lastIndexOf('/'))
            : '';
          return (
            <div
              key={node.fullPath}
              style={{ paddingLeft: `${depth * 12 + 8}px`, paddingRight: '8px' }}
            >
              <FileTreeItem
                name={node.name}
                fullPath={node.fullPath}
                isActive={node.fullPath === activeFilePath}
                isDirty={files[node.fullPath]?.isDirty ?? false}
                isRenderTarget={node.fullPath === renderTargetPath}
                pendingRename={node.fullPath === pendingRenameFile}
                isDragging={node.fullPath === callbacks.getDragState()?.draggingPath}
                onClick={() => callbacks.onFileClick(node.fullPath)}
                onRename={callbacks.onRenameFile}
                onDelete={callbacks.onDeleteFile}
                onSetRenderTarget={callbacks.onSetRenderTarget}
                onRenameComplete={callbacks.onClearPendingRename}
                onCreateFile={() => callbacks.onCreateFile(parentDir)}
                onCreateFolder={() => callbacks.setPendingFolderParent(parentDir)}
                onDragStart={() =>
                  callbacks.setDragState({ draggingPath: node.fullPath, draggingIsFolder: false })
                }
                onDragEnd={() => callbacks.setDragState(null)}
              />
            </div>
          );
        }
        return (
          <FolderNode
            key={node.fullPath}
            node={node}
            activeFilePath={activeFilePath}
            renderTargetPath={renderTargetPath}
            pendingRenameFile={pendingRenameFile}
            pendingFolderParent={pendingFolderParent}
            dropTargetPath={dropTargetPath}
            onSetDropTarget={onSetDropTarget}
            files={files}
            callbacks={callbacks}
            depth={depth}
          />
        );
      })}
    </>
  );
}

// ── FileTree (root) ───────────────────────────────────────────────────────────

interface FileTreeProps {
  activeFilePath: string | null;
  pendingRenameFile: string | null;
  onFileClick: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
  onDeleteFolder: (path: string) => void;
  onSetRenderTarget: (path: string) => void;
  onCreateFile: (parentDir: string) => void;
  onCreateFolder: (parentDir: string, folderName: string) => void;
  onClearPendingRename: () => void;
  onMoveItem: (sourcePath: string, destFolderPath: string, isFolder: boolean) => void;
  onAddExternalFiles: (files: Record<string, string>, targetFolderPath: string) => void;
}

export function FileTree({
  activeFilePath,
  pendingRenameFile,
  onFileClick,
  onRenameFile,
  onDeleteFile,
  onDeleteFolder,
  onSetRenderTarget,
  onCreateFile,
  onCreateFolder,
  onClearPendingRename,
  onMoveItem,
  onAddExternalFiles,
}: FileTreeProps) {
  const files = useProjectStore((s) => s.files);
  const renderTargetPath = useProjectStore((s) => s.renderTargetPath);
  const emptyFolders = useProjectStore((s) => s.emptyFolders);

  // Drag source — stored in a ref to avoid re-renders on every dragover event
  const dragStateRef = useRef<DragState | null>(null);

  // Drop highlight target — in state so visual changes trigger re-renders
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  // Pending folder creation — which parent folder is waiting for a name
  const [pendingFolderParent, setPendingFolderParent] = useState<string | null>(null);

  const filePaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const tree = buildTree(filePaths, emptyFolders);

  const callbacks: FileTreeCallbacks = {
    onFileClick,
    onRenameFile,
    onDeleteFile,
    onDeleteFolder,
    onSetRenderTarget,
    onCreateFile,
    onCreateFolder,
    onClearPendingRename,
    onMoveItem,
    onAddExternalFiles,
    getDragState: () => dragStateRef.current,
    setDragState: (s) => {
      dragStateRef.current = s;
    },
    setPendingFolderParent,
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    const isInternal = e.dataTransfer.types.includes('text/x-file-tree-node');
    const isExternal = e.dataTransfer.types.includes('Files');
    if (!isInternal && !isExternal) return;
    e.preventDefault();
    if (isInternal) {
      const drag = dragStateRef.current;
      const valid = drag !== null && isValidDrop(drag.draggingPath, drag.draggingIsFolder, '');
      e.dataTransfer.dropEffect = valid ? 'move' : 'none';
      setDropTargetPath(valid ? '' : null);
    } else {
      e.dataTransfer.dropEffect = 'copy';
      setDropTargetPath('');
    }
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setDropTargetPath(null);
    }
  };

  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetPath(null);

    if (e.dataTransfer.types.includes('text/x-file-tree-node')) {
      const drag = dragStateRef.current;
      if (drag && isValidDrop(drag.draggingPath, drag.draggingIsFolder, '')) {
        onMoveItem(drag.draggingPath, '', drag.draggingIsFolder);
      }
      dragStateRef.current = null;
    } else if (e.dataTransfer.types.includes('Files')) {
      const droppedFiles = await readDroppedItems(e.dataTransfer.items);
      if (droppedFiles) {
        onAddExternalFiles(droppedFiles, '');
      }
    }
  };

  const rootContextMenu = (
    <ContextMenu.Portal>
      <ContextMenu.Content
        className="min-w-[160px] rounded-md p-1 shadow-lg"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          zIndex: 1000,
        }}
      >
        <ContextMenu.Item
          className={ctxItemClass}
          style={ctxItemStyle}
          onSelect={() => onCreateFile('')}
          {...useCtxHover()}
        >
          New File
        </ContextMenu.Item>
        <ContextMenu.Item
          className={ctxItemClass}
          style={ctxItemStyle}
          onSelect={() => setPendingFolderParent('')}
          {...useCtxHover()}
        >
          New Folder
        </ContextMenu.Item>
      </ContextMenu.Content>
    </ContextMenu.Portal>
  );

  if (filePaths.length === 0 && emptyFolders.length === 0) {
    return (
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div className="px-3 py-2 text-xs min-h-full" style={{ color: 'var(--text-tertiary)' }}>
            {pendingFolderParent === '' ? (
              <FolderCreationInput
                depth={0}
                onConfirm={(name) => {
                  setPendingFolderParent(null);
                  onCreateFolder('', name);
                }}
                onCancel={() => setPendingFolderParent(null)}
              />
            ) : (
              'No files'
            )}
          </div>
        </ContextMenu.Trigger>
        {rootContextMenu}
      </ContextMenu.Root>
    );
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className="py-1 min-h-full"
          style={
            dropTargetPath === ''
              ? {
                  outline: '1px solid var(--accent-primary)',
                  outlineOffset: '-2px',
                  backgroundColor: 'color-mix(in srgb, var(--accent-primary) 8%, transparent)',
                }
              : undefined
          }
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
        >
          {pendingFolderParent === '' && (
            <FolderCreationInput
              depth={0}
              onConfirm={(name) => {
                setPendingFolderParent(null);
                onCreateFolder('', name);
              }}
              onCancel={() => setPendingFolderParent(null)}
            />
          )}
          <TreeNodes
            nodes={tree}
            activeFilePath={activeFilePath}
            renderTargetPath={renderTargetPath}
            pendingRenameFile={pendingRenameFile}
            pendingFolderParent={pendingFolderParent}
            dropTargetPath={dropTargetPath}
            onSetDropTarget={setDropTargetPath}
            files={files}
            callbacks={callbacks}
            depth={0}
          />
        </div>
      </ContextMenu.Trigger>
      {rootContextMenu}
    </ContextMenu.Root>
  );
}
