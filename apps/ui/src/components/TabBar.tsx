import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import { TbX, TbPlus } from 'react-icons/tb';
import type { WorkspaceTab } from '../stores/workspaceTypes';

export type Tab = WorkspaceTab;

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onNewTab: () => void;
  onReorderTabs: (tabs: Tab[]) => void;
}

interface SortableTabProps {
  tab: Tab;
  isActive: boolean;
  onTabClick: (e: React.MouseEvent, id: string) => void;
  onTabClose: (id: string) => void;
}

function SortableTab({ tab, isActive, onTabClick, onTabClose }: SortableTabProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: tab.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    backgroundColor: isActive ? 'var(--bg-primary)' : 'var(--bg-secondary)',
    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
    borderRight: '1px solid rgba(255, 255, 255, 0.05)',
    cursor: isDragging ? 'grabbing' : 'grab',
    touchAction: 'none',
  };

  const handleTabClick = (e: React.MouseEvent) => {
    onTabClick(e, tab.id);
  };

  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onTabClose(tab.id);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onMouseDown={handleTabClick}
      className="group flex items-center gap-2 px-4 py-3 text-sm transition-all relative"
    >
      {/* Bottom accent for active tab */}
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

      {/* Tab name */}
      <span className="truncate flex-1 text-left" style={{ fontSize: '13px' }}>
        {tab.name}
      </span>

      {/* Close button - always shows X, visible on active tab or hover */}
      {/* eslint-disable-next-line no-restricted-syntax -- fixed 20×20px tab close button that must not consume the full sm (28px) height; using a raw element avoids overriding IconButton's h-7 w-7 size */}
      <button
        onClick={handleCloseClick}
        onMouseDown={(e) => e.stopPropagation()}
        className="transition-opacity p-0.5 rounded-lg flex items-center justify-center group-hover:!opacity-100"
        style={{
          color: 'var(--text-tertiary)',
          width: '20px',
          height: '20px',
          opacity: isActive ? 1 : 0,
        }}
        title="Close tab"
      >
        <TbX size={16} />
      </button>
    </div>
  );
}

export function TabBar({
  tabs,
  activeTabId,
  onTabClick,
  onTabClose,
  onNewTab,
  onReorderTabs,
}: TabBarProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px of movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleTabClick = (e: React.MouseEvent, id: string) => {
    if (e.button === 1) {
      // Middle click - close tab
      e.preventDefault();
      onTabClose(id);
    } else {
      onTabClick(id);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = tabs.findIndex((tab) => tab.id === active.id);
      const newIndex = tabs.findIndex((tab) => tab.id === over.id);

      const newTabs = arrayMove(tabs, oldIndex, newIndex);
      onReorderTabs(newTabs);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToHorizontalAxis]}
    >
      <div
        className="flex items-stretch overflow-x-auto"
        style={{
          backgroundColor: 'var(--bg-secondary)',
        }}
      >
        <SortableContext items={tabs.map((t) => t.id)} strategy={horizontalListSortingStrategy}>
          {tabs.map((tab) => (
            <SortableTab
              key={tab.id}
              tab={tab}
              isActive={tab.id === activeTabId}
              onTabClick={handleTabClick}
              onTabClose={onTabClose}
            />
          ))}
        </SortableContext>

        {/* New tab button */}
        {/* eslint-disable-next-line no-restricted-syntax -- flush icon-only new-tab button living in the tab strip; height is intentionally unconstrained to match tab strip height */}
        <button
          onClick={onNewTab}
          className="px-3 py-2 rounded-lg transition-colors"
          style={{
            color: 'var(--text-tertiary)',
          }}
          title="New tab (⌘T)"
        >
          <TbPlus size={16} />
        </button>
      </div>
    </DndContext>
  );
}
