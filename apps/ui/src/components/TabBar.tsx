import { TbX, TbPlus } from 'react-icons/tb';

export interface Tab {
  id: string;
  filePath: string | null;
  name: string;
  content: string;
  savedContent: string;
  isDirty: boolean;

  // Cached render state
  previewSrc?: string;
  previewKind?: 'mesh' | 'png' | 'svg';
  diagnostics?: any[];
  dimensionMode?: '2d' | '3d';
}

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
}

export function TabBar({ tabs, activeTabId, onTabClick, onTabClose, onNewTab }: TabBarProps) {
  const handleTabClick = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      // Middle click - close tab
      e.preventDefault();
      onTabClose(id);
    } else {
      onTabClick(id);
    }
  };

  const handleCloseClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    onTabClose(id);
  };

  return (
    <div className="flex items-center gap-1 overflow-x-auto" style={{
      borderBottom: '1px solid var(--border-primary)',
      backgroundColor: 'var(--bg-secondary)',
    }}>
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;

        return (
          <div
            key={tab.id}
            onMouseDown={(e) => handleTabClick(e, tab.id)}
            className="group flex items-center gap-2 px-3 py-2 text-sm transition-colors relative cursor-pointer"
            style={{
              backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              borderRight: '1px solid var(--border-secondary)',
              minWidth: '120px',
              maxWidth: '200px',
            }}
          >
            {/* Active indicator */}
            {isActive && (
              <div
                className="absolute bottom-0 left-0 right-0"
                style={{
                  height: '2px',
                  backgroundColor: 'var(--accent-primary)',
                }}
              />
            )}

            {/* Tab name with dirty indicator */}
            <span className="truncate flex-1 text-left">
              {tab.isDirty && <span style={{ color: 'var(--accent-primary)' }}>• </span>}
              {tab.name}
            </span>

            {/* Close button */}
            <button
              onClick={(e) => handleCloseClick(e, tab.id)}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-opacity-10"
              style={{
                color: 'var(--text-tertiary)',
              }}
              title="Close tab"
            >
              <TbX size={14} />
            </button>
          </div>
        );
      })}

      {/* New tab button */}
      <button
        onClick={onNewTab}
        className="px-3 py-2 transition-colors"
        style={{
          color: 'var(--text-tertiary)',
        }}
        title="New tab (⌘T)"
      >
        <TbPlus size={16} />
      </button>
    </div>
  );
}
