import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { getPlatform, type ExportFormat } from '../platform';
import { exportModelWithContext } from '../services/exportService';
import { loadSettings } from '../stores/settingsStore';
import { normalizeAppError } from '../utils/notifications';
import { OPENSCAD_PROJECT_FILE_EXTENSIONS } from '../../../../packages/shared/src/openscadProjectFiles';

interface MenuBarProps {
  source: string;
  onSourceChange: (source: string) => void;
  currentFilePath: string | null;
  onFilePathChange: (path: string | null) => void;
}

const EXPORT_FORMATS: { value: ExportFormat; label: string; ext: string }[] = [
  { value: 'stl', label: 'STL (3D Model)', ext: 'stl' },
  { value: 'obj', label: 'OBJ (3D Model)', ext: 'obj' },
  { value: 'amf', label: 'AMF (3D Model)', ext: 'amf' },
  { value: '3mf', label: '3MF (3D Model)', ext: '3mf' },
  { value: 'svg', label: 'SVG (2D Vector)', ext: 'svg' },
  { value: 'dxf', label: 'DXF (2D CAD)', ext: 'dxf' },
];

const OPENSCAD_FILE_FILTERS = [
  { name: 'OpenSCAD Files', extensions: [...OPENSCAD_PROJECT_FILE_EXTENSIONS] },
];

export function MenuBar({
  source,
  onSourceChange,
  currentFilePath,
  onFilePathChange,
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
      const platform = getPlatform();
      const savePath = await platform.fileSave(source, currentFilePath, OPENSCAD_FILE_FILTERS);
      if (savePath) {
        onFilePathChange(savePath);
      }
    } catch (err) {
      console.error('Save failed:', err);
      toast.error(`Failed to save file: ${err}`);
    }
  };

  const handleOpen = async () => {
    setFileMenuOpen(false);

    try {
      const result = await getPlatform().fileOpen(OPENSCAD_FILE_FILTERS);
      if (!result) return;

      onSourceChange(result.content);
      onFilePathChange(result.path);
    } catch (err) {
      console.error('Open failed:', err);
      toast.error(`Failed to open file: ${err}`);
    }
  };

  const handleExport = async (format: ExportFormat) => {
    setFileMenuOpen(false);
    setExportMenuOpen(false);

    try {
      const formatInfo = EXPORT_FORMATS.find((f) => f.value === format);
      if (!formatInfo) return;

      const exportBytes = await exportModelWithContext({
        format,
        source,
        library: loadSettings().library,
      });

      await getPlatform().fileExport(exportBytes, `export.${formatInfo.ext}`, [
        { name: formatInfo.label, extensions: [formatInfo.ext] },
      ]);

      toast.success('Exported successfully');
    } catch (err) {
      console.error('Export failed:', err);
      toast.error(normalizeAppError(err, 'Export failed').message);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      {/* eslint-disable-next-line no-restricted-syntax -- MenuBar uses gray-700/800 Tailwind classes that don't map to theme tokens; the whole component will be redesigned when a themed MenuBar is built */}
      <button
        onClick={() => setFileMenuOpen(!fileMenuOpen)}
        className="px-3 py-1.5 hover:bg-gray-700 rounded-lg text-sm font-medium transition-colors"
      >
        File
      </button>

      {fileMenuOpen && (
        <div className="absolute top-full left-0 mt-1 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-50">
          {/* eslint-disable-next-line no-restricted-syntax -- menu item; same gray color scheme as trigger above */}
          <button
            onClick={handleOpen}
            className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm flex items-center justify-between"
          >
            <span>Open...</span>
            <span className="text-gray-500 text-xs">⌘O</span>
          </button>

          {/* eslint-disable-next-line no-restricted-syntax -- menu item; same gray color scheme as trigger above */}
          <button
            onClick={handleSave}
            className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm flex items-center justify-between"
          >
            <span>Save{currentFilePath ? '' : ' As...'}</span>
            <span className="text-gray-500 text-xs">⌘S</span>
          </button>

          <div className="border-t border-gray-700 my-1"></div>

          <div className="relative">
            {/* eslint-disable-next-line no-restricted-syntax -- submenu trigger; uses onMouseEnter hover open pattern that <Button> doesn't handle */}
            <button
              onMouseEnter={() => setExportMenuOpen(true)}
              className="w-full text-left px-4 py-2 hover:bg-gray-700 text-sm flex items-center justify-between"
            >
              <span>Export</span>
              <span className="text-gray-500">›</span>
            </button>

            {exportMenuOpen && (
              <div
                className="absolute left-full top-0 ml-1 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-lg"
                onMouseLeave={() => setExportMenuOpen(false)}
              >
                {EXPORT_FORMATS.map((format) => (
                  // eslint-disable-next-line no-restricted-syntax -- export format menu item; same gray scheme, can't use <Button> with .map() key on a Fragment wrapper
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
