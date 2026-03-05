import { useState } from 'react';
import { getPlatform, type ExportFormat } from '../platform';
import { RenderService, type ExportFormat as WasmExportFormat } from '../services/renderService';
import { Button, Select, Label } from './ui';
import { TbX } from 'react-icons/tb';

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  source: string;
  workingDir?: string | null;
}

const FORMAT_OPTIONS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: 'stl', label: 'STL (3D Model)', ext: 'stl' },
  { value: 'obj', label: 'OBJ (3D Model)', ext: 'obj' },
  { value: 'amf', label: 'AMF (3D Model)', ext: 'amf' },
  { value: '3mf', label: '3MF (3D Model)', ext: '3mf' },
  { value: 'svg', label: 'SVG (2D Vector)', ext: 'svg' },
  { value: 'dxf', label: 'DXF (2D CAD)', ext: 'dxf' },
];

export function ExportDialog({ isOpen, onClose, source }: ExportDialogProps) {
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

      const exportBytes = await RenderService.getInstance().exportModel(
        source,
        format as WasmExportFormat
      );

      await getPlatform().fileExport(exportBytes, `export.${selectedFormat.ext}`, [
        { name: selectedFormat.label, extensions: [selectedFormat.ext] },
      ]);

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
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}
    >
      <div
        data-testid="export-dialog"
        className="rounded-xl shadow-2xl w-full max-w-md mx-4 flex flex-col overflow-hidden"
        style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 shrink-0"
          style={{ borderBottom: '1px solid var(--border-primary)' }}
        >
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
            Export Model
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)';
              e.currentTarget.style.color = 'var(--text-primary)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = 'var(--text-tertiary)';
            }}
          >
            <TbX size={16} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
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

          {error && (
            <div
              className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm"
              style={{
                backgroundColor: 'rgba(220, 50, 47, 0.1)',
                border: '1px solid rgba(220, 50, 47, 0.3)',
                color: 'var(--color-error)',
              }}
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 px-6 py-3 shrink-0"
          style={{ borderTop: '1px solid var(--border-primary)' }}
        >
          <Button variant="primary" onClick={handleExport} disabled={isExporting}>
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
