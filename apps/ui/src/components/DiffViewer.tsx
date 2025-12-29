import { useMemo } from 'react';
import * as Diff from 'diff';

interface DiffViewerProps {
  oldCode: string;
  newCode: string;
  onAccept: () => void;
  onReject: () => void;
  isApplying?: boolean;
}

interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  lineNumber: number | null;
}

export function DiffViewer({
  oldCode,
  newCode,
  onAccept,
  onReject,
  isApplying = false,
}: DiffViewerProps) {
  // Generate unified diff
  const diffLines = useMemo(() => {
    const diff = Diff.diffLines(oldCode, newCode);
    const lines: DiffLine[] = [];
    let oldLineNum = 1;
    let newLineNum = 1;

    diff.forEach((part) => {
      const partLines = part.value.split('\n').filter((_, i, arr) => {
        // Don't include last empty line from split
        return i < arr.length - 1 || part.value.endsWith('\n');
      });

      partLines.forEach((line, i) => {
        // Skip last line if it's empty due to trailing newline
        if (i === partLines.length - 1 && line === '' && part.value.endsWith('\n')) {
          return;
        }

        if (part.added) {
          lines.push({
            type: 'add',
            content: line,
            lineNumber: newLineNum++,
          });
        } else if (part.removed) {
          lines.push({
            type: 'remove',
            content: line,
            lineNumber: oldLineNum++,
          });
        } else {
          lines.push({
            type: 'context',
            content: line,
            lineNumber: newLineNum++,
          });
          oldLineNum++;
        }
      });
    });

    return lines;
  }, [oldCode, newCode]);

  // Count changes
  const addedLines = diffLines.filter((l) => l.type === 'add').length;
  const removedLines = diffLines.filter((l) => l.type === 'remove').length;

  return (
    <div className="h-full flex flex-col bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-200">Proposed Changes</h3>
          <div className="flex items-center gap-2 text-xs">
            {addedLines > 0 && (
              <span className="bg-green-900/30 text-green-400 px-2 py-0.5 rounded">
                +{addedLines}
              </span>
            )}
            {removedLines > 0 && (
              <span className="bg-red-900/30 text-red-400 px-2 py-0.5 rounded">
                -{removedLines}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onReject}
            disabled={isApplying}
            className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-gray-200 rounded text-sm font-medium transition-colors"
          >
            Reject
          </button>
          <button
            onClick={onAccept}
            disabled={isApplying}
            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded text-sm font-medium transition-colors"
          >
            {isApplying ? 'Applying...' : 'Accept'}
          </button>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-auto font-mono text-xs">
        {diffLines.map((line, i) => {
          const bgColor =
            line.type === 'add'
              ? 'bg-green-900/20 border-l-2 border-green-500'
              : line.type === 'remove'
                ? 'bg-red-900/20 border-l-2 border-red-500'
                : 'bg-gray-900';

          const textColor =
            line.type === 'add'
              ? 'text-green-300'
              : line.type === 'remove'
                ? 'text-red-300'
                : 'text-gray-400';

          const prefix = line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' ';

          return (
            <div key={i} className={`flex ${bgColor}`}>
              <div className="w-12 flex-shrink-0 text-right px-2 py-0.5 text-gray-600 select-none">
                {line.lineNumber}
              </div>
              <div className={`flex-1 px-2 py-0.5 ${textColor} whitespace-pre`}>
                <span className="select-none mr-2">{prefix}</span>
                {line.content || '\u00A0'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
