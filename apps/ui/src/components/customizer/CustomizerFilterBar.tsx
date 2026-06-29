/**
 * Search + filter chip row for the customizer panel.
 *
 * Renders a free-text search field above a horizontally scrollable row of filter chips:
 * "All", an optional "Edited" chip (with a count of overridden parameters), and one chip per
 * parameter category. The chip row sits permanently under the search field.
 */

import { FilterChip, SearchInput } from '../ui';

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
}

export function CustomizerFilterBar({
  searchQuery,
  onSearchChange,
  activeFilter,
  onFilterChange,
  categories,
  editedCount,
  showEdited,
}: CustomizerFilterBarProps) {
  const showChipRow = showEdited || categories.length > 0;

  return (
    <div className="space-y-2">
      <SearchInput
        value={searchQuery}
        onChange={(event) => onSearchChange(event.target.value)}
        onClear={() => onSearchChange('')}
        placeholder="Search parameters..."
        aria-label="Search parameters"
        spellCheck={false}
        autoComplete="off"
      />

      {showChipRow && (
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-0.5"
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
