import { useState } from 'react';
import { TbChevronDown, TbChevronRight } from 'react-icons/tb';
import * as ContextMenu from '@radix-ui/react-context-menu';
import { useProjectStore } from '../../stores/projectStore';
import { FileTreeItem } from './FileTreeItem';

interface TreeNode {
  name: string;
  fullPath: string;
  children: TreeNode[];
  isFile: boolean;
}

function buildTree(filePaths: string[]): TreeNode[] {
  const root: TreeNode = { name: '', fullPath: '', children: [], isFile: false };

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

interface FileTreeCallbacks {
  onFileClick: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
  onSetRenderTarget: (path: string) => void;
  onCreateFile: (parentDir: string) => void;
}

interface FolderNodeProps {
  node: TreeNode;
  activeFilePath: string | null;
  renderTargetPath: string | null;
  files: Record<string, { isDirty: boolean }>;
  callbacks: FileTreeCallbacks;
  depth: number;
}

function FolderNode({
  node,
  activeFilePath,
  renderTargetPath,
  files,
  callbacks,
  depth,
}: FolderNodeProps) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div>
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          {/* eslint-disable-next-line no-restricted-syntax -- tree folder toggle with custom layout */}
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors text-left"
            style={{
              paddingLeft: `${depth * 12 + 8}px`,
              color: 'var(--text-secondary)',
            }}
          >
            {expanded ? <TbChevronDown size={12} /> : <TbChevronRight size={12} />}
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
              className="flex items-center px-3 py-1.5 text-xs rounded cursor-pointer outline-none"
              style={{ color: 'var(--text-secondary)' }}
              onSelect={() => {
                if (!expanded) setExpanded(true);
                callbacks.onCreateFile(node.fullPath);
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              New File
            </ContextMenu.Item>
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {expanded && (
        <TreeNodes
          nodes={node.children}
          activeFilePath={activeFilePath}
          renderTargetPath={renderTargetPath}
          files={files}
          callbacks={callbacks}
          depth={depth + 1}
        />
      )}
    </div>
  );
}

interface TreeNodesProps {
  nodes: TreeNode[];
  activeFilePath: string | null;
  renderTargetPath: string | null;
  files: Record<string, { isDirty: boolean }>;
  callbacks: FileTreeCallbacks;
  depth: number;
}

function TreeNodes({
  nodes,
  activeFilePath,
  renderTargetPath,
  files,
  callbacks,
  depth,
}: TreeNodesProps) {
  return (
    <>
      {nodes.map((node) =>
        node.isFile ? (
          <div key={node.fullPath} style={{ paddingLeft: `${depth * 12 + 8}px` }}>
            <FileTreeItem
              name={node.name}
              fullPath={node.fullPath}
              isActive={node.fullPath === activeFilePath}
              isDirty={files[node.fullPath]?.isDirty ?? false}
              isRenderTarget={node.fullPath === renderTargetPath}
              onClick={() => callbacks.onFileClick(node.fullPath)}
              onRename={callbacks.onRenameFile}
              onDelete={callbacks.onDeleteFile}
              onSetRenderTarget={callbacks.onSetRenderTarget}
            />
          </div>
        ) : (
          <FolderNode
            key={node.fullPath}
            node={node}
            activeFilePath={activeFilePath}
            renderTargetPath={renderTargetPath}
            files={files}
            callbacks={callbacks}
            depth={depth}
          />
        )
      )}
    </>
  );
}

interface FileTreeProps {
  activeFilePath: string | null;
  onFileClick: (path: string) => void;
  onRenameFile: (oldPath: string, newName: string) => void;
  onDeleteFile: (path: string) => void;
  onSetRenderTarget: (path: string) => void;
  onCreateFile: (parentDir: string) => void;
}

export function FileTree({
  activeFilePath,
  onFileClick,
  onRenameFile,
  onDeleteFile,
  onSetRenderTarget,
  onCreateFile,
}: FileTreeProps) {
  const files = useProjectStore((s) => s.files);
  const renderTargetPath = useProjectStore((s) => s.renderTargetPath);

  const filePaths = Object.keys(files).sort((a, b) => a.localeCompare(b));
  const tree = buildTree(filePaths);

  const callbacks: FileTreeCallbacks = {
    onFileClick,
    onRenameFile,
    onDeleteFile,
    onSetRenderTarget,
    onCreateFile,
  };

  if (filePaths.length === 0) {
    return (
      <div className="px-3 py-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
        No files
      </div>
    );
  }

  return (
    <div className="py-1">
      <TreeNodes
        nodes={tree}
        activeFilePath={activeFilePath}
        renderTargetPath={renderTargetPath}
        files={files}
        callbacks={callbacks}
        depth={0}
      />
    </div>
  );
}
