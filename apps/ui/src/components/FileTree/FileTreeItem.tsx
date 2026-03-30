import { TbPlayerPlayFilled } from 'react-icons/tb';

interface FileTreeItemProps {
  name: string;
  isActive: boolean;
  isDirty: boolean;
  isRenderTarget: boolean;
  onClick: () => void;
}

export function FileTreeItem({
  name,
  isActive,
  isDirty,
  isRenderTarget,
  onClick,
}: FileTreeItemProps) {
  return (
    // eslint-disable-next-line no-restricted-syntax -- tree item row with custom layout; not a standard action button
    <button
      onClick={onClick}
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
  );
}
