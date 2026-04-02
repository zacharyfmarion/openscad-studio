import { TbX } from 'react-icons/tb';
import { getPlatform } from '../platform';

export interface EditorTab {
  id: string;
  name: string;
  isDirty: boolean;
}

interface EditorTabsProps {
  tabs: EditorTab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
}

export function EditorTabs({ tabs, activeTabId, onTabClick, onTabClose }: EditorTabsProps) {
  const handleMouseDown = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      e.preventDefault();
      onTabClose(id);
    } else {
      onTabClick(id);
    }
  };

  return (
    <div
      className="flex items-stretch overflow-x-auto shrink-0"
      style={{
        backgroundColor: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-subtle)',
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <div
            key={tab.id}
            onMouseDown={(e) => handleMouseDown(e, tab.id)}
            className="group flex items-center gap-1.5 px-3 py-1.5 text-xs transition-colors relative cursor-pointer select-none"
            style={{
              backgroundColor: isActive ? 'var(--bg-primary)' : 'var(--bg-secondary)',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: '2px',
                  backgroundColor: 'var(--accent-primary)',
                }}
              />
            )}
            {tab.isDirty && getPlatform().capabilities.hasFileSystem && (
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
            <span className="truncate" style={{ maxWidth: '120px' }}>
              {tab.name}
            </span>
            {tabs.length > 1 && (
              // eslint-disable-next-line no-restricted-syntax -- small inline close button matching tab strip height
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onTabClose(tab.id);
                }}
                onMouseDown={(e) => e.stopPropagation()}
                className="transition-opacity p-0.5 rounded flex items-center justify-center group-hover:!opacity-100"
                style={{
                  color: 'var(--text-tertiary)',
                  width: '16px',
                  height: '16px',
                  opacity: isActive ? 1 : 0,
                }}
                title="Close tab"
              >
                <TbX size={12} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
