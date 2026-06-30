/**
 * Search + filter chip row for the customizer panel.
 *
 * Renders a free-text search field (with a trailing collapse button) above a horizontally
 * scrollable row of filter chips: "All", an optional "Edited" chip (with a count of overridden
 * parameters), and one chip per parameter category.
 */

import type { Ref } from 'react';
import { TbX } from 'react-icons/tb';
import { FilterChip, IconButton, SearchInput } from '../ui';

export const ALL_FILTER = 'all';
export const EDITED_FILTER = 'edited';

interface CustomizerFilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  /** Active filter: `ALL_FILTER`, `EDITED_FILTER`, or a category name. */
  activeFilter: string;
  onFilterChange: (filter: string) => void;
  categories: string[];
  editedCount: number;
  /** Whether to render the "Edited" chip (hidden when there is nothing edited). */
  showEdited: boolean;
  /** Collapse the search/filter region back to the header search icon. */
  onCollapse: () => void;
  inputRef?: Ref<HTMLInputElement>;
  /** Marks the search field untabbable while the region is collapsed. */
  inputTabbable?: boolean;
}

export function CustomizerFilterBar({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  categories,
  editedCount,
  showEdited,
  onCollapse,
  inputRef,
  inputTabbable = true,
}: CustomizerFilterBarProps) {
  const showChipRow = showEdited || categories.length > 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <SearchInput
          ref={inputRef}
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search parameters..."
          aria-label="Search parameters"
          spellCheck={false}
          autoComplete="off"
          tabIndex={inputTabbable ? undefined : -1}
          className="flex-1"
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              onCollapse();
            }
          }}
        />
        <IconButton
          variant="toolbar"
          size="md"
          onClick={onCollapse}
          aria-label="Close search"
          title="Close search"
          tooltipSide="bottom"
        >
          <TbX size={16} />
        </IconButton>
      </div>

      {showChipRow && (
        // Vertical padding keeps the active chip's accent border from being clipped by the
        // horizontal scroll container (overflow-x also clips the cross axis).
        <div
          className="flex items-center gap-1.5 overflow-x-auto px-0.5 py-1"
          role="group"
          aria-label="Filter parameters"
        >
          <FilterChip
            selected={activeFilter === ALL_FILTER}
            onClick={() => onFilterChange(ALL_FILTER)}
          >
            All
          </FilterChip>

          {showEdited && (
            <FilterChip
              selected={activeFilter === EDITED_FILTER}
              count={editedCount}
              showDot
              onClick={() => onFilterChange(EDITED_FILTER)}
            >
              Edited
            </FilterChip>
          )}

          {categories.length > 0 && (
            <span
              className="h-4 w-px shrink-0"
              style={{ backgroundColor: 'var(--border-primary)' }}
              aria-hidden="true"
            />
          )}

          {categories.map((category) => (
            <FilterChip
              key={category}
              selected={activeFilter === category}
              onClick={() => onFilterChange(category)}
            >
              {category}
            </FilterChip>
          ))}
        </div>
      )}
    </div>
  );
}
