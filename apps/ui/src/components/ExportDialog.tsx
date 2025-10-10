import { useState } from 'react';
import { save } from '@tauri-apps/plugin-dialog';
import { renderExact, type ExportFormat } from '../api/tauri';

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

export function ExportDialog({ isOpen, onClose, source, openscadPath, workingDir }: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>('stl');
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleExport = async () => {
    setError('');
    setIsExporting(true);

    try {
      const selectedFormat = FORMAT_OPTIONS.find(f => f.value === format);
      if (!selectedFormat) return;

      // Open save dialog
      const savePath = await save({
        filters: [{
          name: selectedFormat.label,
          extensions: [selectedFormat.ext]
        }]
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg shadow-xl p-6 w-96">
        <h2 className="text-xl font-semibold text-white mb-4">Export Model</h2>

        <div className="space-y-4">
          {/* Format selection */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Export Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value as ExportFormat)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2.5 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 cursor-pointer appearance-none bg-[url('data:image/svg+xml;charset=UTF-8,%3csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3e%3cpolyline points=%226 9 12 15 18 9%22%3e%3c/polyline%3e%3c/svg%3e')] bg-[length:1.5em_1.5em] bg-[right_0.5em_center] bg-no-repeat pr-10"
              disabled={isExporting}
            >
              {FORMAT_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} className="bg-gray-700">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Error display */}
          {error && (
            <div className="bg-red-900/20 border border-red-800 rounded p-3 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={onClose}
              disabled={isExporting}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={isExporting}
              className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white disabled:opacity-50"
            >
              {isExporting ? 'Exporting...' : 'Export'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
