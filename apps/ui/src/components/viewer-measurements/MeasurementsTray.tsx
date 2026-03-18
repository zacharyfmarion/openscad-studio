import { Button } from '../ui';
import type { MeasurementListItemData } from './types';

interface MeasurementsTrayProps {
  items: MeasurementListItemData[];
  title?: string;
  positionClassName?: string;
  inline?: boolean;
  containerTestId: string;
  clearAllTestId: string;
  itemTestId: string;
  deleteTestId: string;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function MeasurementsTray({
  items,
  title = 'Measurements',
  positionClassName = 'left-3 bottom-3',
  inline = false,
  containerTestId,
  clearAllTestId,
  itemTestId,
  deleteTestId,
  onSelect,
  onDelete,
  onClearAll,
}: MeasurementsTrayProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div
      className={`${inline ? '' : `absolute z-20 w-72 ${positionClassName}`} rounded-xl`}
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        color: 'var(--text-secondary)',
      }}
      data-testid={containerTestId}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        className="flex items-center justify-between px-3 py-2"
        style={{ borderBottom: '1px solid var(--border-primary)' }}
      >
        <span className="text-xs font-medium">{title}</span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={(event) => {
            event.stopPropagation();
            onClearAll();
          }}
          data-testid={clearAllTestId}
        >
          Clear all
        </Button>
      </div>
      <div className="max-h-48 overflow-auto p-2 space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="rounded-lg p-2"
            style={{
              backgroundColor: item.selected ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
              border: `1px solid ${item.selected ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
            }}
          >
            {/* eslint-disable-next-line no-restricted-syntax -- full-width text-left card row acting as a toggle; <Button> enforces inline-flex centering that breaks the stacked text+summary layout */}
            <button
              type="button"
              className="w-full text-left"
              onClick={(event) => {
                event.stopPropagation();
                onSelect(item.id);
              }}
              data-testid={itemTestId}
              aria-pressed={item.selected}
            >
              <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                {item.title}
              </div>
              <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
                {item.summary}
              </div>
              {item.detail ? (
                <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {item.detail}
                </div>
              ) : null}
            </button>
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete(item.id);
                }}
                data-testid={deleteTestId}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
