import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { renderExact, type ExportFormat } from '../api/tauri';
import { Button, Select, Label } from './ui';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  source: string;
  openscadPath: string;
  workingDir?: string | null;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: 'stl', label: 'STL (3D Model)', ext: 'stl' },
  { value: 'obj', label: 'OBJ (3D Model)', ext: 'obj' },
  { value: 'amf', label: 'AMF (3D Model)', ext: 'amf' },
  { value: '3mf', label: '3MF (3D Model)', ext: '3mf' },
  { value: 'png', label: 'PNG (Image)', ext: 'png' },
  { value: 'svg', label: 'SVG (2D Vector)', ext: 'svg' },
  { value: 'dxf', label: 'DXF (2D CAD)', ext: 'dxf' },
];

export function ExportDialog({
  isOpen,
  onClose,
  source,
  openscadPath,
  workingDir,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('stl');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleExport = async () => {
    setError('');
    setIsExporting(true);

    try {
      const selectedFormat = FORMAT_OPTIONS.find((f) => f.value === format);
      if (!selectedFormat) return;

      // Open save dialog
      const savePath = await save({
        filters: [
          {
            name: selectedFormat.label,
            extensions: [selectedFormat.ext],
          },
        ],
      });

      if (!savePath) {
        // User cancelled
        setIsExporting(false);
        return;
      }

      // Render to file
      await renderExact(openscadPath, {
        source,
        format,
        out_path: savePath,
        working_dir: workingDir || undefined,
      });

      // Success - close dialog
      onClose();
    } catch (err) {
      setError(typeof err === 'string' ? err : String(err));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
    >
      <div
        className="rounded-lg shadow-xl p-6 w-96"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Export Model
        </h2>

        <div className="space-y-4">
          {/* Format selection */}
          <div>
            <Label>Export Format</Label>
            <Select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              disabled={isExporting}
            >
              {FORMAT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          </div>

          {/* Error display */}
          {error && (
            <div
              className="rounded p-3 text-sm"
              style={{
                backgroundColor: 'rgba(220, 50, 47, 0.2)',
                borderColor: 'var(--color-error)',
                borderWidth: '1px',
                borderStyle: 'solid',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <Button variant="secondary" onClick={onClose} disabled={isExporting} className="flex-1">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleExport}
              disabled={isExporting}
              className="flex-1"
            >
              {isExporting ? 'Exporting...' : 'Export'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
