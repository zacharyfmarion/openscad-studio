import { useState, useRef, useEffect } from 'react';
import { save, open } from '@tauri-apps/plugin-dialog';
import { renderExact, type ExportFormat } from '../api/tauri';

interface MenuBarProps {
  source: string;
  onSourceChange: (source: string) => void;
  currentFilePath: string | null;
  onFilePathChange: (path: string | null) => void;
  openscadPath: string;
}

const EXPORT_FORMATS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: 'stl', label: 'STL (3D Model)', ext: 'stl' },
  { value: 'obj', label: 'OBJ (3D Model)', ext: 'obj' },
  { value: 'amf', label: 'AMF (3D Model)', ext: 'amf' },
  { value: '3mf', label: '3MF (3D Model)', ext: '3mf' },
  { value: 'png', label: 'PNG (Image)', ext: 'png' },
  { value: 'svg', label: 'SVG (2D Vector)', ext: 'svg' },
  { value: 'dxf', label: 'DXF (2D CAD)', ext: 'dxf' },
];

export function MenuBar({
  source,
  onSourceChange,
  currentFilePath,
  onFilePathChange,
  openscadPath,
}: MenuBarProps) {
  const [fileMenuOpen, setFileMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setFileMenuOpen(false);
        setExportMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSave = async () => {
    setFileMenuOpen(false);

    try {
      let savePath = currentFilePath;

      if (!savePath) {
        // Show save dialog if no current file
        savePath = await save({
          filters: [
            {
              name: 'OpenSCAD Files',
              extensions: ['scad'],
            },
          ],
        });

        if (!savePath) return; // User cancelled
      }

      // Write file using Tauri's fs
      const { writeTextFile } = await import('@tauri-apps/plugin-fs');
      await writeTextFile(savePath, source);
      onFilePathChange(savePath);
    } catch (err) {
      console.error('Save failed:', err);
      alert(`Failed to save file: ${err}`);
    }
  };

  const handleOpen = async () => {
    setFileMenuOpen(false);

    try {
      const selected = await open({
        filters: [
          {
            name: 'OpenSCAD Files',
            extensions: ['scad'],
          },
        ],
        multiple: false,
      });

      if (!selected) return; // User cancelled

      const filePath =
        typeof selected === 'string' ? selected : (selected as { path: string }).path;

      // Read file using Tauri's fs
      const { readTextFile } = await import('@tauri-apps/plugin-fs');
      const contents = await readTextFile(filePath);

      onSourceChange(contents);
      onFilePathChange(filePath);
    } catch (err) {
      console.error('Open failed:', err);
      alert(`Failed to open file: ${err}`);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    setFileMenuOpen(false);
    setExportMenuOpen(false);

    try {
      const formatInfo = EXPORT_FORMATS.find((f) => f.value === format);
      if (!formatInfo) return;

      const savePath = await save({
        filters: [
          {
            name: formatInfo.label,
            extensions: [formatInfo.ext],
          },
        ],
      });

      if (!savePath) return; // User cancelled

      await renderExact(openscadPath, {
        source,
        format,
        out_path: savePath,
      });

      alert(`Exported successfully to ${savePath}`);
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err}`);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => setFileMenuOpen(!fileMenuOpen)}
        className="px-3 py-1.5 hover:bg-gray-700 rounded text-sm font-medium transition-colors"
      >
        File
      </button>

      {fileMenuOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded shadow-lg z-50">
          <button
            onClick={handleOpen}
            className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm flex items-center justify-between"
          >
            <span>Open...</span>
            <span className="text-gray-500 text-xs">⌘O</span>
          </button>

          <button
            onClick={handleSave}
            className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm flex items-center justify-between"
          >
            <span>Save{currentFilePath ? '' : ' As...'}</span>
            <span className="text-gray-500 text-xs">⌘S</span>
          </button>

          <div className="border-t border-gray-700 my-1"></div>

          <div className="relative">
            <button
              onMouseEnter={() => setExportMenuOpen(true)}
              className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm flex items-center justify-between"
            >
              <span>Export</span>
              <span className="text-gray-500">›</span>
            </button>

            {exportMenuOpen && (
              <div
                className="absolute left-full top-0 ml-1 w-48 bg-gray-800 border border-gray-700 rounded shadow-lg"
                onMouseLeave={() => setExportMenuOpen(false)}
              >
                {EXPORT_FORMATS.map((format) => (
                  <button
                    key={format.value}
                    onClick={() => handleExport(format.value)}
                    className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm"
                  >
                    {format.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
