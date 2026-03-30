import { useState } from 'react';
import type { ReactNode } from 'react';
import { TbChevronDown, TbChevronRight } from 'react-icons/tb';

interface ToolPanelProps {
  label: string;
  children: ReactNode;
  defaultExpanded?: boolean;
}

export function ToolPanel({ label, children, defaultExpanded = true }: ToolPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div
      className="absolute bottom-3 right-3 z-40 flex max-h-[calc(100%-1.5rem)] w-[280px] flex-col rounded-lg overflow-hidden"
      style={{
        backgroundColor: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
      }}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* eslint-disable-next-line no-restricted-syntax -- full-width toggle header with chevron; <Button> doesn't support w-full + text-left + variable icon-slot layout without className conflicts */}
      <button
        type="button"
        className="flex items-center gap-2 w-full px-3 py-2 text-left"
        style={{ color: 'var(--text-primary)' }}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        {expanded ? <TbChevronDown size={14} /> : <TbChevronRight size={14} />}
        <span className="text-xs font-medium">{label}</span>
      </button>

      {expanded && (
        <div
          className="min-h-0 flex flex-col gap-3 overflow-hidden px-3 pb-3 pt-2"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
